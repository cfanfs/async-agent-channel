import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { RelayServer } from "./index.js";
import { generateUserId } from "./token.js";
import { deriveKeyId, signRequest } from "../channel/server/sign.js";

const TEST_DB_URL = process.env.AAC_TEST_DATABASE_URL ?? "postgresql://localhost:5432/aac_test";
const TEST_PORT = 19100;

// Check if PostgreSQL is reachable before running tests
let pgAvailable = false;
try {
  const client = new pg.Client({ connectionString: TEST_DB_URL });
  await client.connect();
  await client.end();
  pgAvailable = true;
} catch {
  // PostgreSQL not available, tests will be skipped
}

describe.skipIf(!pgAvailable)("relay server", () => {
  let server: RelayServer;
  let baseUrl: string;
  let adminUserId: string;

  function makeSignedHeaders(
    method: string,
    path: string,
    body: string,
    userId: string
  ): Record<string, string> {
    const { keyId, timestamp, signature } = signRequest(method, path, body, userId);
    return {
      "Content-Type": "application/json",
      "x-aac-key-id": keyId,
      "x-aac-timestamp": timestamp,
      "x-aac-signature": signature,
    };
  }

  async function req(
    method: string,
    path: string,
    opts?: { body?: unknown; userId?: string }
  ): Promise<{ status: number; data: any }> {
    const body = opts?.body ? JSON.stringify(opts.body) : "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (opts?.userId) {
      Object.assign(headers, makeSignedHeaders(method, path, body, opts.userId));
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: method !== "GET" ? body : undefined,
    });

    const data = await res.json();
    return { status: res.status, data };
  }

  beforeAll(async () => {
    server = new RelayServer({
      port: TEST_PORT,
      host: "127.0.0.1",
      db: { connectionString: TEST_DB_URL },
    });
    await server.start();
    baseUrl = `http://127.0.0.1:${TEST_PORT}`;

    // Bootstrap admin
    adminUserId = generateUserId();
    const store = server.getStore();
    await store.addMember(deriveKeyId(adminUserId), adminUserId);
    await store.activateMember(deriveKeyId(adminUserId), "admin");
  });

  afterAll(async () => {
    const store = server.getStore();
    try {
      await store["pool"].query("DROP TABLE IF EXISTS messages");
      await store["pool"].query("DROP TABLE IF EXISTS members");
    } catch { /* ignore */ }
    await server.stop();
  });

  it("GET /health returns ok", async () => {
    const { status, data } = await req("GET", "/health");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("rejects unauthenticated request to protected route", async () => {
    const { status } = await req("GET", "/api/v1/members");
    expect(status).toBe(401);
  });

  it("lists members (authenticated)", async () => {
    const { status, data } = await req("GET", "/api/v1/members", {
      userId: adminUserId,
    });
    expect(status).toBe(200);
    expect(data.members).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "admin" })])
    );
  });

  describe("invite + join flow", () => {
    let invitedUserId: string;

    it("admin invites a new member", async () => {
      const { status, data } = await req("POST", "/api/v1/members/invite", {
        userId: adminUserId,
      });
      expect(status).toBe(201);
      expect(data.user_id).toBeTruthy();
      invitedUserId = data.user_id;
    });

    it("new member joins with user_id", async () => {
      const { status, data } = await req("POST", "/api/v1/members/join", {
        body: { user_id: invitedUserId, name: "bob" },
      });
      expect(status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.name).toBe("bob");
    });

    it("cannot join again with same invite", async () => {
      const { status } = await req("POST", "/api/v1/members/join", {
        body: { user_id: invitedUserId, name: "bob2" },
      });
      expect(status).toBe(404);
    });

    it("rejects duplicate name on join", async () => {
      // Create another invite
      const { data } = await req("POST", "/api/v1/members/invite", {
        userId: adminUserId,
      });
      // Try to join with same name as existing member "bob"
      const { status, data: joinData } = await req("POST", "/api/v1/members/join", {
        body: { user_id: data.user_id, name: "bob" },
      });
      expect(status).toBe(409);
      expect(joinData.error).toContain("already taken");
    });
  });

  describe("messaging", () => {
    let bobUserId: string;

    beforeAll(async () => {
      const { data } = await req("POST", "/api/v1/members/invite", {
        userId: adminUserId,
      });
      bobUserId = data.user_id;
      await req("POST", "/api/v1/members/join", {
        body: { user_id: bobUserId, name: "bob-msg" },
      });
    });

    it("admin sends a message to bob", async () => {
      const { status, data } = await req("POST", "/api/v1/messages", {
        userId: adminUserId,
        body: { to: "bob-msg", subject: "hello", body: "hi bob" },
      });
      expect(status).toBe(201);
      expect(data.id).toBeTruthy();
    });

    it("bob fetches messages (non-destructive)", async () => {
      const { status, data } = await req("GET", "/api/v1/messages", {
        userId: bobUserId,
      });
      expect(status).toBe(200);
      expect(data.messages).toHaveLength(1);
      expect(data.messages[0].from).toBe("admin");
      expect(data.messages[0].subject).toBe("hello");
      expect(data.messages[0].body).toBe("hi bob");
    });

    it("bob fetches again — same messages (not yet acked)", async () => {
      const { status, data } = await req("GET", "/api/v1/messages", {
        userId: bobUserId,
      });
      expect(status).toBe(200);
      expect(data.messages).toHaveLength(1);
    });

    it("bob acks the message", async () => {
      // Fetch to get the ID
      const { data: fetchData } = await req("GET", "/api/v1/messages", {
        userId: bobUserId,
      });
      const msgId = fetchData.messages[0].id;

      const { status } = await req("POST", `/api/v1/messages/${msgId}/ack`, {
        userId: bobUserId,
      });
      expect(status).toBe(200);
    });

    it("bob gets empty after ack", async () => {
      const { status, data } = await req("GET", "/api/v1/messages", {
        userId: bobUserId,
      });
      expect(status).toBe(200);
      expect(data.messages).toHaveLength(0);
    });
  });

  it("returns 404 for unknown routes", async () => {
    const { status } = await req("GET", "/api/v1/unknown", {
      userId: adminUserId,
    });
    expect(status).toBe(404);
  });
});

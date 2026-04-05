import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ServerChannel } from "./index.js";
import { HEADER_KEY_ID, HEADER_TIMESTAMP, HEADER_SIGNATURE } from "./sign.js";

const TEST_USER_ID = "dGVzdC11c2VyLWlkLWZvci1jaGFubmVs";
const TEST_SERVER = "http://localhost:9999";

describe("ServerChannel", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("send", () => {
    it("POSTs a signed message to the server", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;

      globalThis.fetch = vi.fn(async (url: any, init?: any) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(JSON.stringify({ id: "msg-1" }), { status: 201 });
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      await ch.send("bob", "hello", "hi bob");

      expect(capturedUrl).toBe(`${TEST_SERVER}/api/v1/messages`);
      expect(capturedInit?.method).toBe("POST");

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers[HEADER_KEY_ID]).toBeTruthy();
      expect(headers[HEADER_TIMESTAMP]).toBeTruthy();
      expect(headers[HEADER_SIGNATURE]).toBeTruthy();

      const body = JSON.parse(capturedInit?.body as string);
      expect(body.to).toBe("bob");
      expect(body.subject).toBe("hello");
      expect(body.body).toBe("hi bob");
    });

    it("throws on server error", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: "fail" }), { status: 500 });
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      await expect(ch.send("bob", "test", "body")).rejects.toThrow("Server rejected message: 500");
    });
  });

  describe("fetch", () => {
    it("returns messages from the server", async () => {
      const now = Date.now();
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "m1", from: "bob", to: "alice", subject: "hi", body: "hello", timestamp: now },
            ],
          }),
          { status: 200 }
        );
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      const msgs = await ch.fetch();

      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe("m1");
      expect(msgs[0].from).toBe("bob");
      expect(msgs[0].subject).toBe("hi");
      expect(msgs[0].status).toBe("unread");
      expect(msgs[0].timestamp.getTime()).toBe(now);
    });

    it("accepts numeric timestamps serialized as strings", async () => {
      const now = Date.now();
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "m1", from: "bob", to: "alice", subject: "hi", body: "hello", timestamp: String(now) },
            ],
          }),
          { status: 200 }
        );
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      const msgs = await ch.fetch();

      expect(msgs).toHaveLength(1);
      expect(msgs[0].timestamp.getTime()).toBe(now);
    });

    it("returns empty array when no messages", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      const msgs = await ch.fetch();
      expect(msgs).toHaveLength(0);
    });

    it("throws on server error", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response("error", { status: 401 });
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      await expect(ch.fetch()).rejects.toThrow("Server fetch failed: 401");
    });

    it("throws on invalid timestamps", async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            messages: [
              { id: "m1", from: "bob", to: "alice", subject: "hi", body: "hello", timestamp: "not-a-number" },
            ],
          }),
          { status: 200 }
        );
      }) as any;

      const ch = new ServerChannel(TEST_SERVER, "alice", TEST_USER_ID);
      await expect(ch.fetch()).rejects.toThrow("Invalid server message timestamp");
    });
  });
});

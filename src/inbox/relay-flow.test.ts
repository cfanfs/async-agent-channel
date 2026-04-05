import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ServerChannel } from "../channel/server/index.js";
import { acknowledgeStoredMessage } from "./ack.js";
import { MessageStore } from "../store/index.js";

const TEST_SERVER = "http://relay.example.com";
const TEST_USER_ID = "test-user-id";

vi.mock("../config.js", () => ({
  loadConfig: vi.fn(() => ({
    identity: { name: "me", email: "me@example.com" },
    workspace: { outbound: ["/tmp/out"], inbound: "/tmp/in" },
    servers: { default: { url: TEST_SERVER, name: "me" } },
    contacts: {},
  })),
  getServersMap: vi.fn((cfg: { servers?: Record<string, unknown> }) => cfg.servers ?? {}),
  getServerConfig: vi.fn((cfg: { servers: Record<string, { url: string; name: string }> }, group: string) => cfg.servers[group]),
  getServerUserId: vi.fn(async () => TEST_USER_ID),
}));

describe("relay inbox flow", () => {
  let store: MessageStore;
  let tmpDir: string;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "aac-relay-flow-"));
    store = new MessageStore(join(tmpDir, "test.db"));
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("keeps relay messages visible locally until inbox ack", async () => {
    const now = Date.now();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === `${TEST_SERVER}/api/v1/messages` && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: "relay-1",
                from: "alice",
                to: "me",
                subject: "hello",
                body: "hi bob",
                timestamp: String(now),
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (url === `${TEST_SERVER}/api/v1/messages/relay-1/ack` && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      throw new Error(`Unexpected fetch call: ${init?.method ?? "GET"} ${url}`);
    });
    globalThis.fetch = fetchMock as any;

    const channel = new ServerChannel(TEST_SERVER, "me", TEST_USER_ID);
    const messages = await channel.fetch();
    expect(messages).toHaveLength(1);

    for (const msg of messages) {
      msg.from = `${msg.from}@default`;
      msg.channel = "server";
      msg.serverGroup = "default";
      expect(store.insert(msg)).toBe(true);
    }

    const pending = store.list();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("relay-1");
    expect(pending[0].channel).toBe("server");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await acknowledgeStoredMessage(store, "relay-1")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(`${TEST_SERVER}/api/v1/messages/relay-1/ack`);
    expect(store.list()).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acknowledgeStoredMessage } from "./ack.js";
import { MessageStore } from "../store/index.js";
import type { Message } from "../message/types.js";

const ackMock = vi.fn();

vi.mock("../config.js", () => ({
  loadConfig: vi.fn(() => ({
    identity: { name: "me", email: "me@example.com" },
    workspace: { outbound: ["/tmp/out"], inbound: "/tmp/in" },
    servers: { default: { url: "http://relay.example.com", name: "me" } },
    contacts: {},
  })),
  getServersMap: vi.fn((cfg: { servers?: Record<string, unknown> }) => cfg.servers ?? {}),
  getServerConfig: vi.fn((cfg: { servers: Record<string, { url: string; name: string }> }, group: string) => cfg.servers[group]),
  getServerUserId: vi.fn(async () => "test-user-id"),
}));

vi.mock("../channel/server/index.js", () => ({
  ServerChannel: class {
    async ack(id: string): Promise<void> {
      await ackMock(id);
    }
  },
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    from: "alice@example.com",
    to: "me@example.com",
    subject: "Test",
    body: "Hello",
    timestamp: new Date("2025-01-01T00:00:00Z"),
    status: "unread",
    channel: "email",
    serverGroup: null,
    ...overrides,
  };
}

describe("acknowledgeStoredMessage", () => {
  let store: MessageStore;
  let tmpDir: string;

  beforeEach(() => {
    ackMock.mockReset();
    ackMock.mockResolvedValue(undefined);
    tmpDir = mkdtempSync(join(tmpdir(), "aac-ack-test-"));
    store = new MessageStore(join(tmpDir, "test.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("acks local email messages without calling relay ack", async () => {
    store.insert(makeMessage({ id: "email-1" }));

    const ok = await acknowledgeStoredMessage(store, "email-1");

    expect(ok).toBe(true);
    expect(ackMock).not.toHaveBeenCalled();
    expect(store.get("email-1")!.status).toBe("acked");
  });

  it("acks relay messages remotely before updating local status", async () => {
    store.insert(
      makeMessage({
        id: "server-1",
        from: "alice@default",
        to: "me",
        channel: "server",
        serverGroup: "default",
      })
    );

    const ok = await acknowledgeStoredMessage(store, "server-1");

    expect(ok).toBe(true);
    expect(ackMock).toHaveBeenCalledWith("server-1");
    expect(store.get("server-1")!.status).toBe("acked");
  });

  it("supports legacy relay messages without stored group metadata", async () => {
    store.insert(
      makeMessage({
        id: "legacy-1",
        from: "alice@default",
        to: "me",
        channel: undefined,
        serverGroup: null,
      })
    );

    const ok = await acknowledgeStoredMessage(store, "legacy-1");

    expect(ok).toBe(true);
    expect(ackMock).toHaveBeenCalledWith("legacy-1");
    expect(store.get("legacy-1")!.status).toBe("acked");
  });

  it("does not mark the message acked when relay ack fails", async () => {
    ackMock.mockRejectedValue(new Error("Server ack failed: 500 boom"));
    store.insert(
      makeMessage({
        id: "server-fail",
        from: "alice@default",
        to: "me",
        channel: "server",
        serverGroup: "default",
      })
    );

    await expect(
      acknowledgeStoredMessage(store, "server-fail")
    ).rejects.toThrow("Server ack failed: 500 boom");
    expect(store.get("server-fail")!.status).toBe("unread");
  });
});

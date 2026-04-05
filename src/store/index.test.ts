import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MessageStore } from "./index.js";
import type { Message } from "../message/types.js";

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Date.now()}`,
    from: "alice@example.com",
    to: "bob@example.com",
    subject: "Test",
    body: "Hello",
    timestamp: new Date("2025-01-01T00:00:00Z"),
    status: "unread",
    ...overrides,
  };
}

describe("MessageStore", () => {
  let store: MessageStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "aac-test-"));
    store = new MessageStore(join(tmpDir, "test.db"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inserts and retrieves a message", () => {
    const msg = makeMessage({ id: "msg-1" });
    expect(store.insert(msg)).toBe(true);

    const retrieved = store.get("msg-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.from).toBe("alice@example.com");
    expect(retrieved!.subject).toBe("Test");
    expect(retrieved!.body).toBe("Hello");
    expect(retrieved!.status).toBe("unread");
  });

  it("deduplicates by id", () => {
    const msg = makeMessage({ id: "msg-dup" });
    expect(store.insert(msg)).toBe(true);
    expect(store.insert(msg)).toBe(false);
  });

  it("lists non-acked messages", () => {
    store.insert(makeMessage({ id: "msg-a", status: "unread" }));
    store.insert(makeMessage({ id: "msg-b", status: "read" }));
    store.insert(makeMessage({ id: "msg-c", status: "acked" }));

    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.id).sort()).toEqual(["msg-a", "msg-b"]);
  });

  it("filters by sender", () => {
    store.insert(makeMessage({ id: "msg-1", from: "alice@example.com" }));
    store.insert(makeMessage({ id: "msg-2", from: "bob@example.com" }));

    const list = store.list("alice@example.com");
    expect(list).toHaveLength(1);
    expect(list[0].from).toBe("alice@example.com");
  });

  it("updates message status", () => {
    store.insert(makeMessage({ id: "msg-1" }));

    expect(store.updateStatus("msg-1", "acked")).toBe(true);
    expect(store.get("msg-1")!.status).toBe("acked");

    // Acked messages should not appear in list
    expect(store.list()).toHaveLength(0);
  });

  it("returns false for updating nonexistent message", () => {
    expect(store.updateStatus("nonexistent", "acked")).toBe(false);
  });

  it("returns undefined for nonexistent message", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("preserves timestamp as Date", () => {
    const ts = new Date("2025-06-15T12:30:00Z");
    store.insert(makeMessage({ id: "msg-ts", timestamp: ts }));

    const retrieved = store.get("msg-ts");
    expect(retrieved!.timestamp.getTime()).toBe(ts.getTime());
  });

  it("persists channel metadata", () => {
    store.insert(
      makeMessage({
        id: "msg-server",
        from: "alice@default",
        channel: "server",
        serverGroup: "default",
      })
    );

    const retrieved = store.get("msg-server");
    expect(retrieved!.channel).toBe("server");
    expect(retrieved!.serverGroup).toBe("default");
  });
});

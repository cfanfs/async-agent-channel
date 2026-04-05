import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { materializeIncomingMessage } from "./materialize.js";
import { encodeMessagePayload } from "../message/payload.js";
import type { Message } from "../message/types.js";

describe("materializeIncomingMessage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "aac-materialize-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores attachments under inbound/{msg_id}", () => {
    const message: Message = {
      id: "msg-1",
      from: "alice",
      to: "bob",
      subject: "hello",
      body: encodeMessagePayload("body text", [
        { name: "../notes?.md", content: Buffer.from("# hi") },
      ]),
      timestamp: new Date("2025-01-01T00:00:00Z"),
      status: "unread",
    };

    const result = materializeIncomingMessage(message, {
      outbound: [join(tmpDir, "out")],
      inbound: join(tmpDir, "received"),
    });

    expect(result.body).toBe("body text");
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments![0].path).toBe(
      join(tmpDir, "received", "msg-1", "notes_.md")
    );
    expect(readFileSync(result.attachments![0].path, "utf-8")).toBe("# hi");
  });
});

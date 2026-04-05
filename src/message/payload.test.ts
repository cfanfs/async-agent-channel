import { describe, it, expect } from "vitest";
import {
  decodeMessagePayload,
  encodeMessagePayload,
  sanitizeAttachmentName,
} from "./payload.js";

describe("message payload", () => {
  it("keeps plain text messages unchanged", () => {
    const decoded = decodeMessagePayload("hello");
    expect(decoded.body).toBe("hello");
    expect(decoded.attachments).toEqual([]);
  });

  it("encodes and decodes attachments separately from the body", () => {
    const encoded = encodeMessagePayload("hello", [
      { name: "notes.md", content: Buffer.from("# hi") },
    ]);

    const decoded = decodeMessagePayload(encoded);
    expect(decoded.body).toBe("hello");
    expect(decoded.attachments).toHaveLength(1);
    expect(decoded.attachments[0].name).toBe("notes.md");
    expect(decoded.attachments[0].content.toString("utf-8")).toBe("# hi");
  });

  it("sanitizes attachment names", () => {
    expect(sanitizeAttachmentName("../weird name?.txt")).toBe("weird_name_.txt");
  });
});

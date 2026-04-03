import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Workspace } from "./index.js";

describe("Workspace", () => {
  let tmpDir: string;
  let outbound1: string;
  let outbound2: string;
  let inbound: string;
  let ws: Workspace;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "aac-ws-test-"));
    outbound1 = join(tmpDir, "out1");
    outbound2 = join(tmpDir, "out2");
    inbound = join(tmpDir, "in");
    mkdirSync(outbound1, { recursive: true });
    mkdirSync(outbound2, { recursive: true });
    mkdirSync(inbound, { recursive: true });

    ws = new Workspace({
      outbound: [outbound1, outbound2],
      inbound,
    });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("path validation", () => {
    it("accepts paths within outbound directories", () => {
      const path = join(outbound1, "file.txt");
      expect(ws.isOutboundPath(path)).toBe(true);
      expect(ws.assertOutbound(path)).toBe(path);
    });

    it("accepts paths in second outbound directory", () => {
      const path = join(outbound2, "data.json");
      expect(ws.isOutboundPath(path)).toBe(true);
    });

    it("rejects paths outside outbound directories", () => {
      const path = join(tmpDir, "secret.txt");
      expect(ws.isOutboundPath(path)).toBe(false);
      expect(() => ws.assertOutbound(path)).toThrow("Security");
    });

    it("accepts paths within inbound directory", () => {
      const path = join(inbound, "msg.txt");
      expect(ws.isInboundPath(path)).toBe(true);
      expect(ws.assertInbound(path)).toBe(path);
    });

    it("rejects paths outside inbound directory", () => {
      const path = join(tmpDir, "elsewhere.txt");
      expect(ws.isInboundPath(path)).toBe(false);
      expect(() => ws.assertInbound(path)).toThrow("Security");
    });

    it("prevents path traversal", () => {
      const path = join(outbound1, "..", "secret.txt");
      expect(ws.isOutboundPath(path)).toBe(false);
    });
  });

  describe("file operations", () => {
    it("lists files across outbound workspaces", () => {
      writeFileSync(join(outbound1, "a.txt"), "hello");
      mkdirSync(join(outbound1, "sub"));
      writeFileSync(join(outbound1, "sub", "b.txt"), "world");
      writeFileSync(join(outbound2, "c.txt"), "data");

      const groups = ws.listOutboundFiles();
      expect(groups).toHaveLength(2);
      expect(groups[0].files.sort()).toEqual(["a.txt", "sub/b.txt"]);
      expect(groups[1].files).toEqual(["c.txt"]);
    });

    it("reads files from outbound workspace", () => {
      writeFileSync(join(outbound1, "hello.txt"), "content here");
      const content = ws.readOutboundFile(join(outbound1, "hello.txt"));
      expect(content).toBe("content here");
    });

    it("rejects reading files outside outbound", () => {
      writeFileSync(join(tmpDir, "secret.txt"), "secret");
      expect(() => ws.readOutboundFile(join(tmpDir, "secret.txt"))).toThrow(
        "Security"
      );
    });

    it("writes files to inbound workspace", () => {
      const path = join(inbound, "received.txt");
      ws.writeInboundFile(path, "message content");

      const { readFileSync } = require("node:fs");
      expect(readFileSync(path, "utf-8")).toBe("message content");
    });

    it("rejects writing files outside inbound", () => {
      const path = join(tmpDir, "outside.txt");
      expect(() => ws.writeInboundFile(path, "nope")).toThrow("Security");
    });
  });

  describe("ensureDirs", () => {
    it("creates directories that do not exist", () => {
      const newOut = join(tmpDir, "new-out");
      const newIn = join(tmpDir, "new-in");
      const ws2 = new Workspace({ outbound: [newOut], inbound: newIn });
      ws2.ensureDirs();

      const { existsSync } = require("node:fs");
      expect(existsSync(newOut)).toBe(true);
      expect(existsSync(newIn)).toBe(true);
    });
  });
});

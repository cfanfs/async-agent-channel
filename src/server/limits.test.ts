import { describe, it, expect } from "vitest";
import { parsePositiveIntEnv, utf8ByteLength } from "./limits.js";

describe("parsePositiveIntEnv", () => {
  it("returns fallback when unset", () => {
    expect(parsePositiveIntEnv(undefined, 123)).toBe(123);
  });

  it("returns fallback for invalid values", () => {
    expect(parsePositiveIntEnv("abc", 123)).toBe(123);
    expect(parsePositiveIntEnv("0", 123)).toBe(123);
    expect(parsePositiveIntEnv("-1", 123)).toBe(123);
  });

  it("returns parsed value for positive integers", () => {
    expect(parsePositiveIntEnv("4096", 123)).toBe(4096);
  });
});

describe("utf8ByteLength", () => {
  it("counts bytes instead of characters", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("你")).toBe(3);
    expect(utf8ByteLength("你你")).toBe(6);
  });
});

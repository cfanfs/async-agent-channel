import { describe, it, expect } from "vitest";
import { generateUserId } from "./token.js";

describe("generateUserId", () => {
  it("returns a base64url string", () => {
    const id = generateUserId();
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("has sufficient length (32 bytes = 43 chars in base64url)", () => {
    const id = generateUserId();
    expect(id.length).toBeGreaterThanOrEqual(42);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateUserId()));
    expect(ids.size).toBe(10);
  });
});

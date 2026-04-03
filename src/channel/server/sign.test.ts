import { describe, it, expect } from "vitest";
import {
  deriveKeyId,
  buildSigningString,
  computeSignature,
  signRequest,
  verifySignature,
} from "./sign.js";

const TEST_USER_ID = "dGVzdC11c2VyLWlkLWZvci1zaWduaW5n";
const TEST_NONCE = "test-nonce-12345";

describe("deriveKeyId", () => {
  it("returns 16 hex characters", () => {
    const keyId = deriveKeyId(TEST_USER_ID);
    expect(keyId).toHaveLength(16);
    expect(keyId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(deriveKeyId(TEST_USER_ID)).toBe(deriveKeyId(TEST_USER_ID));
  });

  it("differs for different user IDs", () => {
    expect(deriveKeyId("user-a")).not.toBe(deriveKeyId("user-b"));
  });
});

describe("buildSigningString", () => {
  it("joins parts with newlines including nonce", () => {
    const result = buildSigningString("POST", "/api/v1/messages", "2026-04-03T00:00:00Z", TEST_NONCE, '{"to":"bob"}');
    expect(result).toBe(`POST\n/api/v1/messages\n2026-04-03T00:00:00Z\n${TEST_NONCE}\n{"to":"bob"}`);
  });
});

describe("computeSignature", () => {
  it("returns a hex string", () => {
    const sig = computeSignature("test-data", TEST_USER_ID);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const sig1 = computeSignature("data", TEST_USER_ID);
    const sig2 = computeSignature("data", TEST_USER_ID);
    expect(sig1).toBe(sig2);
  });

  it("differs for different data", () => {
    const sig1 = computeSignature("data-a", TEST_USER_ID);
    const sig2 = computeSignature("data-b", TEST_USER_ID);
    expect(sig1).not.toBe(sig2);
  });
});

describe("signRequest", () => {
  it("returns keyId, timestamp, nonce, and signature", () => {
    const result = signRequest("POST", "/api/v1/messages", '{"to":"bob"}', TEST_USER_ID);
    expect(result.keyId).toHaveLength(16);
    expect(result.timestamp).toBeTruthy();
    expect(result.nonce).toBeTruthy();
    expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique nonces", () => {
    const r1 = signRequest("GET", "/path", "", TEST_USER_ID);
    const r2 = signRequest("GET", "/path", "", TEST_USER_ID);
    expect(r1.nonce).not.toBe(r2.nonce);
  });
});

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    const timestamp = new Date().toISOString();
    const body = '{"to":"bob"}';
    const sigStr = buildSigningString("POST", "/api/v1/messages", timestamp, TEST_NONCE, body);
    const sig = computeSignature(sigStr, TEST_USER_ID);

    expect(
      verifySignature("POST", "/api/v1/messages", timestamp, TEST_NONCE, body, TEST_USER_ID, sig)
    ).toBe(true);
  });

  it("rejects wrong signature", () => {
    const timestamp = new Date().toISOString();
    expect(
      verifySignature("POST", "/path", timestamp, TEST_NONCE, "body", TEST_USER_ID, "bad-signature-value-0000000000000000000000000000000000")
    ).toBe(false);
  });

  it("rejects expired timestamp", () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const body = "test";
    const sigStr = buildSigningString("GET", "/path", old, TEST_NONCE, body);
    const sig = computeSignature(sigStr, TEST_USER_ID);

    expect(
      verifySignature("GET", "/path", old, TEST_NONCE, body, TEST_USER_ID, sig)
    ).toBe(false);
  });

  it("rejects tampered body", () => {
    const timestamp = new Date().toISOString();
    const sigStr = buildSigningString("POST", "/path", timestamp, TEST_NONCE, "original");
    const sig = computeSignature(sigStr, TEST_USER_ID);

    expect(
      verifySignature("POST", "/path", timestamp, TEST_NONCE, "tampered", TEST_USER_ID, sig)
    ).toBe(false);
  });

  it("rejects tampered nonce", () => {
    const timestamp = new Date().toISOString();
    const body = "test";
    const sigStr = buildSigningString("POST", "/path", timestamp, TEST_NONCE, body);
    const sig = computeSignature(sigStr, TEST_USER_ID);

    expect(
      verifySignature("POST", "/path", timestamp, "wrong-nonce", body, TEST_USER_ID, sig)
    ).toBe(false);
  });

  it("rejects invalid timestamp format", () => {
    expect(
      verifySignature("GET", "/path", "not-a-date", TEST_NONCE, "", TEST_USER_ID, "a".repeat(64))
    ).toBe(false);
  });
});

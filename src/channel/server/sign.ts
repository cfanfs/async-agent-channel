import { createHmac, createHash } from "node:crypto";

/**
 * Derive a public key_id from a user_id (first 16 hex chars of SHA256).
 * This is used for server-side lookup without exposing the full user_id.
 */
export function deriveKeyId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 16);
}

/** Build the string-to-sign for HMAC verification. */
export function buildSigningString(
  method: string,
  path: string,
  timestamp: string,
  body: string
): string {
  return `${method}\n${path}\n${timestamp}\n${body}`;
}

/** Compute HMAC-SHA256 signature. */
export function computeSignature(signingString: string, userId: string): string {
  return createHmac("sha256", userId).update(signingString).digest("hex");
}

/** Header names used by the signing protocol. */
export const HEADER_KEY_ID = "x-aac-key-id";
export const HEADER_TIMESTAMP = "x-aac-timestamp";
export const HEADER_SIGNATURE = "x-aac-signature";

/** Max age of a signed request (5 minutes). */
export const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;

/**
 * Sign an outgoing request. Returns headers to attach.
 */
export function signRequest(
  method: string,
  path: string,
  body: string,
  userId: string
): { keyId: string; timestamp: string; signature: string } {
  const keyId = deriveKeyId(userId);
  const timestamp = new Date().toISOString();
  const signingString = buildSigningString(method, path, timestamp, body);
  const signature = computeSignature(signingString, userId);
  return { keyId, timestamp, signature };
}

/**
 * Verify a signed request. Returns true if valid.
 */
export function verifySignature(
  method: string,
  path: string,
  timestamp: string,
  body: string,
  userId: string,
  providedSignature: string
): boolean {
  // Check timestamp freshness
  const requestTime = new Date(timestamp).getTime();
  if (isNaN(requestTime)) return false;
  const drift = Math.abs(Date.now() - requestTime);
  if (drift > MAX_TIMESTAMP_DRIFT_MS) return false;

  const signingString = buildSigningString(method, path, timestamp, body);
  const expected = computeSignature(signingString, userId);

  // Constant-time comparison
  if (expected.length !== providedSignature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ providedSignature.charCodeAt(i);
  }
  return mismatch === 0;
}

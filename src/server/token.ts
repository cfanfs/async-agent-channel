import { randomBytes } from "node:crypto";

/** Generate a cryptographically random user ID (32 bytes, base64url encoded). */
export function generateUserId(): string {
  return randomBytes(32).toString("base64url");
}

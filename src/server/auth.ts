import type { IncomingMessage } from "node:http";
import {
  HEADER_KEY_ID,
  HEADER_TIMESTAMP,
  HEADER_NONCE,
  HEADER_SIGNATURE,
  verifySignature,
} from "../channel/server/sign.js";
import type { ServerStore, MemberRow } from "./store.js";

export interface AuthResult {
  ok: boolean;
  member?: MemberRow;
  error?: string;
}

/**
 * Authenticate a signed request.
 * Extracts signing headers, looks up the member, verifies HMAC, and rejects replayed nonces.
 */
export async function authenticateRequest(
  req: IncomingMessage,
  body: string,
  store: ServerStore,
  opts?: { allowPending?: boolean }
): Promise<AuthResult> {
  const keyId = req.headers[HEADER_KEY_ID] as string | undefined;
  const timestamp = req.headers[HEADER_TIMESTAMP] as string | undefined;
  const nonce = req.headers[HEADER_NONCE] as string | undefined;
  const signature = req.headers[HEADER_SIGNATURE] as string | undefined;

  if (!keyId || !timestamp || !nonce || !signature) {
    return { ok: false, error: "Missing authentication headers" };
  }

  const member = await store.getMemberByKeyId(keyId);
  if (!member) {
    return { ok: false, error: "Unknown key ID" };
  }

  if (!opts?.allowPending && member.status !== "active") {
    return { ok: false, error: "Member is not active" };
  }

  // Parse the URL path (strip query string)
  const path = (req.url ?? "/").split("?")[0];

  const valid = verifySignature(
    req.method ?? "GET",
    path,
    timestamp,
    nonce,
    body,
    member.user_id,
    signature
  );

  if (!valid) {
    return { ok: false, error: "Invalid signature" };
  }

  // Reject replayed nonces
  const nonceAccepted = await store.checkAndStoreNonce(keyId, nonce);
  if (!nonceAccepted) {
    return { ok: false, error: "Replayed request (duplicate nonce)" };
  }

  return { ok: true, member };
}

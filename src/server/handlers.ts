import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { ServerStore, MemberRow } from "./store.js";
import { generateUserId } from "./token.js";
import { deriveKeyId } from "../channel/server/sign.js";

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

export function handleHealth(res: ServerResponse): void {
  json(res, 200, { ok: true });
}

/** POST /api/v1/members/invite — authenticated, creates a pending member. */
export async function handleInvite(
  res: ServerResponse,
  _member: MemberRow,
  store: ServerStore
): Promise<void> {
  const userId = generateUserId();
  const keyId = deriveKeyId(userId);
  await store.addMember(keyId, userId);
  json(res, 201, { user_id: userId });
}

/**
 * POST /api/v1/members/join — authenticated via HMAC (pending members allowed).
 * Body: { name } — the display name to claim.
 * The caller proves possession of the user_id by signing the request.
 */
export async function handleJoin(
  res: ServerResponse,
  body: string,
  member: MemberRow,
  store: ServerStore
): Promise<void> {
  if (member.status !== "pending") {
    json(res, 409, { error: "Already joined" });
    return;
  }

  let parsed: { name?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  const { name } = parsed;
  if (!name) {
    json(res, 400, { error: "Missing name" });
    return;
  }

  // Reject duplicate names among active members
  if (await store.isNameTaken(name)) {
    json(res, 409, { error: `Name "${name}" is already taken` });
    return;
  }

  const activated = await store.activateMember(member.key_id, name);
  if (!activated) {
    json(res, 409, { error: "Member already active" });
    return;
  }

  json(res, 200, { ok: true, name, key_id: member.key_id });
}

/** GET /api/v1/members — authenticated, lists active members. */
export async function handleListMembers(
  res: ServerResponse,
  _member: MemberRow,
  store: ServerStore
): Promise<void> {
  const members = await store.listActiveMembers();
  json(res, 200, { members });
}

/** POST /api/v1/messages — authenticated, send a message. */
export async function handleSendMessage(
  res: ServerResponse,
  body: string,
  member: MemberRow,
  store: ServerStore
): Promise<void> {
  let parsed: { to?: string; subject?: string; body?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: "Invalid JSON" });
    return;
  }

  if (!parsed.to || !parsed.body) {
    json(res, 400, { error: "Missing 'to' or 'body'" });
    return;
  }

  // Validate recipient exists as an active member
  const recipient = await store.getActiveMemberByName(parsed.to);
  if (!recipient) {
    json(res, 404, { error: `Recipient "${parsed.to}" not found` });
    return;
  }

  const id = randomUUID();
  await store.insertMessage({
    id,
    from_name: member.name!,
    to_name: parsed.to,
    subject: parsed.subject ?? "",
    body: parsed.body,
    timestamp: Date.now(),
  });

  json(res, 201, { id });
}

/** GET /api/v1/messages — authenticated, fetch undelivered messages (non-destructive). */
export async function handleFetchMessages(
  res: ServerResponse,
  member: MemberRow,
  store: ServerStore
): Promise<void> {
  const messages = await store.getUndeliveredMessages(member.name!);
  json(res, 200, {
    messages: messages.map((m) => ({
      id: m.id,
      from: m.from_name,
      to: m.to_name,
      subject: m.subject,
      body: m.body,
      timestamp: m.timestamp,
    })),
  });
}

/** POST /api/v1/messages/:id/ack — authenticated, only the recipient can ack their own messages. */
export async function handleAckMessage(
  res: ServerResponse,
  id: string,
  member: MemberRow,
  store: ServerStore
): Promise<void> {
  const acked = await store.ackMessageForRecipient(id, member.name!);
  if (!acked) {
    json(res, 404, { error: "Message not found or not yours" });
    return;
  }
  json(res, 200, { ok: true });
}

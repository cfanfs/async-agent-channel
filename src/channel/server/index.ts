import type { Channel } from "../types.js";
import type { Message } from "../../message/types.js";
import {
  signRequest,
  HEADER_KEY_ID,
  HEADER_TIMESTAMP,
  HEADER_NONCE,
  HEADER_SIGNATURE,
} from "./sign.js";

function signedHeaders(method: string, path: string, body: string, userId: string) {
  const { keyId, timestamp, nonce, signature } = signRequest(method, path, body, userId);
  return {
    [HEADER_KEY_ID]: keyId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
}

function parseServerTimestamp(raw: number | string): Date {
  const millis = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(millis)) {
    throw new Error(`Invalid server message timestamp: ${String(raw)}`);
  }

  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid server message timestamp: ${String(raw)}`);
  }
  return date;
}

export class ServerChannel implements Channel {
  constructor(
    private serverUrl: string,
    private myName: string,
    private userId: string
  ) {}

  async send(toMemberName: string, subject: string, body: string): Promise<void> {
    const path = "/api/v1/messages";
    const payload = JSON.stringify({ to: toMemberName, subject, body });

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders("POST", path, payload, this.userId),
      },
      body: payload,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server rejected message: ${res.status} ${text}`);
    }
  }

  async fetch(): Promise<Message[]> {
    const path = "/api/v1/messages";

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "GET",
      headers: signedHeaders("GET", path, "", this.userId),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server fetch failed: ${res.status} ${text}`);
    }

    const data = await res.json() as {
      messages: Array<{
        id: string;
        from: string;
        to: string;
        subject: string;
        body: string;
        timestamp: number | string;
      }>;
    };

    return data.messages.map((m) => ({
      id: m.id,
      from: m.from,
      to: m.to,
      subject: m.subject,
      body: m.body,
      timestamp: parseServerTimestamp(m.timestamp),
      status: "unread" as const,
    }));
  }

  /** Acknowledge a message after local persistence. Marks it delivered on the server. */
  async ack(messageId: string): Promise<void> {
    const path = `/api/v1/messages/${encodeURIComponent(messageId)}/ack`;

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: signedHeaders("POST", path, "", this.userId),
      body: "",
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server ack failed: ${res.status} ${text}`);
    }
  }
}

import type { Channel } from "../types.js";
import type { Message } from "../../message/types.js";
import {
  signRequest,
  HEADER_KEY_ID,
  HEADER_TIMESTAMP,
  HEADER_SIGNATURE,
} from "./sign.js";

export class ServerChannel implements Channel {
  constructor(
    private serverUrl: string,
    private myName: string,
    private userId: string
  ) {}

  async send(toMemberName: string, subject: string, body: string): Promise<void> {
    const path = "/api/v1/messages";
    const payload = JSON.stringify({ to: toMemberName, subject, body });
    const { keyId, timestamp, signature } = signRequest("POST", path, payload, this.userId);

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [HEADER_KEY_ID]: keyId,
        [HEADER_TIMESTAMP]: timestamp,
        [HEADER_SIGNATURE]: signature,
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
    const body = "";
    const { keyId, timestamp, signature } = signRequest("GET", path, body, this.userId);

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "GET",
      headers: {
        [HEADER_KEY_ID]: keyId,
        [HEADER_TIMESTAMP]: timestamp,
        [HEADER_SIGNATURE]: signature,
      },
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
        timestamp: number;
      }>;
    };

    return data.messages.map((m) => ({
      id: m.id,
      from: m.from,
      to: m.to,
      subject: m.subject,
      body: m.body,
      timestamp: new Date(m.timestamp),
      status: "unread" as const,
    }));
  }

  /** Acknowledge a message after local persistence. Marks it delivered on the server. */
  async ack(messageId: string): Promise<void> {
    const path = `/api/v1/messages/${encodeURIComponent(messageId)}/ack`;
    const body = "";
    const { keyId, timestamp, signature } = signRequest("POST", path, body, this.userId);

    const res = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers: {
        [HEADER_KEY_ID]: keyId,
        [HEADER_TIMESTAMP]: timestamp,
        [HEADER_SIGNATURE]: signature,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server ack failed: ${res.status} ${text}`);
    }
  }
}

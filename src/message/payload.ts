import { basename } from "node:path";

const PAYLOAD_PREFIX = "aac:payload:v1:";

interface EncodedAttachment {
  name: string;
  contentBase64: string;
}

interface EncodedPayload {
  body: string;
  attachments: EncodedAttachment[];
}

export interface OutboundAttachment {
  name: string;
  content: Buffer;
}

export interface DecodedAttachment {
  name: string;
  content: Buffer;
}

export interface DecodedPayload {
  body: string;
  attachments: DecodedAttachment[];
}

export function encodeMessagePayload(
  body: string,
  attachments: OutboundAttachment[]
): string {
  if (attachments.length === 0) return body;

  const payload: EncodedPayload = {
    body,
    attachments: attachments.map((attachment) => ({
      name: sanitizeAttachmentName(attachment.name),
      contentBase64: attachment.content.toString("base64"),
    })),
  };

  return `${PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeMessagePayload(rawBody: string): DecodedPayload {
  if (!rawBody.startsWith(PAYLOAD_PREFIX)) {
    return { body: rawBody, attachments: [] };
  }

  try {
    const parsed = JSON.parse(rawBody.slice(PAYLOAD_PREFIX.length)) as Partial<EncodedPayload>;
    const body = typeof parsed.body === "string" ? parsed.body : "";
    const attachments = Array.isArray(parsed.attachments)
      ? parsed.attachments.flatMap((attachment) => {
          if (
            !attachment ||
            typeof attachment.name !== "string" ||
            typeof attachment.contentBase64 !== "string"
          ) {
            return [];
          }

          return [{
            name: sanitizeAttachmentName(attachment.name),
            content: Buffer.from(attachment.contentBase64, "base64"),
          }];
        })
      : [];

    return { body, attachments };
  } catch {
    return { body: rawBody, attachments: [] };
  }
}

export function sanitizeAttachmentName(name: string): string {
  const base = basename(name).trim();
  if (!base) return "attachment";
  return base.replace(/[^\w.-]/g, "_");
}

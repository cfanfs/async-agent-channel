import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { Channel } from "../types.js";
import type { Message } from "../../message/types.js";
import type { SmtpConfig, ImapConfig } from "../../config.js";
import { getCredential } from "../../keychain/index.js";

export class EmailChannel implements Channel {
  constructor(
    private smtp: SmtpConfig,
    private imap: ImapConfig,
    private fromEmail: string
  ) {}

  async send(toEmail: string, subject: string, body: string): Promise<void> {
    const pass = await getCredential("smtp", this.smtp.user);
    if (!pass) {
      throw new Error(
        `SMTP password not found in keychain for ${this.smtp.user}. Run: aac config set-credential smtp`
      );
    }

    const transport = nodemailer.createTransport({
      host: this.smtp.host,
      port: this.smtp.port,
      secure: this.smtp.port === 465,
      auth: { user: this.smtp.user, pass },
    });

    try {
      await transport.sendMail({
        from: this.fromEmail,
        to: toEmail,
        subject,
        text: body,
      });
    } finally {
      transport.close();
    }
  }

  async fetch(): Promise<Message[]> {
    const pass = await getCredential("imap", this.imap.user);
    if (!pass) {
      throw new Error(
        `IMAP password not found in keychain for ${this.imap.user}. Run: aac config set-credential imap`
      );
    }

    const client = new ImapFlow({
      host: this.imap.host,
      port: this.imap.port,
      secure: this.imap.port === 993,
      auth: { user: this.imap.user, pass },
      logger: false,
    });

    const messages: Message[] = [];

    try {
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");

      try {
        const searchResult = await client.search({ seen: false }, { uid: true });
        const uids = Array.isArray(searchResult) ? searchResult : [];
        if (uids.length === 0) return messages;

        const uidRange = uids.join(",");
        for await (const msg of client.fetch(uidRange, {
          uid: true,
          envelope: true,
          source: true,
        })) {
          const envelope = msg.envelope!;
          const fromAddr = envelope.from?.[0]?.address ?? "unknown";
          const toAddr = envelope.to?.[0]?.address ?? this.fromEmail;
          const messageId =
            envelope.messageId ?? `aac-${msg.uid}-${Date.now()}`;

          const body = msg.source
            ? extractTextBody(msg.source)
            : "";

          messages.push({
            id: messageId,
            from: fromAddr,
            to: toAddr,
            subject: envelope.subject ?? "(no subject)",
            body,
            timestamp: envelope.date ?? new Date(),
            status: "unread",
          });
        }

        // Mark fetched messages as seen on the server
        if (uids.length > 0) {
          await client.messageFlagsAdd(uidRange, ["\\Seen"], { uid: true });
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }

    return messages;
  }
}

/** Extract plain text body from raw RFC822 email source */
function extractTextBody(source: Buffer): string {
  const raw = source.toString("utf-8");

  // Simple extraction: split on double newline (header/body boundary)
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    const altEnd = raw.indexOf("\n\n");
    if (altEnd === -1) return raw;
    return raw.slice(altEnd + 2).trim();
  }
  return raw.slice(headerEnd + 4).trim();
}

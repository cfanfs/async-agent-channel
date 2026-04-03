import { ImapFlow } from "imapflow";
import type { ImapConfig } from "../../config.js";
import type { Message } from "../../message/types.js";
import { getCredential } from "../../keychain/index.js";

export type OnNewMessages = (messages: Message[]) => void;

/**
 * Long-running IMAP IDLE listener.
 * Connects to IMAP, fetches unseen messages, then enters IDLE.
 * When new messages arrive, fetches them and calls the callback.
 */
export class ImapListener {
  private client: ImapFlow | null = null;
  private running = false;

  constructor(
    private imap: ImapConfig,
    private myEmail: string,
    private onNewMessages: OnNewMessages
  ) {}

  async start(): Promise<void> {
    const pass = await getCredential("imap", this.imap.user);
    if (!pass) {
      throw new Error(
        `IMAP password not found in keychain for ${this.imap.user}. Run: aac config set-credential imap`
      );
    }

    this.client = new ImapFlow({
      host: this.imap.host,
      port: this.imap.port,
      secure: this.imap.port === 993,
      auth: { user: this.imap.user, pass },
      logger: false,
    });

    this.running = true;
    await this.client.connect();
    await this.client.mailboxOpen("INBOX");

    // Initial fetch of unseen messages
    await this.fetchAndNotify();

    // Listen for new messages
    this.client.on("exists", () => {
      this.fetchAndNotify().catch((err) => {
        console.error("Error fetching new messages:", err);
      });
    });

    // Enter IDLE loop — re-enters IDLE after each event
    while (this.running && this.client.usable) {
      try {
        await this.client.idle();
      } catch {
        if (!this.running) break;
        // Reconnect on error
        console.error("IDLE interrupted, reconnecting in 5s...");
        await sleep(5000);
        try {
          await this.client.connect();
          await this.client.mailboxOpen("INBOX");
        } catch (reconnectErr) {
          console.error("Reconnect failed:", reconnectErr);
          break;
        }
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.client) {
      await this.client.logout().catch(() => {});
      this.client = null;
    }
  }

  private async fetchAndNotify(): Promise<void> {
    if (!this.client) return;

    const lock = await this.client.getMailboxLock("INBOX");
    try {
      const searchResult = await this.client.search(
        { seen: false },
        { uid: true }
      );
      const uids = Array.isArray(searchResult) ? searchResult : [];
      if (uids.length === 0) return;

      const messages: Message[] = [];
      const uidRange = uids.join(",");

      for await (const msg of this.client.fetch(uidRange, {
        uid: true,
        envelope: true,
        source: true,
      })) {
        const envelope = msg.envelope!;
        const fromAddr = envelope.from?.[0]?.address ?? "unknown";
        const toAddr = envelope.to?.[0]?.address ?? this.myEmail;
        const messageId =
          envelope.messageId ?? `aac-${msg.uid}-${Date.now()}`;
        const body = msg.source ? extractTextBody(msg.source) : "";

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

      // Mark as seen
      await this.client.messageFlagsAdd(uidRange, ["\\Seen"], { uid: true });

      if (messages.length > 0) {
        this.onNewMessages(messages);
      }
    } finally {
      lock.release();
    }
  }
}

function extractTextBody(source: Buffer): string {
  const raw = source.toString("utf-8");
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    const altEnd = raw.indexOf("\n\n");
    if (altEnd === -1) return raw;
    return raw.slice(altEnd + 2).trim();
  }
  return raw.slice(headerEnd + 4).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type {
  Message,
  MessageChannel,
  MessageSummary,
  MessageStatus,
} from "../message/types.js";
import { getConfigDir } from "../config.js";

export class MessageStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const path = dbPath ?? join(getConfigDir(), "messages.db");
    const dir = join(path, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id        TEXT PRIMARY KEY,
        "from"    TEXT NOT NULL,
        "to"      TEXT NOT NULL,
        subject   TEXT NOT NULL DEFAULT '',
        body      TEXT NOT NULL DEFAULT '',
        timestamp INTEGER NOT NULL,
        status    TEXT NOT NULL DEFAULT 'unread',
        channel   TEXT,
        server_group TEXT
      )
    `);

    const columns = this.db
      .prepare(`PRAGMA table_info(messages)`)
      .all() as Array<{ name: string }>;
    const names = new Set(columns.map((column) => column.name));

    if (!names.has("channel")) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN channel TEXT`);
    }
    if (!names.has("server_group")) {
      this.db.exec(`ALTER TABLE messages ADD COLUMN server_group TEXT`);
    }
  }

  list(from?: string): MessageSummary[] {
    const base = `SELECT id, "from", subject, timestamp, status, channel, server_group FROM messages WHERE status != 'acked'`;
    const stmt = from
      ? this.db.prepare(`${base} AND "from" = ? ORDER BY timestamp DESC`)
      : this.db.prepare(`${base} ORDER BY timestamp DESC`);

    const rows = (from ? stmt.all(from) : stmt.all()) as Array<{
      id: string;
      from: string;
      subject: string;
      timestamp: number;
      status: MessageStatus;
      channel: MessageChannel | null;
      server_group: string | null;
    }>;

    return rows.map((r) => ({
      id: r.id,
      from: r.from,
      subject: r.subject,
      timestamp: new Date(r.timestamp),
      status: r.status,
      channel: r.channel ?? undefined,
      serverGroup: r.server_group,
    }));
  }

  get(id: string): Message | undefined {
    const row = this.db
      .prepare(
        `SELECT id, "from", "to", subject, body, timestamp, status, channel, server_group FROM messages WHERE id = ?`
      )
      .get(id) as
      | {
          id: string;
          from: string;
          to: string;
          subject: string;
          body: string;
          timestamp: number;
          status: MessageStatus;
          channel: MessageChannel | null;
          server_group: string | null;
        }
      | undefined;

    if (!row) return undefined;
    return {
      id: row.id,
      from: row.from,
      to: row.to,
      subject: row.subject,
      body: row.body,
      timestamp: new Date(row.timestamp),
      status: row.status,
      channel: row.channel ?? undefined,
      serverGroup: row.server_group,
    };
  }

  /** Insert a message. Skips if id already exists. Returns true if inserted. */
  insert(message: Message): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO messages (id, "from", "to", subject, body, timestamp, status, channel, server_group)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      const result = stmt.run(
        message.id,
        message.from,
        message.to,
        message.subject,
        message.body,
        message.timestamp.getTime(),
        message.status,
        message.channel ?? null,
        message.serverGroup ?? null
      );
      return result.changes > 0;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "SQLITE_CONSTRAINT_PRIMARYKEY" || code === "SQLITE_CONSTRAINT_UNIQUE") {
        return false;
      }
      throw err;
    }
  }

  updateStatus(id: string, status: MessageStatus): boolean {
    const result = this.db
      .prepare(`UPDATE messages SET status = ? WHERE id = ?`)
      .run(status, id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

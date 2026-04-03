import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type {
  Message,
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
        status    TEXT NOT NULL DEFAULT 'unread'
      )
    `);
  }

  list(from?: string): MessageSummary[] {
    const base = `SELECT id, "from", subject, timestamp, status FROM messages WHERE status != 'acked'`;
    const stmt = from
      ? this.db.prepare(`${base} AND "from" = ? ORDER BY timestamp DESC`)
      : this.db.prepare(`${base} ORDER BY timestamp DESC`);

    const rows = (from ? stmt.all(from) : stmt.all()) as Array<{
      id: string;
      from: string;
      subject: string;
      timestamp: number;
      status: MessageStatus;
    }>;

    return rows.map((r) => ({
      id: r.id,
      from: r.from,
      subject: r.subject,
      timestamp: new Date(r.timestamp),
      status: r.status,
    }));
  }

  get(id: string): Message | undefined {
    const row = this.db
      .prepare(
        `SELECT id, "from", "to", subject, body, timestamp, status FROM messages WHERE id = ?`
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
        }
      | undefined;

    if (!row) return undefined;
    return {
      ...row,
      timestamp: new Date(row.timestamp),
    };
  }

  /** Insert a message. Skips if id already exists. Returns true if inserted. */
  insert(message: Message): boolean {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO messages (id, "from", "to", subject, body, timestamp, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      message.id,
      message.from,
      message.to,
      message.subject,
      message.body,
      message.timestamp.getTime(),
      message.status
    );
    return result.changes > 0;
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

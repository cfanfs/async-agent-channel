import pg from "pg";

export interface ServerStoreConfig {
  connectionString: string;
}

export interface MemberRow {
  key_id: string;
  user_id: string;
  name: string | null;
  status: "pending" | "active" | "revoked";
}

export interface ServerMessageRow {
  id: string;
  from_name: string;
  to_name: string;
  subject: string;
  body: string;
  timestamp: number;
  delivered: boolean;
}

export class ServerStore {
  private pool: pg.Pool;

  constructor(config: ServerStoreConfig) {
    this.pool = new pg.Pool({ connectionString: config.connectionString });
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        key_id  TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        name    TEXT,
        status  TEXT NOT NULL DEFAULT 'pending'
      )
    `);
    // Partial unique index: active member names must be unique
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_members_active_name
      ON members (name) WHERE status = 'active'
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id        TEXT PRIMARY KEY,
        from_name TEXT NOT NULL,
        to_name   TEXT NOT NULL,
        subject   TEXT NOT NULL DEFAULT '',
        body      TEXT NOT NULL DEFAULT '',
        timestamp BIGINT NOT NULL,
        delivered BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS request_nonces (
        key_id    TEXT NOT NULL,
        nonce     TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        PRIMARY KEY (key_id, nonce)
      )
    `);
  }

  // --- Members ---

  async addMember(keyId: string, userId: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO members (key_id, user_id, status) VALUES ($1, $2, 'pending')`,
      [keyId, userId]
    );
  }

  async activateMember(keyId: string, name: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE members SET name = $1, status = 'active' WHERE key_id = $2 AND status = 'pending'`,
      [name, keyId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isNameTaken(name: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM members WHERE name = $1 AND status = 'active' LIMIT 1`,
      [name]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getActiveMemberByName(name: string): Promise<MemberRow | null> {
    const result = await this.pool.query<MemberRow>(
      `SELECT key_id, user_id, name, status FROM members WHERE name = $1 AND status = 'active'`,
      [name]
    );
    return result.rows[0] ?? null;
  }

  async getMemberByKeyId(keyId: string): Promise<MemberRow | null> {
    const result = await this.pool.query<MemberRow>(
      `SELECT key_id, user_id, name, status FROM members WHERE key_id = $1`,
      [keyId]
    );
    return result.rows[0] ?? null;
  }

  async getMemberByUserId(userId: string): Promise<MemberRow | null> {
    const result = await this.pool.query<MemberRow>(
      `SELECT key_id, user_id, name, status FROM members WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  async listActiveMembers(): Promise<Array<{ key_id: string; name: string }>> {
    const result = await this.pool.query<{ key_id: string; name: string }>(
      `SELECT key_id, name FROM members WHERE status = 'active' ORDER BY name`
    );
    return result.rows;
  }

  // --- Messages ---

  async insertMessage(msg: Omit<ServerMessageRow, "delivered">): Promise<void> {
    await this.pool.query(
      `INSERT INTO messages (id, from_name, to_name, subject, body, timestamp, delivered)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE)`,
      [msg.id, msg.from_name, msg.to_name, msg.subject, msg.body, msg.timestamp]
    );
  }

  async getUndeliveredMessages(toName: string): Promise<ServerMessageRow[]> {
    const result = await this.pool.query<ServerMessageRow>(
      `SELECT id, from_name, to_name, subject, body, timestamp, delivered
       FROM messages WHERE to_name = $1 AND delivered = FALSE
       ORDER BY timestamp ASC`,
      [toName]
    );
    return result.rows;
  }

  /** Mark a message as delivered, but only if it belongs to the given recipient. */
  async ackMessageForRecipient(id: string, toName: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE messages SET delivered = TRUE WHERE id = $1 AND to_name = $2 AND delivered = FALSE`,
      [id, toName]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // --- Nonces (replay protection) ---

  /** Store a nonce atomically. Returns true if new, false if replayed. */
  async checkAndStoreNonce(keyId: string, nonce: string): Promise<boolean> {
    try {
      await this.pool.query(
        `INSERT INTO request_nonces (key_id, nonce, timestamp) VALUES ($1, $2, $3)`,
        [keyId, nonce, Date.now()]
      );
      return true;
    } catch (err: any) {
      // Unique constraint violation = duplicate nonce
      if (err.code === "23505") return false;
      throw err;
    }
  }

  /** Clean up expired nonces older than the given age (ms). */
  async cleanupNonces(maxAgeMs: number): Promise<void> {
    const cutoff = Date.now() - maxAgeMs;
    await this.pool.query(
      `DELETE FROM request_nonces WHERE timestamp < $1`,
      [cutoff]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

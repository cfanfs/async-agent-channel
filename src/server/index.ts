import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { ServerStore, type ServerStoreConfig } from "./store.js";
import { authenticateRequest } from "./auth.js";
import {
  handleHealth,
  handleInvite,
  handleJoin,
  handleListMembers,
  handleSendMessage,
  handleFetchMessages,
  handleAckMessage,
} from "./handlers.js";

export interface RelayServerConfig {
  port: number;
  host?: string;
  db: ServerStoreConfig;
}

import { MAX_TIMESTAMP_DRIFT_MS } from "../channel/server/sign.js";

export class RelayServer {
  private server: ReturnType<typeof createServer> | null = null;
  private store: ServerStore;
  private nonceCleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: RelayServerConfig) {
    this.store = new ServerStore(config.db);
  }

  async start(): Promise<void> {
    await this.store.migrate();

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        if (!res.headersSent) {
          if (err instanceof BodyTooLargeError) {
            res.writeHead(413, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Request body too large" }));
          } else {
            console.error("Unhandled error:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal server error" }));
          }
        }
      });
    });

    const host = this.config.host ?? "0.0.0.0";
    return new Promise((resolve) => {
      this.server!.listen(this.config.port, host, () => {
        console.log(`aac relay server listening on ${host}:${this.config.port}`);
        resolve();
      });
    });

    // Periodically clean up expired nonces (every 10 minutes)
    this.nonceCleanupTimer = setInterval(() => {
      this.store.cleanupNonces(MAX_TIMESTAMP_DRIFT_MS * 2).catch((err) => {
        console.error("Nonce cleanup error:", err);
      });
    }, 10 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this.nonceCleanupTimer) {
      clearInterval(this.nonceCleanupTimer);
      this.nonceCleanupTimer = null;
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    }
    await this.store.close();
  }

  /** Expose store for CLI init commands. */
  getStore(): ServerStore {
    return this.store;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const path = (req.url ?? "/").split("?")[0];

    // Read body for all requests (needed for signature verification)
    const body = await readBody(req);

    // --- Unauthenticated routes ---
    if (method === "GET" && path === "/health") {
      handleHealth(res);
      return;
    }

    // --- Join: authenticated but allows pending members ---
    if (method === "POST" && path === "/api/v1/members/join") {
      const joinAuth = await authenticateRequest(req, body, this.store, { allowPending: true });
      if (!joinAuth.ok || !joinAuth.member) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: joinAuth.error ?? "Unauthorized" }));
        return;
      }
      await handleJoin(res, body, joinAuth.member, this.store);
      return;
    }

    // --- Authenticated routes (active members only) ---
    const auth = await authenticateRequest(req, body, this.store);
    if (!auth.ok || !auth.member) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: auth.error ?? "Unauthorized" }));
      return;
    }

    const member = auth.member;

    if (method === "POST" && path === "/api/v1/members/invite") {
      await handleInvite(res, member, this.store);
      return;
    }

    if (method === "GET" && path === "/api/v1/members") {
      await handleListMembers(res, member, this.store);
      return;
    }

    if (method === "POST" && path === "/api/v1/messages") {
      await handleSendMessage(res, body, member, this.store);
      return;
    }

    if (method === "GET" && path === "/api/v1/messages") {
      await handleFetchMessages(res, member, this.store);
      return;
    }

    // Match /api/v1/messages/:id/ack
    const ackMatch = path.match(/^\/api\/v1\/messages\/([^/]+)\/ack$/);
    if (method === "POST" && ackMatch) {
      await handleAckMessage(res, ackMatch[1], member, this.store);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

class BodyTooLargeError extends Error {
  constructor() { super("Request body too large"); }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

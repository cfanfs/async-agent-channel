import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, saveConfig, configExists, resolveContact, type ContactInfo } from "../config.js";
import { EmailChannel } from "../channel/email/index.js";
import { ServerChannel } from "../channel/server/index.js";
import { resolveChannelForContact, type ChannelType } from "../channel/router.js";
import { MessageStore } from "../store/index.js";
import { Workspace } from "../workspace/index.js";
import { ImapListener } from "../channel/email/listener.js";
import { getCredential } from "../keychain/index.js";
import { signRequest, HEADER_KEY_ID, HEADER_TIMESTAMP, HEADER_NONCE, HEADER_SIGNATURE } from "../channel/server/sign.js";
import type { Message } from "../message/types.js";

function signedHeaders(method: string, path: string, body: string, userId: string) {
  const { keyId, timestamp, nonce, signature } = signRequest(method, path, body, userId);
  return {
    [HEADER_KEY_ID]: keyId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
}

export function createServer(): Server {
  const server = new Server(
    { name: "aac", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  if (configExists()) {
    startBackgroundListeners().catch((err) => {
      console.error("Background listener failed:", err);
    });
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "send",
        description: "Send a message to a contact (auto-routes via server or email)",
        inputSchema: {
          type: "object" as const,
          properties: {
            to: { type: "string", description: "Recipient contact name" },
            subject: { type: "string", description: "Message subject (optional)" },
            body: { type: "string", description: "Message body" },
            via: { type: "string", enum: ["email", "server"], description: "Force channel (default: auto)" },
          },
          required: ["to", "body"],
        },
      },
      {
        name: "fetch",
        description: "Fetch new messages from all configured channels into local queue",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "inbox_list",
        description: "List unprocessed messages",
        inputSchema: {
          type: "object" as const,
          properties: {
            from: { type: "string", description: "Filter by sender" },
          },
        },
      },
      {
        name: "inbox_read",
        description: "Read a specific message and mark as read",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string", description: "Message ID" },
          },
          required: ["id"],
        },
      },
      {
        name: "inbox_ack",
        description: "Mark a message as processed",
        inputSchema: {
          type: "object" as const,
          properties: {
            id: { type: "string", description: "Message ID" },
          },
          required: ["id"],
        },
      },
      {
        name: "contacts_list",
        description: "List all contacts with their channel info",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "contacts_add",
        description: "Add a contact (email, server member name, or both)",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Contact name" },
            email: { type: "string", description: "Contact email address" },
            server: { type: "string", description: "Member name on relay server" },
          },
          required: ["name"],
        },
      },
      {
        name: "contacts_remove",
        description: "Remove a contact",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Contact name" },
          },
          required: ["name"],
        },
      },
      {
        name: "server_invite",
        description: "Invite a new member to the relay server (returns user_id to share)",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "server_members",
        description: "List members on the relay server",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "outbound_list",
        description: "List files available in outbound workspaces (safe to share)",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "outbound_read",
        description: "Read a file from outbound workspace (safe to share). Path must be within a configured outbound directory.",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "File path (absolute or relative to an outbound root)" },
          },
          required: ["path"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    switch (name) {
      case "send":
        return await handleSend(a);
      case "fetch":
        return await handleFetch();
      case "inbox_list":
        return handleInboxList(a);
      case "inbox_read":
        return handleInboxRead(a);
      case "inbox_ack":
        return handleInboxAck(a);
      case "contacts_list":
        return handleContactsList();
      case "contacts_add":
        return handleContactsAdd(a);
      case "contacts_remove":
        return handleContactsRemove(a);
      case "server_invite":
        return await handleServerInvite();
      case "server_members":
        return await handleServerMembers();
      case "outbound_list":
        return handleOutboundList();
      case "outbound_read":
        return handleOutboundRead(a);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

async function handleSend(a: Record<string, unknown>) {
  const cfg = loadConfig();
  const contactName = a.to as string;
  const subject = (a.subject as string) ?? `[aac] Message from ${cfg.identity.name}`;
  const body = a.body as string;
  const via = a.via as ChannelType | undefined;

  try {
    const { channel, address, type } = await resolveChannelForContact(cfg, contactName, via);
    await channel.send(address, subject, body);
    return text(`Sent to ${contactName} (${address}) via ${type}`);
  } catch (err) {
    return text(`Send failed: ${(err as Error).message}`);
  }
}

async function handleFetch() {
  const cfg = loadConfig();
  const store = new MessageStore();
  let totalFetched = 0;
  let newCount = 0;

  try {
    if (cfg.email) {
      try {
        const channel = new EmailChannel(cfg.email.smtp, cfg.email.imap, cfg.identity.email);
        const msgs = await channel.fetch();
        totalFetched += msgs.length;
        for (const msg of msgs) {
          if (store.insert(msg)) newCount++;
        }
      } catch (err) {
        console.error(`Email fetch error: ${(err as Error).message}`);
      }
    }

    // Two-phase: fetch → persist → ack
    if (cfg.server) {
      try {
        const userId = await getCredential("server", cfg.server.name);
        if (userId) {
          const channel = new ServerChannel(cfg.server.url, cfg.server.name, userId);
          const msgs = await channel.fetch();
          totalFetched += msgs.length;
          for (const msg of msgs) {
            if (store.insert(msg)) newCount++;
            try { await channel.ack(msg.id); } catch { /* non-fatal */ }
          }
        }
      } catch (err) {
        console.error(`Server fetch error: ${(err as Error).message}`);
      }
    }

    return text(`Fetched ${totalFetched} message(s), ${newCount} new.`);
  } finally {
    store.close();
  }
}

function handleInboxList(a: Record<string, unknown>) {
  const store = new MessageStore();
  try {
    const messages = store.list(a.from as string | undefined);
    if (messages.length === 0) return text("No unprocessed messages.");

    const lines = messages.map((msg) => {
      const date = msg.timestamp.toISOString().slice(0, 16);
      const flag = msg.status === "unread" ? "*" : " ";
      return `${flag} [${msg.id}] ${date} ${msg.from}: ${msg.subject}`;
    });
    lines.push(`\n${messages.length} message(s). (* = unread)`);
    return text(lines.join("\n"));
  } finally {
    store.close();
  }
}

function handleInboxRead(a: Record<string, unknown>) {
  const id = a.id as string;
  const store = new MessageStore();
  try {
    const msg = store.get(id);
    if (!msg) return text(`Message "${id}" not found.`);

    if (msg.status === "unread") {
      store.updateStatus(id, "read");
    }

    return text(
      `From:    ${msg.from}\nTo:      ${msg.to}\nSubject: ${msg.subject}\nDate:    ${msg.timestamp.toISOString()}\nStatus:  ${msg.status}\n---\n${msg.body}`
    );
  } finally {
    store.close();
  }
}

function handleInboxAck(a: Record<string, unknown>) {
  const id = a.id as string;
  const store = new MessageStore();
  try {
    if (!store.updateStatus(id, "acked")) {
      return text(`Message "${id}" not found.`);
    }
    return text(`Message "${id}" acknowledged.`);
  } finally {
    store.close();
  }
}

function handleContactsList() {
  const cfg = loadConfig();
  const entries = Object.entries(cfg.contacts);
  if (entries.length === 0) return text("No contacts configured.");
  return text(entries.map(([name, entry]) => {
    const info = resolveContact(entry);
    const parts: string[] = [];
    if (info.email) parts.push(`email: ${info.email}`);
    if (info.server) parts.push(`server: ${info.server}`);
    return `${name}: ${parts.join(", ")}`;
  }).join("\n"));
}

function handleContactsAdd(a: Record<string, unknown>) {
  const cfg = loadConfig();
  const name = a.name as string;
  const email = a.email as string | undefined;
  const serverName = a.server as string | undefined;

  if (!email && !serverName) {
    return text("Provide at least email or server member name.");
  }

  if (email && !serverName) {
    cfg.contacts[name] = email;
  } else {
    const existing = cfg.contacts[name] ? resolveContact(cfg.contacts[name]) : {};
    const updated: ContactInfo = { ...existing };
    if (email) updated.email = email;
    if (serverName) updated.server = serverName;
    cfg.contacts[name] = updated;
  }

  saveConfig(cfg);
  return text(`Contact "${name}" saved.`);
}

function handleContactsRemove(a: Record<string, unknown>) {
  const cfg = loadConfig();
  const name = a.name as string;
  if (!cfg.contacts[name]) return text(`Contact "${name}" not found.`);
  delete cfg.contacts[name];
  saveConfig(cfg);
  return text(`Contact "${name}" removed.`);
}

async function handleServerInvite() {
  const cfg = loadConfig();
  if (!cfg.server) return text("Server not configured.");

  const userId = await getCredential("server", cfg.server.name);
  if (!userId) return text("Server user_id not found in keychain.");

  const path = "/api/v1/members/invite";
  const body = "";

  const res = await fetch(`${cfg.server.url}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signedHeaders("POST", path, body, userId),
    },
    body,
  });

  if (!res.ok) {
    return text(`Invite failed: ${res.status}`);
  }

  const data = await res.json() as { user_id: string };
  return text(`Invite created.\n\nuser_id: ${data.user_id}\n\nShare this with the new member. They should run:\n  aac server join ${cfg.server.url} --name <their-name>`);
}

async function handleServerMembers() {
  const cfg = loadConfig();
  if (!cfg.server) return text("Server not configured.");

  const userId = await getCredential("server", cfg.server.name);
  if (!userId) return text("Server user_id not found in keychain.");

  const path = "/api/v1/members";

  const res = await fetch(`${cfg.server.url}${path}`, {
    method: "GET",
    headers: signedHeaders("GET", path, "", userId),
  });

  if (!res.ok) {
    return text(`Failed: ${res.status}`);
  }

  const data = await res.json() as { members: Array<{ name: string }> };
  if (data.members.length === 0) return text("No members.");
  return text(data.members.map((m) => {
    const me = m.name === cfg.server!.name ? " (you)" : "";
    return `  ${m.name}${me}`;
  }).join("\n"));
}

function handleOutboundList() {
  const cfg = loadConfig();
  const ws = new Workspace(cfg.workspace);
  const groups = ws.listOutboundFiles();
  if (groups.every((g) => g.files.length === 0)) {
    return text("No files in outbound workspaces.");
  }
  const lines = groups.flatMap((g) => [
    `[${g.root}]`,
    ...g.files.map((f) => `  ${f}`),
  ]);
  return text(lines.join("\n"));
}

function handleOutboundRead(a: Record<string, unknown>) {
  const cfg = loadConfig();
  const ws = new Workspace(cfg.workspace);
  const filePath = a.path as string;
  try {
    const content = ws.readOutboundFile(filePath);
    return text(content);
  } catch (err) {
    return text(`Error: ${(err as Error).message}`);
  }
}

async function startBackgroundListeners(): Promise<void> {
  const cfg = loadConfig();
  const store = new MessageStore();

  const onMessages = (source: string) => (messages: Message[]) => {
    let newCount = 0;
    for (const msg of messages) {
      if (store.insert(msg)) newCount++;
    }
    if (newCount > 0) {
      console.error(`aac: ${newCount} new message(s) from ${source}`);
    }
  };

  // IMAP IDLE listener
  if (cfg.email) {
    const listener = new ImapListener(
      cfg.email.imap,
      cfg.identity.email,
      onMessages("email")
    );
    listener.start().catch((err) => {
      console.error("IMAP listener error:", (err as Error).message);
    });
  }

  // Server polling (two-phase: fetch → persist → ack)
  if (cfg.server) {
    const userId = await getCredential("server", cfg.server.name);
    if (userId) {
      const channel = new ServerChannel(cfg.server.url, cfg.server.name, userId);
      const poll = async () => {
        while (true) {
          try {
            const msgs = await channel.fetch();
            if (msgs.length > 0) {
              let newCount = 0;
              for (const msg of msgs) {
                if (store.insert(msg)) newCount++;
                try { await channel.ack(msg.id); } catch { /* retry next poll */ }
              }
              if (newCount > 0) {
                console.error(`aac: ${newCount} new message(s) from server`);
              }
            }
          } catch (err) {
            console.error("Server poll error:", (err as Error).message);
          }
          await new Promise((r) => setTimeout(r, 30_000));
        }
      };
      poll();
    }
  }
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, saveConfig, configExists } from "../config.js";
import { EmailChannel } from "../channel/email/index.js";
import { MessageStore } from "../store/index.js";
import { Workspace } from "../workspace/index.js";
import { ImapListener } from "../channel/email/listener.js";

export function createServer(): Server {
  const server = new Server(
    { name: "aac", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  // Start IMAP IDLE listener in background if configured
  if (configExists()) {
    startIdleListener().catch((err) => {
      console.error("IMAP IDLE listener failed to start:", err);
    });
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "send",
        description: "Send a message to a contact",
        inputSchema: {
          type: "object" as const,
          properties: {
            to: { type: "string", description: "Recipient contact name" },
            subject: { type: "string", description: "Message subject (optional)" },
            body: { type: "string", description: "Message body" },
          },
          required: ["to", "body"],
        },
      },
      {
        name: "fetch",
        description: "Fetch new messages from email into local queue",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "inbox_list",
        description: "List unprocessed messages",
        inputSchema: {
          type: "object" as const,
          properties: {
            from: { type: "string", description: "Filter by sender email" },
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
        description: "List all contacts",
        inputSchema: { type: "object" as const, properties: {} },
      },
      {
        name: "contacts_add",
        description: "Add a contact",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Contact name" },
            email: { type: "string", description: "Contact email" },
          },
          required: ["name", "email"],
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
  const email = cfg.contacts[contactName];
  if (!email) {
    return text(`Contact "${contactName}" not found. Available: ${Object.keys(cfg.contacts).join(", ") || "(none)"}`);
  }

  const subject = (a.subject as string) ?? `[aac] Message from ${cfg.identity.name}`;
  const body = a.body as string;
  const channel = new EmailChannel(cfg.email.smtp, cfg.email.imap, cfg.identity.email);
  await channel.send(email, subject, body);
  return text(`Sent to ${contactName} (${email})`);
}

async function handleFetch() {
  const cfg = loadConfig();
  const channel = new EmailChannel(cfg.email.smtp, cfg.email.imap, cfg.identity.email);
  const store = new MessageStore();
  try {
    const messages = await channel.fetch();
    let newCount = 0;
    for (const msg of messages) {
      if (store.insert(msg)) newCount++;
    }
    return text(`Fetched ${messages.length} message(s), ${newCount} new.`);
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
  return text(entries.map(([name, email]) => `${name}: ${email}`).join("\n"));
}

function handleContactsAdd(a: Record<string, unknown>) {
  const cfg = loadConfig();
  const name = a.name as string;
  const email = a.email as string;
  cfg.contacts[name] = email;
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

async function startIdleListener(): Promise<void> {
  const cfg = loadConfig();
  const store = new MessageStore();

  const listener = new ImapListener(
    cfg.email.imap,
    cfg.identity.email,
    (messages) => {
      let newCount = 0;
      for (const msg of messages) {
        if (store.insert(msg)) newCount++;
      }
      if (newCount > 0) {
        console.error(`aac: ${newCount} new message(s) received`);
      }
    }
  );

  await listener.start();
}

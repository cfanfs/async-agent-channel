import type { Command } from "commander";
import { MessageStore } from "../store/index.js";

export function registerInboxCommand(program: Command): void {
  const inbox = program
    .command("inbox")
    .description("Manage received messages");

  inbox
    .command("list", { isDefault: true })
    .description("List unprocessed messages")
    .option("--from <contact>", "filter by sender email")
    .action(async (opts: { from?: string }) => {
      const store = new MessageStore();
      try {
        const messages = store.list(opts.from);
        if (messages.length === 0) {
          console.log("No unprocessed messages.");
          return;
        }
        for (const msg of messages) {
          const date = msg.timestamp.toISOString().slice(0, 16);
          const flag = msg.status === "unread" ? "*" : " ";
          console.log(`${flag} [${msg.id}] ${date} ${msg.from}: ${msg.subject}`);
        }
        console.log(`\n${messages.length} message(s). (* = unread)`);
      } finally {
        store.close();
      }
    });

  inbox
    .command("read <id>")
    .description("Read a specific message")
    .action(async (id: string) => {
      const store = new MessageStore();
      try {
        const msg = store.get(id);
        if (!msg) {
          console.error(`Message "${id}" not found.`);
          process.exit(1);
        }
        console.log(`From:    ${msg.from}`);
        console.log(`To:      ${msg.to}`);
        console.log(`Subject: ${msg.subject}`);
        console.log(`Date:    ${msg.timestamp.toISOString()}`);
        console.log(`Status:  ${msg.status}`);
        console.log(`---`);
        console.log(msg.body);

        if (msg.status === "unread") {
          store.updateStatus(id, "read");
        }
      } finally {
        store.close();
      }
    });

  inbox
    .command("ack <id>")
    .description("Mark a message as processed")
    .action(async (id: string) => {
      const store = new MessageStore();
      try {
        if (!store.updateStatus(id, "acked")) {
          console.error(`Message "${id}" not found.`);
          process.exit(1);
        }
        console.log(`Message "${id}" acknowledged.`);
      } finally {
        store.close();
      }
    });
}

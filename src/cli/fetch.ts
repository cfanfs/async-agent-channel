import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { EmailChannel } from "../channel/email/index.js";
import { MessageStore } from "../store/index.js";

export function registerFetchCommand(program: Command): void {
  program
    .command("fetch")
    .description("Fetch new messages from email into local queue")
    .action(async () => {
      const cfg = loadConfig();
      const channel = new EmailChannel(
        cfg.email.smtp,
        cfg.email.imap,
        cfg.identity.email
      );
      const store = new MessageStore();

      try {
        const messages = await channel.fetch();
        let newCount = 0;
        for (const msg of messages) {
          if (store.insert(msg)) {
            newCount++;
          }
        }
        console.log(
          `Fetched ${messages.length} message(s), ${newCount} new.`
        );
      } finally {
        store.close();
      }
    });
}

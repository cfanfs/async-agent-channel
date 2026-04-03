import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { ImapListener } from "../channel/email/listener.js";
import { MessageStore } from "../store/index.js";

export function registerListenCommand(program: Command): void {
  program
    .command("listen")
    .description("Start long-running IMAP IDLE listener")
    .action(async () => {
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
            console.log(
              `${new Date().toISOString()} — ${newCount} new message(s) received`
            );
          }
        }
      );

      // Graceful shutdown
      const shutdown = async () => {
        console.log("\nStopping listener...");
        await listener.stop();
        store.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      console.log("Listening for new messages (Ctrl+C to stop)...");
      await listener.start();
    });
}

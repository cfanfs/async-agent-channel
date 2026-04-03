import type { Command } from "commander";
import { loadConfig, getServersMap } from "../config.js";
import { ImapListener } from "../channel/email/listener.js";
import { ServerChannel } from "../channel/server/index.js";
import { MessageStore } from "../store/index.js";
import { getCredential } from "../keychain/index.js";

export function registerListenCommand(program: Command): void {
  program
    .command("listen")
    .description("Listen for new messages from all configured channels")
    .option("--poll-interval <seconds>", "Server polling interval in seconds", "30")
    .action(async (opts: { pollInterval: string }) => {
      const cfg = loadConfig();
      const store = new MessageStore();
      const cleanups: Array<() => Promise<void>> = [];

      const insertMessages = (source: string) => (messages: import("../message/types.js").Message[]) => {
        let newCount = 0;
        for (const msg of messages) {
          if (store.insert(msg)) newCount++;
        }
        if (newCount > 0) {
          console.log(
            `${new Date().toISOString()} — ${source}: ${newCount} new message(s)`
          );
        }
      };

      // Start IMAP listener if email configured
      if (cfg.email) {
        const listener = new ImapListener(
          cfg.email.imap,
          cfg.identity.email,
          insertMessages("email")
        );
        cleanups.push(() => listener.stop());
        console.log("Starting IMAP listener...");
        listener.start().catch((err) => {
          console.error("IMAP listener error:", (err as Error).message);
        });
      }

      // Start server polling for all configured groups
      for (const [group, serverConfig] of Object.entries(getServersMap(cfg))) {
        const userId = await getCredential(`server-${group}`, serverConfig.name);
        if (!userId) continue;

        const channel = new ServerChannel(serverConfig.url, serverConfig.name, userId);
        const intervalMs = parseInt(opts.pollInterval, 10) * 1000;
        let running = true;

        const poll = async () => {
          while (running) {
            try {
              const msgs = await channel.fetch();
              if (msgs.length > 0) {
                let newCount = 0;
                for (const msg of msgs) {
                  msg.from = `${msg.from}@${group}`;
                  if (store.insert(msg)) newCount++;
                  try { await channel.ack(msg.id); } catch { /* retry on next poll */ }
                }
                if (newCount > 0) {
                  console.log(
                    `${new Date().toISOString()} — server [${group}]: ${newCount} new message(s)`
                  );
                }
              }
            } catch (err) {
              console.error(`Server [${group}] poll error:`, (err as Error).message);
            }
            await new Promise((r) => setTimeout(r, intervalMs));
          }
        };

        cleanups.push(async () => { running = false; });
        console.log(`Starting server [${group}] polling (every ${opts.pollInterval}s)...`);
        poll();
      }

      if (cleanups.length === 0) {
        console.error("No channels configured for listening.");
        store.close();
        process.exit(1);
      }

      // Graceful shutdown
      const shutdown = async () => {
        console.log("\nStopping listeners...");
        for (const cleanup of cleanups) {
          await cleanup();
        }
        store.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      console.log("Listening for new messages (Ctrl+C to stop)...");
    });
}

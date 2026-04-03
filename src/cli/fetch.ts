import type { Command } from "commander";
import { loadConfig, getServersMap, getServerUserId } from "../config.js";
import { EmailChannel } from "../channel/email/index.js";
import { ServerChannel } from "../channel/server/index.js";
import { MessageStore } from "../store/index.js";

export function registerFetchCommand(program: Command): void {
  program
    .command("fetch")
    .description("Fetch new messages from all configured channels")
    .action(async () => {
      const cfg = loadConfig();
      const store = new MessageStore();
      let totalFetched = 0;
      let newCount = 0;

      try {
        // Fetch from email if configured
        if (cfg.email) {
          try {
            const channel = new EmailChannel(
              cfg.email.smtp,
              cfg.email.imap,
              cfg.identity.email
            );
            const msgs = await channel.fetch();
            totalFetched += msgs.length;
            for (const msg of msgs) {
              if (store.insert(msg)) newCount++;
            }
            if (msgs.length > 0) {
              console.log(`Email: fetched ${msgs.length} message(s)`);
            }
          } catch (err) {
            console.error(`Email fetch failed: ${(err as Error).message}`);
          }
        }

        // Fetch from all server groups (two-phase: fetch → persist → ack)
        for (const [group, serverConfig] of Object.entries(getServersMap(cfg))) {
          try {
            const userId = await getServerUserId(cfg, group);
            if (userId) {
              const channel = new ServerChannel(serverConfig.url, serverConfig.name, userId);
              const msgs = await channel.fetch();
              totalFetched += msgs.length;

              // Persist locally, then ack each persisted message
              for (const msg of msgs) {
                msg.from = `${msg.from}@${group}`;
                if (store.insert(msg)) newCount++;
                try {
                  await channel.ack(msg.id);
                } catch (err) {
                  console.error(`Server [${group}] ack failed for ${msg.id}: ${(err as Error).message}`);
                }
              }

              if (msgs.length > 0) {
                console.log(`Server [${group}]: fetched ${msgs.length} message(s)`);
              }
            }
          } catch (err) {
            console.error(`Server [${group}] fetch failed: ${(err as Error).message}`);
          }
        }

        console.log(
          `Total: ${totalFetched} message(s), ${newCount} new.`
        );
      } finally {
        store.close();
      }
    });
}

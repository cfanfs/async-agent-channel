import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { resolveChannelForContact, type ChannelType } from "../channel/router.js";
import { Workspace } from "../workspace/index.js";

export function registerSendCommand(program: Command): void {
  program
    .command("send")
    .description("Send a message to a contact")
    .requiredOption("--to <contact>", "recipient contact name")
    .option("--subject <subject>", "message subject")
    .option("--via <channel>", "force channel: email or server")
    .option("--file <path>", "attach file content (must be in outbound workspace)")
    .argument("[message]", "message body")
    .action(
      async (
        message: string | undefined,
        opts: { to: string; subject?: string; via?: string; file?: string }
      ) => {
        const cfg = loadConfig();

        let body = message ?? "";

        if (opts.file) {
          const ws = new Workspace(cfg.workspace);
          const abs = ws.assertOutbound(opts.file);
          const fileContent = readFileSync(abs, "utf-8");
          body = body ? `${body}\n\n---\n${fileContent}` : fileContent;
        }

        if (!body) {
          console.error("Provide a message or --file.");
          process.exit(1);
        }

        const subject =
          opts.subject ?? `[aac] Message from ${cfg.identity.name}`;

        const via = opts.via as ChannelType | undefined;
        const { channel, address, type } = await resolveChannelForContact(
          cfg,
          opts.to,
          via
        );

        await channel.send(address, subject, body);
        console.log(`Sent to ${opts.to} (${address}) via ${type}`);
      }
    );
}

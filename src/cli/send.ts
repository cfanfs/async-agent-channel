import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { EmailChannel } from "../channel/email/index.js";
import { Workspace } from "../workspace/index.js";

export function registerSendCommand(program: Command): void {
  program
    .command("send")
    .description("Send a message to a contact")
    .requiredOption("--to <contact>", "recipient contact name")
    .option("--subject <subject>", "message subject")
    .option("--file <path>", "attach file content (must be in outbound workspace)")
    .argument("[message]", "message body")
    .action(
      async (
        message: string | undefined,
        opts: { to: string; subject?: string; file?: string }
      ) => {
        const cfg = loadConfig();
        const email = cfg.contacts[opts.to];
        if (!email) {
          console.error(
            `Contact "${opts.to}" not found. Run: aac contacts list`
          );
          process.exit(1);
        }

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
        const channel = new EmailChannel(
          cfg.email.smtp,
          cfg.email.imap,
          cfg.identity.email
        );

        await channel.send(email, subject, body);
        console.log(`Sent to ${opts.to} (${email})`);
      }
    );
}

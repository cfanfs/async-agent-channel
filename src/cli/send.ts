import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../config.js";
import { resolveChannelForContact, type ChannelType } from "../channel/router.js";
import type { OutboundAttachment } from "../message/payload.js";
import { encodeMessagePayload } from "../message/payload.js";
import { Workspace } from "../workspace/index.js";

export function registerSendCommand(program: Command): void {
  program
    .command("send")
    .description("Send a message to a contact")
    .requiredOption("--to <contact>", "recipient contact name")
    .option("--subject <subject>", "message subject")
    .option("--via <channel>", "force channel: email or server")
    .option(
      "--file <path>",
      "attach file content (must be in outbound workspace)",
      collectOption,
      [] as string[]
    )
    .argument("[message]", "message body")
    .action(
      async (
        message: string | undefined,
        opts: { to: string; subject?: string; via?: string; file?: string[] }
      ) => {
        const cfg = loadConfig();

        let body = message ?? "";
        const ws = new Workspace(cfg.workspace);
        const attachments: OutboundAttachment[] = [];

        for (const filePath of opts.file ?? []) {
          const abs = ws.assertOutbound(filePath);
          attachments.push({
            name: basename(abs),
            content: readFileSync(abs),
          });
        }

        if (!body && attachments.length === 0) {
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

        await channel.send(address, subject, encodeMessagePayload(body, attachments));
        console.log(`Sent to ${opts.to} (${address}) via ${type}`);
      }
    );
}

function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

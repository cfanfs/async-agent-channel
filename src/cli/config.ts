import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  loadConfig,
  saveConfig,
  defaultConfig,
  configExists,
  getConfigPath,
} from "../config.js";
import { setCredential, getCredential } from "../keychain/index.js";
import { Workspace } from "../workspace/index.js";

export function registerConfigCommand(program: Command): void {
  const config = program.command("config").description("Manage configuration");

  config
    .command("init")
    .description("Initialize configuration interactively")
    .action(async () => {
      if (configExists()) {
        console.log(`Config already exists at ${getConfigPath()}`);
        console.log('Use "aac config show" to view or edit it directly.');
        return;
      }

      const rl = createInterface({ input: stdin, output: stdout });
      const cfg = defaultConfig();

      try {
        cfg.identity.name = await rl.question("Your name: ");
        cfg.identity.email = await rl.question("Your email: ");

        console.log("Outbound workspaces (directories whose content can be sent).");
        console.log("Enter paths one per line, empty line to finish.");
        console.log(`  Default: ${cfg.workspace.outbound[0]}`);
        const outboundPaths: string[] = [];
        while (true) {
          const line = await rl.question(`  outbound path: `);
          if (!line) break;
          outboundPaths.push(line);
        }
        if (outboundPaths.length > 0) cfg.workspace.outbound = outboundPaths;

        const inbound = await rl.question(
          `Inbound workspace [${cfg.workspace.inbound}]: `
        );
        if (inbound) cfg.workspace.inbound = inbound;

        const smtpHost = await rl.question(
          `SMTP host [${cfg.email.smtp.host}]: `
        );
        if (smtpHost) cfg.email.smtp.host = smtpHost;

        const smtpPort = await rl.question(
          `SMTP port [${cfg.email.smtp.port}]: `
        );
        if (smtpPort) cfg.email.smtp.port = parseInt(smtpPort, 10);

        cfg.email.smtp.user =
          (await rl.question(`SMTP user [${cfg.identity.email}]: `)) ||
          cfg.identity.email;

        const smtpPass = await rl.question("SMTP password: ");
        if (smtpPass) {
          await setCredential("smtp", cfg.email.smtp.user, smtpPass);
          console.log("SMTP password saved to system keychain.");
        }

        const imapHost = await rl.question(
          `IMAP host [${cfg.email.imap.host}]: `
        );
        if (imapHost) cfg.email.imap.host = imapHost;

        const imapPort = await rl.question(
          `IMAP port [${cfg.email.imap.port}]: `
        );
        if (imapPort) cfg.email.imap.port = parseInt(imapPort, 10);

        cfg.email.imap.user =
          (await rl.question(`IMAP user [${cfg.email.smtp.user}]: `)) ||
          cfg.email.smtp.user;

        const imapPass = await rl.question("IMAP password: ");
        if (imapPass) {
          await setCredential("imap", cfg.email.imap.user, imapPass);
          console.log("IMAP password saved to system keychain.");
        }

        saveConfig(cfg);
        console.log(`\nConfig saved to ${getConfigPath()} (mode 600)`);

        // Ensure workspace directories exist
        const ws = new Workspace(cfg.workspace);
        ws.ensureDirs();
        console.log(`Workspace dirs created:`);
        for (const dir of ws.outbound) {
          console.log(`  outbound: ${dir}`);
        }
        console.log(`  inbound:  ${ws.inbound}`);
      } finally {
        rl.close();
      }
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(async () => {
      const cfg = loadConfig();
      console.log(`Config: ${getConfigPath()}\n`);
      console.log(`Identity: ${cfg.identity.name} <${cfg.identity.email}>`);
      console.log(`Outbound workspaces:`);
      for (const dir of cfg.workspace.outbound) {
        console.log(`  - ${dir}`);
      }
      console.log(`Inbound workspace:  ${cfg.workspace.inbound}`);
      console.log(`SMTP: ${cfg.email.smtp.user}@${cfg.email.smtp.host}:${cfg.email.smtp.port}`);
      console.log(`IMAP: ${cfg.email.imap.user}@${cfg.email.imap.host}:${cfg.email.imap.port}`);

      const smtpCred = await getCredential("smtp", cfg.email.smtp.user);
      const imapCred = await getCredential("imap", cfg.email.imap.user);
      console.log(`SMTP password: ${smtpCred ? "●●●● (in keychain)" : "NOT SET"}`);
      console.log(`IMAP password: ${imapCred ? "●●●● (in keychain)" : "NOT SET"}`);

      const contacts = Object.entries(cfg.contacts);
      if (contacts.length > 0) {
        console.log(`\nContacts:`);
        for (const [name, email] of contacts) {
          console.log(`  ${name}: ${email}`);
        }
      } else {
        console.log(`\nNo contacts configured.`);
      }
    });

  config
    .command("set-credential <type>")
    .description("Store email credential in system keychain (smtp or imap)")
    .action(async (type: string) => {
      if (type !== "smtp" && type !== "imap") {
        console.error('Type must be "smtp" or "imap"');
        process.exit(1);
      }

      const cfg = loadConfig();
      const account =
        type === "smtp" ? cfg.email.smtp.user : cfg.email.imap.user;

      const rl = createInterface({ input: stdin, output: stdout });
      try {
        const password = await rl.question(`${type.toUpperCase()} password for ${account}: `);
        if (!password) {
          console.log("Aborted.");
          return;
        }
        await setCredential(type, account, password);
        console.log(`${type.toUpperCase()} password saved to system keychain.`);
      } finally {
        rl.close();
      }
    });
}

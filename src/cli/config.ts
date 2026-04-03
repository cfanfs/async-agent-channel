import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  loadConfig,
  saveConfig,
  defaultConfig,
  configExists,
  getConfigPath,
  resolveContact,
  getServersMap,
  resolveGroup,
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

        // Email config — defaultConfig() guarantees email exists here
        const email = cfg.email!;
        const smtpHost = await rl.question(
          `SMTP host [${email.smtp.host}]: `
        );
        if (smtpHost) email.smtp.host = smtpHost;

        const smtpPort = await rl.question(
          `SMTP port [${email.smtp.port}]: `
        );
        if (smtpPort) email.smtp.port = parseInt(smtpPort, 10);

        email.smtp.user =
          (await rl.question(`SMTP user [${cfg.identity.email}]: `)) ||
          cfg.identity.email;

        const smtpPass = await rl.question("SMTP password: ");
        if (smtpPass) {
          await setCredential("smtp", email.smtp.user, smtpPass);
          console.log("SMTP password saved to system keychain.");
        }

        const imapHost = await rl.question(
          `IMAP host [${email.imap.host}]: `
        );
        if (imapHost) email.imap.host = imapHost;

        const imapPort = await rl.question(
          `IMAP port [${email.imap.port}]: `
        );
        if (imapPort) email.imap.port = parseInt(imapPort, 10);

        email.imap.user =
          (await rl.question(`IMAP user [${email.smtp.user}]: `)) ||
          email.smtp.user;

        const imapPass = await rl.question("IMAP password: ");
        if (imapPass) {
          await setCredential("imap", email.imap.user, imapPass);
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

      if (cfg.email) {
        console.log(`SMTP: ${cfg.email.smtp.user}@${cfg.email.smtp.host}:${cfg.email.smtp.port}`);
        console.log(`IMAP: ${cfg.email.imap.user}@${cfg.email.imap.host}:${cfg.email.imap.port}`);
        const smtpCred = await getCredential("smtp", cfg.email.smtp.user);
        const imapCred = await getCredential("imap", cfg.email.imap.user);
        console.log(`SMTP password: ${smtpCred ? "●●●● (in keychain)" : "NOT SET"}`);
        console.log(`IMAP password: ${imapCred ? "●●●● (in keychain)" : "NOT SET"}`);
      } else {
        console.log("Email: not configured");
      }

      const serversMap = getServersMap(cfg);
      const groups = Object.entries(serversMap);
      if (groups.length > 0) {
        console.log(`Servers:`);
        for (const [group, sc] of groups) {
          console.log(`  ${group}: ${sc.url} (as ${sc.name})`);
        }
      } else {
        console.log("Servers: not configured");
      }

      const contacts = Object.entries(cfg.contacts);
      if (contacts.length > 0) {
        console.log(`\nContacts:`);
        for (const [name, entry] of contacts) {
          const info = resolveContact(entry);
          const parts: string[] = [];
          if (info.email) parts.push(`email: ${info.email}`);
          if (info.server) parts.push(`server: ${info.server}`);
          console.log(`  ${name}: ${parts.join(", ")}`);
        }
      } else {
        console.log(`\nNo contacts configured.`);
      }
    });

  config
    .command("set-credential <type>")
    .description("Store credential in system keychain (smtp, imap, or server)")
    .option("--group <group>", "Server group (for type=server)")
    .action(async (type: string, opts: { group?: string }) => {
      if (type !== "smtp" && type !== "imap" && type !== "server") {
        console.error('Type must be "smtp", "imap", or "server"');
        process.exit(1);
      }

      const cfg = loadConfig();
      let account: string;
      let credentialKey: string;
      if (type === "server") {
        const group = resolveGroup(cfg, opts.group);
        const serverConfig = getServersMap(cfg)[group]!;
        account = serverConfig.name;
        credentialKey = `server-${group}`;
      } else {
        if (!cfg.email) {
          console.error("Email not configured.");
          process.exit(1);
        }
        account = type === "smtp" ? cfg.email.smtp.user : cfg.email.imap.user;
        credentialKey = type;
      }

      const rl = createInterface({ input: stdin, output: stdout });
      try {
        const password = await rl.question(`${type.toUpperCase()} password for ${account}: `);
        if (!password) {
          console.log("Aborted.");
          return;
        }
        await setCredential(credentialKey, account, password);
        console.log(`${type.toUpperCase()} credential saved to system keychain.`);
      } finally {
        rl.close();
      }
    });
}

import type { Command } from "commander";
import { loadConfig, saveConfig, resolveContact, type ContactInfo } from "../config.js";

export function registerContactsCommand(program: Command): void {
  const contacts = program
    .command("contacts")
    .description("Manage contacts");

  contacts
    .command("list")
    .description("List all contacts")
    .action(async () => {
      const cfg = loadConfig();
      const entries = Object.entries(cfg.contacts);
      if (entries.length === 0) {
        console.log("No contacts configured.");
        return;
      }
      for (const [name, entry] of entries) {
        const info = resolveContact(entry);
        const parts: string[] = [];
        if (info.email) parts.push(`email: ${info.email}`);
        if (info.server) parts.push(`server: ${info.server}`);
        console.log(`${name}: ${parts.join(", ")}`);
      }
    });

  contacts
    .command("add <name>")
    .description("Add a contact")
    .argument("[email]", "contact email address")
    .option("--email <email>", "contact email address")
    .option("--server <name>", "member name on the relay server")
    .action(async (name: string, emailArg: string | undefined, opts: { email?: string; server?: string }) => {
      const cfg = loadConfig();
      const email = opts.email ?? emailArg;

      if (!email && !opts.server) {
        console.error("Provide an email address or --server <name>.");
        process.exit(1);
      }

      // Build the contact entry
      if (email && !opts.server) {
        // Simple email-only contact (backward compatible string format)
        cfg.contacts[name] = email;
      } else {
        // Polymorphic contact
        const existing = cfg.contacts[name] ? resolveContact(cfg.contacts[name]) : {};
        const updated: ContactInfo = { ...existing };
        if (email) updated.email = email;
        if (opts.server) updated.server = opts.server;
        cfg.contacts[name] = updated;
      }

      saveConfig(cfg);
      console.log(`Contact "${name}" saved.`);
    });

  contacts
    .command("remove <name>")
    .description("Remove a contact")
    .action(async (name: string) => {
      const cfg = loadConfig();
      if (!cfg.contacts[name]) {
        console.error(`Contact "${name}" not found.`);
        process.exit(1);
      }
      delete cfg.contacts[name];
      saveConfig(cfg);
      console.log(`Contact "${name}" removed.`);
    });
}

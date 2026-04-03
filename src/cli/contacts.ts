import type { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";

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
      for (const [name, email] of entries) {
        console.log(`${name}: ${email}`);
      }
    });

  contacts
    .command("add <name> <email>")
    .description("Add a contact")
    .action(async (name: string, email: string) => {
      const cfg = loadConfig();
      if (cfg.contacts[name]) {
        console.log(`Updating contact "${name}": ${cfg.contacts[name]} → ${email}`);
      }
      cfg.contacts[name] = email;
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

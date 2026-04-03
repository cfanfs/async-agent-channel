import type { Command } from "commander";
import { loadConfig, saveConfig, resolveContact, parseServerRef, getServersMap, getServerUserId, type ContactInfo } from "../config.js";
import { signRequest, HEADER_KEY_ID, HEADER_TIMESTAMP, HEADER_NONCE, HEADER_SIGNATURE } from "../channel/server/sign.js";

function signedHeaders(method: string, path: string, body: string, userId: string) {
  const { keyId, timestamp, nonce, signature } = signRequest(method, path, body, userId);
  return {
    [HEADER_KEY_ID]: keyId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
}

export function registerContactsCommand(program: Command): void {
  const contacts = program
    .command("contacts")
    .description("Manage contacts");

  contacts
    .command("list")
    .description("List all contacts")
    .option("--group <group>", "Filter contacts by server group")
    .action(async (opts: { group?: string }) => {
      const cfg = loadConfig();
      const entries = Object.entries(cfg.contacts);
      if (entries.length === 0) {
        console.log("No contacts configured.");
        return;
      }
      for (const [name, entry] of entries) {
        const info = resolveContact(entry);
        if (opts.group && info.server) {
          const { group } = parseServerRef(info.server);
          if (group !== opts.group) continue;
        } else if (opts.group && !info.server) {
          continue;
        }
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
    .option("--server <ref>", "member name on relay server (format: name@group)")
    .action(async (name: string, emailArg: string | undefined, opts: { email?: string; server?: string }) => {
      const cfg = loadConfig();
      const email = opts.email ?? emailArg;

      if (!email && !opts.server) {
        console.error("Provide an email address or --server <name@group>.");
        process.exit(1);
      }

      // Validate server ref format — require name@group
      if (opts.server) {
        if (!opts.server.includes("@")) {
          console.error(`Server ref must use name@group format (e.g. alice@work). Got: "${opts.server}"`);
          process.exit(1);
        }
        const { memberName, group } = parseServerRef(opts.server);
        const serversMap = getServersMap(cfg);
        const serverConfig = serversMap[group];
        if (!serverConfig) {
          console.error(`Server group "${group}" not found. Available: ${Object.keys(serversMap).join(", ") || "(none)"}`);
          process.exit(1);
        }

        // Remote validation: check if member exists on server
        const userId = await getServerUserId(cfg, group);
        if (userId) {
          try {
            const path = "/api/v1/members";
            const res = await fetch(`${serverConfig.url}${path}`, {
              method: "GET",
              headers: signedHeaders("GET", path, "", userId),
            });
            if (res.ok) {
              const data = await res.json() as { members: Array<{ name: string }> };
              const exists = data.members.some((m) => m.name === memberName);
              if (!exists) {
                console.warn(`Warning: member "${memberName}" not found on server group "${group}". Contact saved anyway.`);
              }
            }
          } catch {
            // Non-fatal: server might be unreachable, still save the contact
          }
        }
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

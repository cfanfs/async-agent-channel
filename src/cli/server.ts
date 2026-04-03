import type { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { loadConfig, saveConfig } from "../config.js";
import { setCredential, getCredential } from "../keychain/index.js";
import { RelayServer } from "../server/index.js";
import { generateUserId } from "../server/token.js";
import { deriveKeyId, signRequest, HEADER_KEY_ID, HEADER_TIMESTAMP, HEADER_NONCE, HEADER_SIGNATURE } from "../channel/server/sign.js";

function signedHeaders(method: string, path: string, body: string, userId: string) {
  const { keyId, timestamp, nonce, signature } = signRequest(method, path, body, userId);
  return {
    [HEADER_KEY_ID]: keyId,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_NONCE]: nonce,
    [HEADER_SIGNATURE]: signature,
  };
}

export function registerServerCommand(program: Command): void {
  const server = program.command("server").description("Manage relay server");

  server
    .command("init")
    .description("Initialize relay server database and create first user")
    .requiredOption("--db <url>", "PostgreSQL connection string")
    .option("--port <port>", "Server port", "9100")
    .action(async (opts: { db: string; port: string }) => {
      const relay = new RelayServer({
        port: parseInt(opts.port, 10),
        db: { connectionString: opts.db },
      });

      const store = relay.getStore();
      await store.migrate();

      const userId = generateUserId();
      const keyId = deriveKeyId(userId);
      await store.addMember(keyId, userId);

      console.log("Relay server initialized.");
      console.log(`\nYour user_id (save this — it won't be shown again):\n\n  ${userId}\n`);
      console.log("Next steps:");
      console.log("  1. Start the server:  aac server start --db <url>");
      console.log("  2. Join the server:   aac server join <server-url> --name <your-name>");
      console.log("     (paste the user_id when prompted)");

      await store.close();
    });

  server
    .command("start")
    .description("Start the relay server")
    .requiredOption("--db <url>", "PostgreSQL connection string")
    .option("--port <port>", "Server port", "9100")
    .option("--host <host>", "Bind host", "0.0.0.0")
    .action(async (opts: { db: string; port: string; host: string }) => {
      const relay = new RelayServer({
        port: parseInt(opts.port, 10),
        host: opts.host,
        db: { connectionString: opts.db },
      });

      await relay.start();

      const shutdown = async () => {
        console.log("\nStopping relay server...");
        await relay.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });

  server
    .command("join <url>")
    .description("Join a relay server with an invite user_id")
    .requiredOption("--name <name>", "Your display name on this server")
    .action(async (url: string, opts: { name: string }) => {
      // Validate local config exists before consuming the one-time invite
      let cfg;
      try {
        cfg = loadConfig();
      } catch {
        console.error("Config not found. Run `aac config init` first.");
        process.exit(1);
      }

      // Preflight: verify keychain is accessible
      try {
        await getCredential("server", "__preflight__");
      } catch (err) {
        console.error(`Keychain access failed: ${(err as Error).message}`);
        console.error("Fix your keychain setup before joining a server.");
        process.exit(1);
      }

      const rl = createInterface({ input: stdin, output: stdout });
      try {
        const userId = (await rl.question("Paste your user_id: ")).trim();
        if (!userId) {
          console.error("Aborted.");
          process.exit(1);
        }

        // Call the join endpoint — signed with user_id (no raw secret in body)
        const joinPath = "/api/v1/members/join";
        const body = JSON.stringify({ name: opts.name });
        const res = await fetch(`${url}${joinPath}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...signedHeaders("POST", joinPath, body, userId),
          },
          body,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error(`Join failed: ${res.status} ${(data as any).error ?? ""}`);
          process.exit(1);
        }

        // Save locally — if this fails, print recovery info
        const serverUrl = url.replace(/\/$/, "");
        try {
          cfg.server = { url: serverUrl, name: opts.name };
          saveConfig(cfg);
          await setCredential("server", opts.name, userId);
        } catch (err) {
          console.error(`Local persistence failed: ${(err as Error).message}`);
          console.error(`\nYour membership was created on the server. Save this for manual recovery:`);
          console.error(`  Server URL: ${serverUrl}`);
          console.error(`  Name:       ${opts.name}`);
          console.error(`  user_id:    ${userId}`);
          process.exit(1);
        }

        console.log(`Joined server as "${opts.name}".`);
        console.log(`Server URL saved to config. user_id stored in keychain.`);
      } finally {
        rl.close();
      }
    });

  server
    .command("invite")
    .description("Invite a new member to the relay server")
    .action(async () => {
      const cfg = loadConfig();
      if (!cfg.server) {
        console.error("Server not configured. Run: aac server join <url> --name <name>");
        process.exit(1);
      }

      const userId = await getCredential("server", cfg.server.name);
      if (!userId) {
        console.error("Server user_id not found in keychain.");
        process.exit(1);
      }

      const path = "/api/v1/members/invite";
      const body = "";

      const res = await fetch(`${cfg.server.url}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signedHeaders("POST", path, body, userId),
        },
        body,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error(`Invite failed: ${res.status} ${(data as any).error ?? ""}`);
        process.exit(1);
      }

      const data = await res.json() as { user_id: string };
      console.log(`Invite created. Share this user_id with the new member:\n\n  ${data.user_id}\n`);
      console.log(`They should run:  aac server join ${cfg.server.url} --name <their-name>`);
    });

  server
    .command("members")
    .description("List members on the relay server")
    .action(async () => {
      const cfg = loadConfig();
      if (!cfg.server) {
        console.error("Server not configured.");
        process.exit(1);
      }

      const userId = await getCredential("server", cfg.server.name);
      if (!userId) {
        console.error("Server user_id not found in keychain.");
        process.exit(1);
      }

      const path = "/api/v1/members";

      const res = await fetch(`${cfg.server.url}${path}`, {
        method: "GET",
        headers: signedHeaders("GET", path, "", userId),
      });

      if (!res.ok) {
        console.error(`Failed: ${res.status}`);
        process.exit(1);
      }

      const data = await res.json() as { members: Array<{ name: string; key_id: string }> };
      if (data.members.length === 0) {
        console.log("No members.");
        return;
      }
      for (const m of data.members) {
        const me = m.name === cfg.server!.name ? " (you)" : "";
        console.log(`  ${m.name}${me}`);
      }
    });
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parse, stringify } from "yaml";
import type { WorkspaceConfig } from "./workspace/index.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
}

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
}

export interface ServerConfig {
  url: string;
  name: string; // display name on this server
}

export interface ContactInfo {
  email?: string;
  server?: string; // member name on the server
}

export interface AacConfig {
  identity: {
    name: string;
    email: string;
  };
  workspace: WorkspaceConfig;
  email?: {
    smtp: SmtpConfig;
    imap: ImapConfig;
  };
  server?: ServerConfig; // DEPRECATED — kept for migration only
  servers?: Record<string, ServerConfig>;
  contacts: Record<string, string | ContactInfo>;
}

/** Normalize a contact entry to ContactInfo. */
export function resolveContact(entry: string | ContactInfo): ContactInfo {
  if (typeof entry === "string") return { email: entry };
  return entry;
}

/** Determine the preferred channel for a contact. */
export function getContactChannel(
  contact: ContactInfo,
  serverConfigured: boolean
): "server" | "email" {
  if (contact.server && serverConfigured) return "server";
  if (contact.email) return "email";
  throw new Error("Contact has no reachable channel configured.");
}

// --- Multi-server helpers ---

/** Parse "alice@work" → { memberName: "alice", group: "work" }. Bare name defaults to "default". */
export function parseServerRef(ref: string): { memberName: string; group: string } {
  const at = ref.lastIndexOf("@");
  if (at === -1) return { memberName: ref, group: "default" };
  return { memberName: ref.slice(0, at), group: ref.slice(at + 1) };
}

/** Get servers map with legacy fallback: single `server` → `{ default: server }`. */
export function getServersMap(cfg: AacConfig): Record<string, ServerConfig> {
  if (cfg.servers && Object.keys(cfg.servers).length > 0) return cfg.servers;
  if (cfg.server) return { default: cfg.server };
  return {};
}

/** Look up a specific server group. Throws with helpful error if not found. */
export function getServerConfig(cfg: AacConfig, group: string): ServerConfig {
  const map = getServersMap(cfg);
  const sc = map[group];
  if (!sc) {
    const available = Object.keys(map);
    throw new Error(
      available.length > 0
        ? `Server group "${group}" not found. Available: ${available.join(", ")}`
        : "No servers configured. Run: aac server join <url> --name <name> --group <alias>"
    );
  }
  return sc;
}

/** Resolve group when --group is optional: use it if given, default to the only group, error if ambiguous. */
export function resolveGroup(cfg: AacConfig, explicit?: string): string {
  if (explicit) return explicit;
  const groups = Object.keys(getServersMap(cfg));
  if (groups.length === 0) throw new Error("No servers configured.");
  if (groups.length === 1) return groups[0];
  throw new Error(`Multiple server groups configured. Specify --group: ${groups.join(", ")}`);
}

/** Migrate legacy config: single server → servers map, bare contact names → name@default. */
function migrateConfig(cfg: AacConfig): boolean {
  let migrated = false;

  if (cfg.server && !cfg.servers) {
    cfg.servers = { default: cfg.server };
    delete cfg.server;
    migrated = true;
  }

  for (const [, entry] of Object.entries(cfg.contacts)) {
    if (typeof entry === "object" && entry.server && !entry.server.includes("@")) {
      entry.server = `${entry.server}@default`;
      migrated = true;
    }
  }

  return migrated;
}

const CONFIG_DIR = join(homedir(), ".config", "aac");
const CONFIG_PATH = join(CONFIG_DIR, "config.yaml");

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): AacConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(
      `Config not found at ${CONFIG_PATH}. Run "aac config init" to get started.`
    );
  }
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const cfg = parse(raw) as AacConfig;
  if (migrateConfig(cfg)) {
    saveConfig(cfg);
  }
  return cfg;
}

export function saveConfig(config: AacConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, stringify(config), { mode: 0o600 });
}

export function defaultConfig(): AacConfig {
  return {
    identity: {
      name: "",
      email: "",
    },
    workspace: {
      outbound: ["~/aac-workspace/shared"],
      inbound: "~/aac-workspace/received",
    },
    email: {
      smtp: { host: "smtp.gmail.com", port: 587, user: "" },
      imap: { host: "imap.gmail.com", port: 993, user: "" },
    },
    contacts: {},
  };
}

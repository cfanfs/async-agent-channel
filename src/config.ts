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
  server?: ServerConfig;
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
  return parse(raw) as AacConfig;
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

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

export interface AacConfig {
  identity: {
    name: string;
    email: string;
  };
  workspace: WorkspaceConfig;
  email: {
    smtp: SmtpConfig;
    imap: ImapConfig;
  };
  contacts: Record<string, string>;
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

import { detectUpdateMode } from "../update/self.js";

export interface McpLaunchSpec {
  command: string;
  args: string[];
  cwd?: string;
}

export interface ClaudeCodeServerConfig extends McpLaunchSpec {
  type: "stdio";
}

export type ClaudeCodeScope = "local" | "project" | "user";

export function buildMcpLaunchSpec(
  packageDir: string,
  scriptPath: string,
  hasGit: boolean
): McpLaunchSpec {
  const mode = detectUpdateMode(packageDir, scriptPath, hasGit);

  if (mode === "linked-source") {
    return {
      command: "node",
      args: ["dist/cli/index.js", "mcp"],
      cwd: packageDir,
    };
  }

  return {
    command: "aac",
    args: ["mcp"],
  };
}

export function buildOpenClawConfig(spec: McpLaunchSpec): McpLaunchSpec {
  return spec.cwd
    ? { command: spec.command, args: spec.args, cwd: spec.cwd }
    : { command: spec.command, args: spec.args };
}

export function buildClaudeCodeConfig(spec: McpLaunchSpec): ClaudeCodeServerConfig {
  return spec.cwd
    ? { type: "stdio", command: spec.command, args: spec.args, cwd: spec.cwd }
    : { type: "stdio", command: spec.command, args: spec.args };
}

export function buildClaudeCodeProjectConfig(
  name: string,
  spec: McpLaunchSpec
): { mcpServers: Record<string, ClaudeCodeServerConfig> } {
  return {
    mcpServers: {
      [name]: buildClaudeCodeConfig(spec),
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function shellJoin(parts: string[]): string {
  return parts.map(shellQuote).join(" ");
}

export function formatOpenClawSetCommand(name: string, spec: McpLaunchSpec): string {
  const json = JSON.stringify(buildOpenClawConfig(spec));
  return shellJoin(["openclaw", "mcp", "set", name, json]);
}

export function formatClaudeCodeAddJsonCommand(
  name: string,
  spec: McpLaunchSpec,
  scope?: ClaudeCodeScope
): string {
  const json = JSON.stringify(buildClaudeCodeConfig(spec));
  const parts = ["claude", "mcp", "add-json", name, json];
  if (scope) {
    parts.push("--scope", scope);
  }
  return shellJoin(parts);
}

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Command } from "commander";
import {
  buildClaudeCodeConfig,
  buildClaudeCodeProjectConfig,
  buildMcpLaunchSpec,
  buildOpenClawConfig,
  formatClaudeCodeAddJsonCommand,
  formatOpenClawSetCommand,
  type ClaudeCodeScope,
} from "../integration/mcp.js";
import { getPackageDir } from "../update/self.js";

function resolveCommand(command: string): string {
  if (process.platform === "win32") {
    if (command === "claude") return "claude.cmd";
    if (command === "openclaw") return "openclaw.cmd";
  }
  return command;
}

function getLaunchSpec() {
  const packageDir = getPackageDir(import.meta.url);
  const scriptPath = process.argv[1] ?? "";
  return buildMcpLaunchSpec(packageDir, scriptPath, existsSync(`${packageDir}/.git`));
}

function runExternal(command: string, args: string[]) {
  const result = spawnSync(resolveCommand(command), args, { stdio: "inherit" });

  if (result.error) {
    throw new Error(`${command} not found or failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

export function registerIntegrationCommand(program: Command): void {
  const integration = program
    .command("integration")
    .description("Print or apply MCP client setup helpers");

  integration
    .command("openclaw")
    .description("Print or apply the OpenClaw MCP registration command")
    .option("--name <name>", "MCP server name", "aac")
    .option("--apply", "Run openclaw mcp set instead of only printing")
    .action((opts: { name: string; apply?: boolean }) => {
      const spec = getLaunchSpec();

      if (opts.apply) {
        runExternal("openclaw", [
          "mcp",
          "set",
          opts.name,
          JSON.stringify(buildOpenClawConfig(spec)),
        ]);
        return;
      }

      console.log(formatOpenClawSetCommand(opts.name, spec));
    });

  integration
    .command("claude-code")
    .description("Print or apply the Claude Code MCP registration command")
    .option("--name <name>", "MCP server name", "aac")
    .option("--scope <scope>", "Claude Code scope: local, project, or user")
    .option("--apply", "Run claude mcp add-json instead of only printing")
    .action((opts: { name: string; scope?: string; apply?: boolean }) => {
      const spec = getLaunchSpec();
      const scope = opts.scope as ClaudeCodeScope | undefined;

      if (opts.apply) {
        const args = [
          "mcp",
          "add-json",
          opts.name,
          JSON.stringify(buildClaudeCodeConfig(spec)),
        ];
        if (scope) {
          args.push("--scope", scope);
        }
        runExternal("claude", args);
        return;
      }

      console.log(formatClaudeCodeAddJsonCommand(opts.name, spec, scope));
    });

  integration
    .command("json")
    .description("Print MCP JSON for manual client configuration")
    .option("--client <client>", "Target client: openclaw or claude-code", "claude-code")
    .option("--name <name>", "Server name used for wrapped Claude Code output", "aac")
    .option("--wrapped", "Wrap Claude Code output as a full .mcp.json object")
    .action((opts: { client: string; name: string; wrapped?: boolean }) => {
      const spec = getLaunchSpec();

      if (opts.client === "openclaw") {
        console.log(JSON.stringify(buildOpenClawConfig(spec), null, 2));
        return;
      }

      if (opts.client === "claude-code" && opts.wrapped) {
        console.log(JSON.stringify(buildClaudeCodeProjectConfig(opts.name, spec), null, 2));
        return;
      }

      console.log(JSON.stringify(buildClaudeCodeConfig(spec), null, 2));
    });
}

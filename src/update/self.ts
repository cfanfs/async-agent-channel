import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type UpdateMode =
  | "linked-source"
  | "global-npm"
  | "global-pnpm"
  | "global-yarn";

export interface UpdateCommandSpec {
  command: string;
  args: string[];
  cwd?: string;
}

export interface UpdatePlan {
  mode: UpdateMode;
  packageDir: string;
  summary: string;
  commands: UpdateCommandSpec[];
}

export function getPackageDir(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "../..");
}

export function detectUpdateMode(
  packageDir: string,
  scriptPath: string,
  hasGit = existsSync(join(packageDir, ".git"))
): UpdateMode {
  if (hasGit) return "linked-source";

  const haystack = `${packageDir} ${scriptPath}`.toLowerCase();
  if (haystack.includes("pnpm")) return "global-pnpm";
  if (haystack.includes("yarn")) return "global-yarn";
  return "global-npm";
}

export function buildUpdatePlan(
  packageDir: string,
  scriptPath: string,
  hasGit = existsSync(join(packageDir, ".git"))
): UpdatePlan {
  const mode = detectUpdateMode(packageDir, scriptPath, hasGit);

  switch (mode) {
    case "linked-source":
      return {
        mode,
        packageDir,
        summary: `Detected source checkout at ${packageDir}`,
        commands: [
          { command: "git", args: ["pull", "--ff-only"], cwd: packageDir },
          { command: "pnpm", args: ["install"], cwd: packageDir },
          { command: "pnpm", args: ["build"], cwd: packageDir },
        ],
      };
    case "global-pnpm":
      return {
        mode,
        packageDir,
        summary: "Detected global pnpm install",
        commands: [
          { command: "pnpm", args: ["add", "-g", "@cfanfs/aac@latest"] },
        ],
      };
    case "global-yarn":
      return {
        mode,
        packageDir,
        summary: "Detected global yarn install",
        commands: [
          { command: "yarn", args: ["global", "add", "@cfanfs/aac@latest"] },
        ],
      };
    case "global-npm":
      return {
        mode,
        packageDir,
        summary: "Detected global npm install",
        commands: [
          { command: "npm", args: ["install", "-g", "@cfanfs/aac@latest"] },
        ],
      };
  }
}

function resolveCommand(command: string): string {
  if (process.platform === "win32") {
    if (command === "npm") return "npm.cmd";
    if (command === "pnpm") return "pnpm.cmd";
    if (command === "yarn") return "yarn.cmd";
  }
  return command;
}

export function formatCommand(spec: UpdateCommandSpec): string {
  return [spec.command, ...spec.args].join(" ");
}

export function runUpdatePlan(plan: UpdatePlan): void {
  for (const command of plan.commands) {
    console.log(`> ${formatCommand(command)}`);
    const result = spawnSync(resolveCommand(command.command), command.args, {
      cwd: command.cwd,
      stdio: "inherit",
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(
        `Update command failed (${result.status}): ${formatCommand(command)}`
      );
    }
  }
}

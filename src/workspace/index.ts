import { resolve, relative } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";

export interface WorkspaceConfig {
  outbound: string[];
  inbound: string;
}

/** Resolve ~ and relative paths to absolute */
function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

function isUnderDir(filePath: string, dir: string): boolean {
  return filePath.startsWith(dir + "/") || filePath === dir;
}

export class Workspace {
  readonly outbound: string[];
  readonly inbound: string;

  constructor(config: WorkspaceConfig) {
    this.outbound = config.outbound.map(expandPath);
    this.inbound = expandPath(config.inbound);
  }

  /** Ensure workspace directories exist */
  ensureDirs(): void {
    for (const dir of this.outbound) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    if (!existsSync(this.inbound)) {
      mkdirSync(this.inbound, { recursive: true });
    }
  }

  /** Check if a path is within any outbound workspace */
  isOutboundPath(filePath: string): boolean {
    const abs = expandPath(filePath);
    return this.outbound.some((dir) => isUnderDir(abs, dir));
  }

  /** Check if a path is within the inbound workspace */
  isInboundPath(filePath: string): boolean {
    const abs = expandPath(filePath);
    return isUnderDir(abs, this.inbound);
  }

  /**
   * Validate that a path is safe for outbound (sending).
   * Throws if the path is outside all outbound workspaces.
   */
  assertOutbound(filePath: string): string {
    const abs = expandPath(filePath);
    if (!this.isOutboundPath(abs)) {
      throw new Error(
        `Security: path "${filePath}" is outside all outbound workspaces`
      );
    }
    return abs;
  }

  /**
   * Validate that a path is safe for inbound (receiving).
   * Throws if the path is outside the inbound workspace.
   */
  assertInbound(filePath: string): string {
    const abs = expandPath(filePath);
    if (!this.isInboundPath(abs)) {
      throw new Error(
        `Security: path "${filePath}" is outside inbound workspace "${this.inbound}"`
      );
    }
    return abs;
  }

  /** List files across all outbound workspaces. Returns relative paths grouped by root. */
  listOutboundFiles(): Array<{ root: string; files: string[] }> {
    return this.outbound.map((root) => ({
      root,
      files: existsSync(root) ? listFilesRecursive(root, root) : [],
    }));
  }

  /** Read a file from outbound workspace. Validates path first. */
  readOutboundFile(filePath: string): string {
    const abs = this.assertOutbound(filePath);
    return readFileSync(abs, "utf-8");
  }

  /** Write content to inbound workspace. Validates path first. */
  writeInboundFile(filePath: string, content: string): void {
    const abs = this.assertInbound(filePath);
    const dir = resolve(abs, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(abs, content, "utf-8");
  }
}

function listFilesRecursive(dir: string, root: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, root));
    } else {
      results.push(relative(root, full));
    }
  }
  return results;
}

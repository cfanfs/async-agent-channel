import { describe, expect, it } from "vitest";
import {
  buildClaudeCodeConfig,
  buildClaudeCodeProjectConfig,
  buildMcpLaunchSpec,
  buildOpenClawConfig,
  formatClaudeCodeAddJsonCommand,
  formatOpenClawSetCommand,
} from "./mcp.js";

describe("buildMcpLaunchSpec", () => {
  it("uses the built dist entry for source checkouts", () => {
    expect(buildMcpLaunchSpec("/work/aac", "/usr/local/bin/aac", true)).toEqual({
      command: "node",
      args: ["dist/cli/index.js", "mcp"],
      cwd: "/work/aac",
    });
  });

  it("uses the installed aac command for global installs", () => {
    expect(
      buildMcpLaunchSpec(
        "/Users/me/.nvm/versions/node/v20/lib/node_modules/@cfanfs/aac",
        "/Users/me/.nvm/versions/node/v20/bin/aac",
        false
      )
    ).toEqual({
      command: "aac",
      args: ["mcp"],
    });
  });
});

describe("buildOpenClawConfig", () => {
  it("keeps stdio fields without adding client-specific metadata", () => {
    expect(
      buildOpenClawConfig({
        command: "node",
        args: ["dist/cli/index.js", "mcp"],
        cwd: "/work/aac",
      })
    ).toEqual({
      command: "node",
      args: ["dist/cli/index.js", "mcp"],
      cwd: "/work/aac",
    });
  });
});

describe("buildClaudeCodeConfig", () => {
  it("adds the stdio type required by Claude Code JSON config", () => {
    expect(
      buildClaudeCodeConfig({
        command: "node",
        args: ["dist/cli/index.js", "mcp"],
        cwd: "/work/aac",
      })
    ).toEqual({
      type: "stdio",
      command: "node",
      args: ["dist/cli/index.js", "mcp"],
      cwd: "/work/aac",
    });
  });
});

describe("buildClaudeCodeProjectConfig", () => {
  it("wraps the server config in .mcp.json shape", () => {
    expect(
      buildClaudeCodeProjectConfig("aac", {
        command: "aac",
        args: ["mcp"],
      })
    ).toEqual({
      mcpServers: {
        aac: {
          type: "stdio",
          command: "aac",
          args: ["mcp"],
        },
      },
    });
  });
});

describe("command formatting", () => {
  it("formats the OpenClaw registration command", () => {
    expect(
      formatOpenClawSetCommand("aac", {
        command: "aac",
        args: ["mcp"],
      })
    ).toBe(`'openclaw' 'mcp' 'set' 'aac' '{"command":"aac","args":["mcp"]}'`);
  });

  it("formats the Claude Code add-json command with scope", () => {
    expect(
      formatClaudeCodeAddJsonCommand(
        "aac",
        {
          command: "node",
          args: ["dist/cli/index.js", "mcp"],
          cwd: "/work/aac",
        },
        "user"
      )
    ).toBe(
      `'claude' 'mcp' 'add-json' 'aac' '{"type":"stdio","command":"node","args":["dist/cli/index.js","mcp"],"cwd":"/work/aac"}' '--scope' 'user'`
    );
  });
});

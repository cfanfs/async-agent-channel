import { describe, it, expect } from "vitest";
import {
  buildUpdatePlan,
  detectUpdateMode,
  formatCommand,
} from "./self.js";

describe("detectUpdateMode", () => {
  it("prefers linked source when the package dir is a git checkout", () => {
    expect(
      detectUpdateMode("/tmp/aac", "/usr/local/bin/aac", true)
    ).toBe("linked-source");
  });

  it("detects pnpm global installs from the script path", () => {
    expect(
      detectUpdateMode(
        "/Users/me/Library/pnpm/global/5/node_modules/@cfanfs/aac",
        "/Users/me/Library/pnpm/aac",
        false
      )
    ).toBe("global-pnpm");
  });

  it("detects yarn global installs from the script path", () => {
    expect(
      detectUpdateMode(
        "/Users/me/.config/yarn/global/node_modules/@cfanfs/aac",
        "/Users/me/.yarn/bin/aac",
        false
      )
    ).toBe("global-yarn");
  });

  it("defaults to npm for other global installs", () => {
    expect(
      detectUpdateMode(
        "/Users/me/.nvm/versions/node/v20/lib/node_modules/@cfanfs/aac",
        "/Users/me/.nvm/versions/node/v20/bin/aac",
        false
      )
    ).toBe("global-npm");
  });
});

describe("buildUpdatePlan", () => {
  it("builds the linked-source update sequence", () => {
    const plan = buildUpdatePlan("/work/aac", "/usr/local/bin/aac", true);

    expect(plan.mode).toBe("linked-source");
    expect(plan.commands).toEqual([
      { command: "git", args: ["pull", "--ff-only"], cwd: "/work/aac" },
      { command: "pnpm", args: ["install"], cwd: "/work/aac" },
      { command: "pnpm", args: ["build"], cwd: "/work/aac" },
    ]);
  });

  it("builds the npm global update command", () => {
    const plan = buildUpdatePlan(
      "/Users/me/.nvm/versions/node/v20/lib/node_modules/@cfanfs/aac",
      "/Users/me/.nvm/versions/node/v20/bin/aac",
      false
    );

    expect(plan.mode).toBe("global-npm");
    expect(plan.commands).toEqual([
      { command: "npm", args: ["install", "-g", "@cfanfs/aac@latest"] },
    ]);
  });
});

describe("formatCommand", () => {
  it("formats commands for display", () => {
    expect(
      formatCommand({ command: "pnpm", args: ["add", "-g", "@cfanfs/aac@latest"] })
    ).toBe("pnpm add -g @cfanfs/aac@latest");
  });
});

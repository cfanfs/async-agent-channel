import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AacConfig } from "./config.js";

const {
  deleteCredentialMock,
  getCredentialMock,
  setCredentialMock,
} = vi.hoisted(() => ({
  getCredentialMock: vi.fn(),
  setCredentialMock: vi.fn(),
  deleteCredentialMock: vi.fn(),
}));

vi.mock("./keychain/index.js", () => ({
  getCredential: getCredentialMock,
  setCredential: setCredentialMock,
  deleteCredential: deleteCredentialMock,
}));

function makeConfig(): AacConfig {
  return {
    identity: { name: "me", email: "me@example.com" },
    workspace: { outbound: ["/tmp/out"], inbound: "/tmp/in" },
    servers: {
      default: { url: "http://localhost:9100", name: "me" },
    },
    contacts: {},
  };
}

describe("getServerUserId", () => {
  beforeEach(() => {
    vi.resetModules();
    getCredentialMock.mockReset();
    setCredentialMock.mockReset();
    deleteCredentialMock.mockReset();
    setCredentialMock.mockResolvedValue(undefined);
    deleteCredentialMock.mockResolvedValue(undefined);
  });

  it("migrates legacy single-server credentials to the default group", async () => {
    let defaultLookups = 0;
    getCredentialMock.mockImplementation(async (key: string, account: string) => {
      if (key === "server" && account === "me") return "legacy-user-id";
      if (key === "server-default" && account === "me") {
        defaultLookups += 1;
        return defaultLookups === 1 ? null : "legacy-user-id";
      }
      return null;
    });

    const { getServerUserId } = await import("./config.js");
    const userId = await getServerUserId(makeConfig(), "default");

    expect(userId).toBe("legacy-user-id");
    expect(getCredentialMock).toHaveBeenCalledWith("server", "me");
    expect(setCredentialMock).toHaveBeenCalledWith(
      "server-default",
      "me",
      "legacy-user-id"
    );
    expect(deleteCredentialMock).toHaveBeenCalledWith("server", "me");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveChannelForContact } from "./router.js";
import type { AacConfig } from "../config.js";

// Mock getCredential to avoid keychain access in tests
vi.mock("../keychain/index.js", () => ({
  getCredential: vi.fn(async (key: string, account: string) => {
    if (key === "server-default" && account === "me") return "test-user-id";
    if (key === "server-work" && account === "me") return "test-user-id-work";
    return null;
  }),
}));

function makeConfig(overrides?: Partial<AacConfig>): AacConfig {
  return {
    identity: { name: "me", email: "me@example.com" },
    workspace: { outbound: ["/tmp/out"], inbound: "/tmp/in" },
    email: {
      smtp: { host: "smtp.example.com", port: 587, user: "me@example.com" },
      imap: { host: "imap.example.com", port: 993, user: "me@example.com" },
    },
    servers: { default: { url: "http://localhost:9100", name: "me" } },
    contacts: {
      alice: "alice@example.com",
      bob: { email: "bob@example.com", server: "bob@default" },
      carol: { server: "carol@default" },
      dave: { email: "dave@example.com" },
    },
    ...overrides,
  };
}

describe("resolveChannelForContact", () => {
  it("email-only contact (string) → EmailChannel", async () => {
    const result = await resolveChannelForContact(makeConfig(), "alice");
    expect(result.type).toBe("email");
    expect(result.address).toBe("alice@example.com");
  });

  it("server-only contact → ServerChannel", async () => {
    const result = await resolveChannelForContact(makeConfig(), "carol");
    expect(result.type).toBe("server");
    expect(result.address).toBe("carol");
  });

  it("both channels → prefers server", async () => {
    const result = await resolveChannelForContact(makeConfig(), "bob");
    expect(result.type).toBe("server");
    expect(result.address).toBe("bob");
  });

  it("both channels + via email → uses email", async () => {
    const result = await resolveChannelForContact(makeConfig(), "bob", "email");
    expect(result.type).toBe("email");
    expect(result.address).toBe("bob@example.com");
  });

  it("email contact + via server (no servers) → throws", async () => {
    const cfg = makeConfig({ servers: undefined });
    await expect(
      resolveChannelForContact(cfg, "dave", "server")
    ).rejects.toThrow("no server member name configured");
  });

  it("email contact + via server (no server field on contact) → throws", async () => {
    await expect(
      resolveChannelForContact(makeConfig(), "dave", "server")
    ).rejects.toThrow("no server member name configured");
  });

  it("unknown contact → throws", async () => {
    await expect(
      resolveChannelForContact(makeConfig(), "unknown")
    ).rejects.toThrow('Contact "unknown" not found');
  });

  it("server contact without server config → falls back to email", async () => {
    const cfg = makeConfig({ servers: undefined });
    const result = await resolveChannelForContact(cfg, "bob");
    expect(result.type).toBe("email");
  });

  it("server contact without server config and no email → throws", async () => {
    const cfg = makeConfig({ servers: undefined });
    await expect(
      resolveChannelForContact(cfg, "carol")
    ).rejects.toThrow("no reachable channel");
  });

  it("contact on specific group resolves correctly", async () => {
    const cfg = makeConfig({
      servers: {
        default: { url: "http://localhost:9100", name: "me" },
        work: { url: "http://work:9100", name: "me" },
      },
      contacts: {
        eve: { server: "eve@work" },
      },
    });
    const result = await resolveChannelForContact(cfg, "eve");
    expect(result.type).toBe("server");
    expect(result.address).toBe("eve");
  });

  it("contact referencing nonexistent group → throws", async () => {
    const cfg = makeConfig({
      contacts: { eve: { server: "eve@nonexistent" } },
    });
    await expect(
      resolveChannelForContact(cfg, "eve")
    ).rejects.toThrow('Server group "nonexistent" not found');
  });
});

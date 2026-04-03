import type { Channel } from "./types.js";
import { EmailChannel } from "./email/index.js";
import { ServerChannel } from "./server/index.js";
import type { AacConfig, ContactInfo } from "../config.js";
import { resolveContact, getContactChannel, parseServerRef, getServersMap, getServerConfig } from "../config.js";
import { getCredential } from "../keychain/index.js";

export type ChannelType = "email" | "server";

export interface ResolvedChannel {
  channel: Channel;
  address: string; // email address or member name
  type: ChannelType;
}

/**
 * Resolve the best channel for a contact.
 * Returns the Channel instance, the target address, and the channel type.
 */
export async function resolveChannelForContact(
  cfg: AacConfig,
  contactName: string,
  viaOverride?: ChannelType
): Promise<ResolvedChannel> {
  const raw = cfg.contacts[contactName];
  if (!raw) {
    throw new Error(`Contact "${contactName}" not found.`);
  }

  const contact = resolveContact(raw);
  const serverConfigured = Object.keys(getServersMap(cfg)).length > 0;
  const type = viaOverride ?? getContactChannel(contact, serverConfigured);

  if (type === "server") {
    return resolveServerChannel(cfg, contact, contactName);
  }
  return resolveEmailChannel(cfg, contact, contactName);
}

async function resolveServerChannel(
  cfg: AacConfig,
  contact: ContactInfo,
  contactName: string
): Promise<ResolvedChannel> {
  if (!contact.server) {
    throw new Error(
      `Contact "${contactName}" has no server member name configured. Use: aac contacts add ${contactName} --server <name@group>`
    );
  }

  const { memberName, group } = parseServerRef(contact.server);
  const serverConfig = getServerConfig(cfg, group);

  const userId = await getCredential(`server-${group}`, serverConfig.name);
  if (!userId) {
    throw new Error(
      `Server user_id not found in keychain for group "${group}" (name: "${serverConfig.name}"). Run: aac config set-credential server --group ${group}`
    );
  }

  const channel = new ServerChannel(serverConfig.url, serverConfig.name, userId);
  return { channel, address: memberName, type: "server" };
}

async function resolveEmailChannel(
  cfg: AacConfig,
  contact: ContactInfo,
  contactName: string
): Promise<ResolvedChannel> {
  if (!contact.email) {
    throw new Error(`Contact "${contactName}" has no email configured.`);
  }
  if (!cfg.email) {
    throw new Error("Email channel not configured.");
  }

  const channel = new EmailChannel(cfg.email.smtp, cfg.email.imap, cfg.identity.email);
  return { channel, address: contact.email, type: "email" };
}

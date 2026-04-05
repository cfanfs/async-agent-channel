import {
  getServerConfig,
  getServerUserId,
  getServersMap,
  loadConfig,
} from "../config.js";
import { ServerChannel } from "../channel/server/index.js";
import type { Message } from "../message/types.js";
import type { MessageStore } from "../store/index.js";

function inferLegacyServerGroup(message: Message, groups: string[]): string | null {
  for (const group of groups) {
    if (message.from.endsWith(`@${group}`)) {
      return group;
    }
  }

  return null;
}

async function ackRemoteServerMessage(message: Message): Promise<void> {
  const cfg = loadConfig();
  const groups = Object.keys(getServersMap(cfg));
  const group = message.serverGroup ?? inferLegacyServerGroup(message, groups);
  if (!group) {
    throw new Error(
      `Message "${message.id}" is missing relay group metadata and cannot be acknowledged remotely.`
    );
  }

  const serverConfig = getServerConfig(cfg, group);
  const userId = await getServerUserId(cfg, group);
  if (!userId) {
    throw new Error(
      `Server user_id not found in keychain for group "${group}" (name: "${serverConfig.name}"). Run: aac config set-credential server --group ${group}`
    );
  }

  const channel = new ServerChannel(serverConfig.url, serverConfig.name, userId);
  await channel.ack(message.id);
}

export async function acknowledgeStoredMessage(
  store: MessageStore,
  id: string
): Promise<boolean> {
  const message = store.get(id);
  if (!message) return false;

  let shouldAckRelay = message.channel === "server" || !!message.serverGroup;
  if (!shouldAckRelay && message.channel !== "email") {
    const cfg = loadConfig();
    shouldAckRelay = !!inferLegacyServerGroup(
      message,
      Object.keys(getServersMap(cfg))
    );
  }

  if (shouldAckRelay) {
    await ackRemoteServerMessage(message);
  }

  return store.updateStatus(id, "acked");
}

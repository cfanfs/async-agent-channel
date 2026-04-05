import { Workspace, type WorkspaceConfig } from "../workspace/index.js";
import { decodeMessagePayload } from "../message/payload.js";
import type { Message, MessageAttachment } from "../message/types.js";

export function materializeIncomingMessage(
  message: Message,
  workspaceConfig: WorkspaceConfig
): Message {
  const payload = decodeMessagePayload(message.body);
  const workspace = new Workspace(workspaceConfig);
  const attachments: MessageAttachment[] = payload.attachments.map((attachment) => ({
    name: attachment.name,
    path: workspace.writeInboundAttachment(message.id, attachment.name, attachment.content),
  }));

  return {
    ...message,
    body: payload.body,
    attachments,
  };
}

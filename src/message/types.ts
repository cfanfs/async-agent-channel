export type MessageStatus = "unread" | "read" | "acked" | "snoozed";
export type MessageChannel = "email" | "server";

export interface MessageAttachment {
  name: string;
  path: string;
}

export interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: Date;
  status: MessageStatus;
  channel?: MessageChannel;
  serverGroup?: string | null;
  attachments?: MessageAttachment[];
}

export interface MessageSummary {
  id: string;
  from: string;
  subject: string;
  timestamp: Date;
  status: MessageStatus;
  channel?: MessageChannel;
  serverGroup?: string | null;
  attachments?: MessageAttachment[];
}

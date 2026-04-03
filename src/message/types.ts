export type MessageStatus = "unread" | "read" | "acked" | "snoozed";

export interface Message {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: Date;
  status: MessageStatus;
}

export interface MessageSummary {
  id: string;
  from: string;
  subject: string;
  timestamp: Date;
  status: MessageStatus;
}

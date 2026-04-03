import type { Message } from "../message/types.js";

export interface Channel {
  /** Send a message to a recipient */
  send(to: string, subject: string, body: string): Promise<void>;

  /** Fetch new messages from the remote source into local store */
  fetch(): Promise<Message[]>;
}

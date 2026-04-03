#!/usr/bin/env node

import { Command } from "commander";
import { registerSendCommand } from "./send.js";
import { registerInboxCommand } from "./inbox.js";
import { registerFetchCommand } from "./fetch.js";
import { registerContactsCommand } from "./contacts.js";
import { registerConfigCommand } from "./config.js";
import { registerListenCommand } from "./listen.js";
import { registerMcpCommand } from "./mcp.js";

const program = new Command();

program
  .name("aac")
  .description("Async agent communication tool")
  .version("0.1.0");

registerSendCommand(program);
registerInboxCommand(program);
registerFetchCommand(program);
registerContactsCommand(program);
registerConfigCommand(program);
registerListenCommand(program);
registerMcpCommand(program);

program.parse();

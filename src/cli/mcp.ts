import type { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../mcp/server.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Start MCP server (stdio transport)")
    .action(async () => {
      const server = createServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error("aac MCP server started");
    });
}

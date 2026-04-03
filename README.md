# async-agent-channel (aac)

Async communication tool for agents across organizations — exchange information, collaborate, and share experience.

## Install

```bash
# From source (requires Node.js >= 18 and pnpm)
git clone https://github.com/cfanfs/async-agent-channel.git
cd async-agent-channel
pnpm install
pnpm build
npm link
```

## Setup

```bash
# Interactive configuration (email credentials stored in system keychain)
aac config init

# Add contacts
aac contacts add alice alice@example.com
aac contacts add bob bob@example.com

# Verify
aac config show
```

Gmail users: use an [App Password](https://myaccount.google.com/apppasswords), not your regular password.

## Usage

### Send messages

```bash
aac send --to alice "hello from aac"
aac send --to alice --subject "meeting notes" "see attached"
aac send --to alice --file ~/aac-workspace/shared/notes.md
```

### Receive messages

```bash
aac fetch              # Pull unread emails into local queue
aac inbox              # List unprocessed messages
aac inbox read <id>    # Read a message
aac inbox ack <id>     # Mark as processed
```

### Long-running listener

```bash
aac listen             # IMAP IDLE — real-time message reception
```

### MCP Server (for Claude Code, Cursor, etc.)

```bash
aac mcp                # Start stdio MCP server
```

Add to your agent's MCP config to use `send`, `fetch`, `inbox_list`, `inbox_read`, `inbox_ack`, `outbound_list`, `outbound_read` as native tools. The MCP server automatically maintains an IMAP IDLE connection for real-time message reception.

## Security

- **Workspace isolation**: Outbound directories (configurable, multiple) restrict what content can be sent. Inbound directory restricts where received messages are written.
- **Credential safety**: Email passwords are stored in system keychain (macOS Keychain / Linux secret-service), never in config files.
- **Config file**: `~/.config/aac/config.yaml` with mode 600.

## Design

See [docs/design-notes.md](docs/design-notes.md) for original requirements and design decisions.

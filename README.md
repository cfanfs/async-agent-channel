# async-agent-channel (aac)

[中文文档](README.zh-CN.md)

Async communication tool for agents across organizations — exchange information, collaborate, and share experience.

## Install

```bash
# From source (requires Node.js >= 20 and pnpm)
git clone https://github.com/cfanfs/async-agent-channel.git
cd async-agent-channel
pnpm install
pnpm build
npm link
```

## Deploy Relay Server (Docker)

```bash
# Copy and edit environment config
cp .env.example .env
# Set AAC_HOST to your server's public address, e.g.:
#   AAC_HOST=http://192.168.1.100:9100
#   AAC_HOST=https://relay.example.com

# Start PostgreSQL + relay server
docker compose up -d

# Initialize database and create the first user (save the user_id!)
docker compose exec relay node dist/cli/index.js server init \
  --db "postgresql://aac:${POSTGRES_PASSWORD:-aac}@postgres:5432/aac_relay"
```

## Client Setup

```bash
# Interactive configuration (email credentials stored in system keychain)
aac config init

# Join the relay server (paste the user_id from the init step or an invite)
aac server join $AAC_HOST --name <your-name>

# Invite another member
aac server invite
# Share the user_id — they run:
#   aac server join $AAC_HOST --name <their-name>

# If you already joined before but lost the local credential,
# store your server user_id back into keychain
aac config set-credential server --group default

# Add contacts (server channel, email, or both)
aac contacts add alice --server alice
aac contacts add bob bob@example.com
aac contacts add carol carol@example.com --server carol

# Verify
aac config show
```

Gmail users: use an [App Password](https://myaccount.google.com/apppasswords), not your regular password.

`aac config set-credential server` stores the relay `user_id` in system keychain. It does not ask for a server password.

## Usage

### Send messages

```bash
aac send --to alice "hello from aac"          # auto-routes (server preferred)
aac send --to alice --via server "hi"          # force server channel
aac send --to bob --via email "hi"             # force email channel
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
- **Credential safety**: Email passwords and relay server `user_id`s are stored in system keychain (macOS Keychain / Linux secret-service), never in config files.
- **Config file**: `~/.config/aac/config.yaml` with mode 600.

## Recovering Server Access

If you lose the local relay credential, you need the original server `user_id` again. The current protocol does not provide a self-service recovery API.

If you have database access on the relay server, look it up in PostgreSQL:

```bash
docker compose exec postgres psql -U aac -d aac_relay \
  -c "select name, status, key_id, user_id from members order by name;"
```

Then store that `user_id` back into keychain:

```bash
aac config set-credential server --group default
```

If you want to rotate the credential instead of reusing the old one, generate a new `user_id`, derive its `key_id`, and update the corresponding row in `members`.

## Design

See [docs/design-notes.md](docs/design-notes.md) for original requirements and design decisions.

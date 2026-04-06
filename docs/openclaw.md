# OpenClaw Integration

`aac` already exposes a stdio MCP server through `aac mcp`, so the OpenClaw integration is an MCP client registration problem, not a separate runtime.

## Prerequisites

Make sure `aac` works locally before wiring it into OpenClaw:

```bash
aac config init
aac config show
aac mcp
```

If you run from source instead of a global install, build first:

```bash
pnpm install
pnpm build
```

## Option 1: Global `aac` Install

If `aac` is on your `PATH`, the easiest path is:

```bash
aac integration openclaw
```

To register immediately instead of printing the command:

```bash
aac integration openclaw --apply
```

This works well on machines where `aac` was installed with `npm link` or `npm install -g`.

## Option 2: Run from Source Checkout

If you are working from this repository directly, point OpenClaw at the built CLI:

```bash
aac integration openclaw
```

The helper automatically switches to `node dist/cli/index.js mcp` with the repository `cwd` when it detects a source checkout. If you need the raw JSON object, use:

```bash
aac integration json --client openclaw
```

## Available Tools

Once connected, OpenClaw can use the same MCP tools exposed to Claude Code or Cursor:

- `send`
- `fetch`
- `inbox_list`
- `inbox_read`
- `inbox_ack`
- `contacts_list`
- `contacts_add`
- `contacts_remove`
- `server_invite`
- `server_members`
- `outbound_list`
- `outbound_read`

`aac mcp` also starts the background listeners used for IMAP IDLE and relay fetch, so OpenClaw does not need a separate sidecar daemon.

## Troubleshooting

- If OpenClaw starts the server but tools fail, verify `aac config show` works in the same shell environment.
- If you installed from source, rebuild after code changes with `pnpm build`.
- If `send` or `fetch` fails on credentials, re-run `aac config set-credential ...` so the local keychain entry exists.
- If you prefer to register manually, the source-checkout example remains in `configs/openclaw.mcp.source.example.json`.

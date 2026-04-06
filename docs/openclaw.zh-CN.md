# OpenClaw 集成

`aac` 已经通过 `aac mcp` 提供了 stdio MCP server，所以接入 OpenClaw 本质上是“把 `aac` 注册成一个 MCP server”，不需要单独写适配层。

## 前置条件

先确认 `aac` 本地可用，再接 OpenClaw：

```bash
aac config init
aac config show
aac mcp
```

如果你是直接跑源码，而不是全局安装，请先构建：

```bash
pnpm install
pnpm build
```

## 方式一：全局安装的 `aac`

如果 `aac` 已经在 `PATH` 里，最简单的方式是：

```bash
aac integration openclaw
```

如果你想直接执行注册，而不是只打印命令：

```bash
aac integration openclaw --apply
```

适用于 `npm link` 或 `npm install -g` 后的环境。

## 方式二：直接使用当前源码仓库

如果你希望 OpenClaw 直接启动这个仓库里的构建产物，可以这样注册：

```bash
aac integration openclaw
```

如果检测到当前是源码仓库，辅助命令会自动切到 `node dist/cli/index.js mcp`，并带上仓库 `cwd`。如果你需要底层 JSON，可以执行：

```bash
aac integration json --client openclaw
```

## 可用工具

接入后，OpenClaw 能直接调用这些 MCP tools：

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

`aac mcp` 启动时还会自动拉起 IMAP IDLE 和 relay 拉取监听，所以不需要额外常驻一个 sidecar 进程。

## 排查

- OpenClaw 能拉起进程但工具报错时，先在同一终端确认 `aac config show` 正常。
- 如果你用的是源码模式，改完代码后记得重新执行 `pnpm build`。
- 如果报凭据错误，重新执行 `aac config set-credential ...`，确保 keychain 里有本地凭据。
- 如果你仍想手工注册，源码模式示例还保留在 `configs/openclaw.mcp.source.example.json`。

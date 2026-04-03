# async-agent-channel (aac)

跨组织 Agent 异步通信工具——交换信息、促成合作、分享经验。

## 安装

```bash
# 从源码安装（需要 Node.js >= 18 和 pnpm）
git clone https://github.com/cfanfs/async-agent-channel.git
cd async-agent-channel
pnpm install
pnpm build
npm link
```

## 配置

```bash
# 交互式配置（邮箱密码存入系统 keychain）
aac config init

# 添加联系人
aac contacts add alice alice@example.com
aac contacts add bob bob@example.com

# 查看配置
aac config show
```

Gmail 用户请使用 [App Password](https://myaccount.google.com/apppasswords)，不是你的登录密码。

## 使用

### 发送消息

```bash
aac send --to alice "你好"
aac send --to alice --subject "会议记录" "详见附件"
aac send --to alice --file ~/aac-workspace/shared/notes.md
```

### 接收消息

```bash
aac fetch              # 拉取未读邮件到本地队列
aac inbox              # 列出未处理消息
aac inbox read <id>    # 读取消息
aac inbox ack <id>     # 标记已处理
```

### 长驻监听

```bash
aac listen             # IMAP IDLE 实时接收新消息
```

### MCP Server（Claude Code、Cursor 等）

```bash
aac mcp                # 启动 stdio MCP server
```

在 agent 的 MCP 配置中接入后，可直接使用 `send`、`fetch`、`inbox_list`、`inbox_read`、`inbox_ack`、`outbound_list`、`outbound_read` 等工具。MCP server 启动时自动维持 IMAP IDLE 连接。

## 安全

- **工作区隔离**：outbound 目录（可配多个）限制可发送内容；inbound 目录限制消息写入位置。
- **凭据安全**：邮箱密码存储在系统 keychain（macOS Keychain / Linux secret-service），不进配置文件。
- **配置文件**：`~/.config/aac/config.yaml`，权限 600。

## 设计

详见 [docs/design-notes.md](docs/design-notes.md)。

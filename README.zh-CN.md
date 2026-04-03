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

## 部署中继服务器（Docker）

```bash
# 复制并编辑环境变量
cp .env.example .env
# 将 AAC_HOST 设为服务器的公开地址，例如：
#   AAC_HOST=http://192.168.1.100:9100
#   AAC_HOST=https://relay.example.com

# 启动 PostgreSQL + 中继服务器
docker compose up -d

# 初始化数据库并创建第一个用户（务必保存输出的 user_id！）
docker compose exec relay node dist/cli/index.js server init \
  --db "postgresql://aac:${POSTGRES_PASSWORD:-aac}@postgres:5432/aac_relay"
```

## 客户端配置

```bash
# 交互式配置（邮箱密码存入系统 keychain）
aac config init

# 加入中继服务器（粘贴 init 步骤生成的 user_id）
aac server join $AAC_HOST --name <你的名字>

# 邀请新成员
aac server invite
# 把 user_id 发给对方，对方执行：
#   aac server join $AAC_HOST --name <对方名字>

# 添加联系人（server 通道、email、或两者兼有）
aac contacts add alice --server alice
aac contacts add bob bob@example.com
aac contacts add carol carol@example.com --server carol

# 查看配置
aac config show
```

Gmail 用户请使用 [App Password](https://myaccount.google.com/apppasswords)，不是你的登录密码。

## 使用

### 发送消息

```bash
aac send --to alice "你好"                     # 自动路由（优先 server）
aac send --to alice --via server "你好"        # 强制 server 通道
aac send --to bob --via email "你好"           # 强制 email 通道
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

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**async-agent-channel (aac)** — 轻量级跨组织 Agent 异步通信工具。服务于个人、公司、OPC 等不同组织之间的 Agent 通信，**不是**组织内多 Agent 同步。

核心目标：交换信息、促成合作、分享经验。

### 关键设计约束

- **双向隔离**：outbound 目录限定可发送内容，inbound 目录限定消息写入位置。aac 在传输层强制执行路径校验，防止 agent 泄露工作区外信息或恶意消息污染本地文件系统
- **凭据安全**：SMTP/IMAP 密码存储在系统 keychain（macOS Keychain / Linux secret-service），不进配置文件
- **异步处理**：按自己的节奏处理消息；批量处理前先分类（是否适合自己处理 / 紧急 / 重要 / 是否适合外部 LLM 处理）。分类由调用方 agent 自行判断，aac 只做传输
- **通信方式**：Email + 私有中继服务器（Server Channel）。两种通道可共存，`send` 自动路由
- **无 daemon**：客户端不需要独立后台进程。MCP 模式下自动管理 IMAP + Server 轮询；CLI 模式下 `aac fetch` 一次性拉取。中继服务器需独立部署运行

### 运行模式

| 模式 | 入口 | 用途 |
|------|------|------|
| CLI | `aac send / inbox / fetch / listen / contacts / server` | 通用命令行，任何 agent harness 可调用 |
| MCP Server | `aac mcp` | Claude Code / Cursor 等原生工具集成，自动启动 IMAP + Server 轮询 |
| Relay Server | `aac server start --db <pg-url>` | 私有中继服务器，供多人共享通信 |

### CLI 接口

```bash
# 消息收发
aac send --to <contact> "消息内容"       # 发送（自动路由 server/email）
aac send --to <contact> --via server     # 强制通过 server 发送
aac send --to <contact> --via email      # 强制通过 email 发送
aac send --to <contact> --file <path>    # 发送文件内容（必须在 outbound 工作区内）
aac fetch                                # 从所有通道拉取新消息
aac listen [--poll-interval 30]          # 长驻监听（IMAP IDLE + Server 轮询）
aac inbox                                # 列出未处理消息
aac inbox --from <contact>               # 按发件人过滤
aac inbox read <id>                      # 读取具体消息
aac inbox ack <id>                       # 标记已处理

# 联系人
aac contacts list                        # 查看联系人
aac contacts list --group work           # 按 server group 过滤
aac contacts add <name> <email>          # 添加 email 联系人
aac contacts add <name> --server alice@work  # 添加 server 联系人（name@group）
aac contacts add <name> <email> --server alice@work  # 同时配置两种通道
aac contacts remove <name>               # 删除联系人

# 中继服务器（支持多 server/group）
aac server init --db <pg-url>            # 初始化服务端 DB + 生成首个 user_id
aac server start --db <pg-url>           # 启动中继服务器
aac server join <url> --name <name> --group <alias>  # 加入服务器
aac server invite [--group <alias>]      # 邀请新成员
aac server members [--group <alias>]     # 列出服务器成员

# 配置
aac config init                          # 交互式初始化
aac config show                          # 查看当前配置
aac config set-credential smtp|imap|server [--group <alias>]  # 存储凭据
```

### 配置

配置文件：`~/.config/aac/config.yaml`（权限 600）。密码不在此文件中，存储在系统 keychain。

```yaml
identity:
  name: yunfan
  email: yunfan@example.com

workspace:
  outbound:                              # 只有这些目录的内容可以被发送
    - ~/aac-workspace/shared
    - ~/projects/public-docs             # 可配置多个
  inbound: ~/aac-workspace/received      # 收到的消息只能写入这里

email:                                   # 可选（仅 email 通道需要）
  smtp: { host: smtp.gmail.com, port: 587, user: you@gmail.com }
  imap: { host: imap.gmail.com, port: 993, user: you@gmail.com }

servers:                                 # 可选，支持多个 server（每个 ≈ 一个 group）
  work:                                  # 本地 alias（group name）
    url: https://relay.work.com:9100
    name: yunfan                         # 你在这个 server 上的 display name
  friends:                               # user_id 存在 keychain（aac-server-<group>）
    url: https://relay.friends.com:9100
    name: yf

contacts:
  alice: alice@example.com               # 纯 email（向后兼容）
  bob:                                   # 多态联系人
    email: bob@example.com
    server: bob@work                     # name@group 格式
  carol:
    server: carol@friends                # 仅 server 通道
```

## 技术栈

- **Runtime**: Node.js
- **语言**: TypeScript（strict mode）
- **包管理**: pnpm
- **CLI**: commander
- **MCP**: @modelcontextprotocol/sdk
- **客户端存储**: better-sqlite3（消息队列持久化）
- **服务端存储**: PostgreSQL（pg）+ S3/MinIO（大消息体，>64KB 自动 offload）
- **Email**: nodemailer（发送）+ imapflow（接收/IDLE）
- **Server Channel**: HMAC-SHA256 签名认证，node:http 服务端，原生 fetch 客户端
- **测试**: vitest
- **分发**: npm（`npm install -g @cfanfs/aac`）

## 构建与开发

```bash
pnpm install                              # 安装依赖
pnpm build                                # TypeScript 编译
pnpm exec tsx src/cli/index.ts --help     # 开发模式运行
pnpm exec tsx src/cli/index.ts send --help
pnpm test                                 # 运行测试
pnpm test -- --grep "send"               # 运行单个测试
```

## 项目结构

```
src/
├── cli/                # CLI 命令定义（commander）
│   └── server.ts       # server init/start/join/invite/members 命令
├── mcp/                # MCP server（12 个 tools，含 server_invite/server_members）
├── channel/
│   ├── types.ts        # Channel 接口（Send/Fetch）
│   ├── router.ts       # 发送路由：按联系人配置自动选择通道
│   ├── email/
│   │   ├── index.ts    # EmailChannel（nodemailer + imapflow）
│   │   └── listener.ts # ImapListener（IMAP IDLE 长驻监听）
│   └── server/
│       ├── index.ts    # ServerChannel（HTTP 客户端，实现 Channel）
│       └── sign.ts     # HMAC-SHA256 签名/验签（客户端+服务端共用）
├── server/             # 中继服务器（独立部署）
│   ├── index.ts        # RelayServer（node:http，路由分发）
│   ├── store.ts        # ServerStore（PostgreSQL：members + messages）
│   ├── s3.ts           # ObjectStore（S3/MinIO，大消息体 offload）
│   ├── auth.ts         # 请求认证中间件
│   ├── handlers.ts     # API endpoint handlers
│   └── token.ts        # generateUserId()
├── store/              # MessageStore（SQLite，WAL 模式，客户端本地）
├── message/            # Message/MessageSummary 类型
├── keychain/           # 系统 keychain 凭据存取（macOS / Linux）
├── workspace/          # 双向隔离：路径校验 + 文件读写
└── config.ts           # 配置加载/保存（~/.config/aac/）
```

核心抽象：`Channel` 接口定义 Send/Fetch，email 和 server 是两个实现。`router.ts` 根据联系人配置自动选择通道（server 优先，`--via` 可覆盖）。后续加 IM 只需新增 Channel 实现。

## 协作规范

- **需求澄清**：目标模糊时先确认再执行，不要猜测意图
- **语言**：设计文档使用中文，代码注释使用英文
- **命名**：文件名使用小写英文 + 连字符（`email-sender.ts`）
- **及时提交**：完成一个有意义的工作单元后立即 commit，不积攒批量提交
- **提交信息**：conventional commit 格式，中文描述（如 `feat(email): 实现邮件收发基础功能`）
- **状态审计**：信任实际文件，不依赖文档描述——它们可能已过时

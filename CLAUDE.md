# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**async-agent-channel (aac)** — 轻量级跨组织 Agent 异步通信工具。服务于个人、公司、OPC 等不同组织之间的 Agent 通信，**不是**组织内多 Agent 同步。

核心目标：交换信息、促成合作、分享经验。

### 关键设计约束

- **双向隔离**：outbound 目录限定可发送内容，inbound 目录限定消息写入位置。aac 在传输层强制执行路径校验，防止 agent 泄露工作区外信息或恶意消息污染本地文件系统
- **凭据安全**：SMTP/IMAP 密码存储在系统 keychain（macOS Keychain / Linux secret-service），不进配置文件
- **异步处理**：按自己的节奏处理消息；批量处理前先分类（是否适合自己处理 / 紧急 / 重要 / 是否适合外部 LLM 处理）。分类由调用方 agent 自行判断，aac 只做传输
- **通信方式**：Email（当前阶段）→ 常用 IM（下一阶段）
- **无 daemon**：不需要独立后台进程。MCP 模式下随 agent 会话启停自动管理 IMAP 连接；CLI 模式下 `aac fetch` 一次性拉取

### 运行模式

| 模式 | 入口 | 用途 |
|------|------|------|
| CLI | `aac send / inbox / fetch / listen / contacts` | 通用命令行，任何 agent harness 可调用 |
| MCP Server | `aac mcp` | Claude Code / Cursor 等原生工具集成，自动启动 IMAP IDLE 监听 |

### CLI 接口

```bash
aac send --to <contact> "消息内容"   # 发送消息（通过 email）
aac send --to <contact> --file <path> # 发送文件内容（必须在 outbound 工作区内）
aac fetch                            # 拉取未读邮件到本地队列
aac listen                           # 长驻 IMAP IDLE 监听（Ctrl+C 停止）
aac inbox                            # 列出未处理消息（摘要）
aac inbox --from <contact>           # 按发件人过滤
aac inbox read <id>                  # 读取具体消息
aac inbox ack <id>                   # 标记已处理
aac contacts list                    # 查看联系人
aac contacts add <name> <email>      # 添加联系人
aac contacts remove <name>           # 删除联系人
aac config init                      # 交互式初始化配置
aac config show                      # 查看当前配置
aac config set-credential smtp|imap  # 存储邮箱密码到系统 keychain
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

email:
  smtp: { host: smtp.gmail.com, port: 587, user: you@gmail.com }
  imap: { host: imap.gmail.com, port: 993, user: you@gmail.com }

contacts:
  alice: alice@example.com
  bob: bob@example.com
```

## 技术栈

- **Runtime**: Node.js
- **语言**: TypeScript（strict mode）
- **包管理**: pnpm
- **CLI**: commander
- **MCP**: @modelcontextprotocol/sdk
- **本地存储**: better-sqlite3（消息队列持久化）
- **Email**: nodemailer（发送）+ imapflow（接收/IDLE）
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
├── mcp/                # MCP server（10 个 tools，含 outbound_list/outbound_read）
├── channel/
│   ├── types.ts        # Channel 接口（Send/Fetch）
│   └── email/
│       ├── index.ts    # EmailChannel（nodemailer + imapflow）
│       └── listener.ts # ImapListener（IMAP IDLE 长驻监听）
├── store/              # MessageStore（SQLite，WAL 模式）
├── message/            # Message/MessageSummary 类型
├── keychain/           # 系统 keychain 凭据存取（macOS / Linux）
├── workspace/          # 双向隔离：路径校验 + 文件读写
└── config.ts           # 配置加载/保存（~/.config/aac/）
```

核心抽象：`Channel` 接口定义 Send/Fetch，email 是第一个实现。后续加 IM 只需新增实现，不动 CLI/MCP 层。MCP server 启动时自动开启 IMAP IDLE 后台监听。

## 协作规范

- **需求澄清**：目标模糊时先确认再执行，不要猜测意图
- **语言**：设计文档使用中文，代码注释使用英文
- **命名**：文件名使用小写英文 + 连字符（`email-sender.ts`）
- **及时提交**：完成一个有意义的工作单元后立即 commit，不积攒批量提交
- **提交信息**：conventional commit 格式，中文描述（如 `feat(email): 实现邮件收发基础功能`）
- **状态审计**：信任实际文件，不依赖文档描述——它们可能已过时

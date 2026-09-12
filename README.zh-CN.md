# DoneRelay

**通过 Telegram 与微信，为 AI Agent 提供通知、问答和一次性审批。**

你离开键盘后，Agent 遇到问题会把对应请求发到手机；你回复后，结果回到
同一个等待中的请求，而不是另开一个没有上下文的任务。

[English](README.md) · [安全说明](SECURITY.md) · [上架计划](docs/MARKETPLACES.md)

## 当前状态：v0.1 开发者预览

已经实现 Node.js 服务、Telegram 渠道、实验性个人微信协议适配、Codex App Server
适配、通用 Skill、SQLite 状态和自动化测试。**初始验证只使用本地模拟，尚未完成真实
Telegram/微信账号、真实 Codex 登录任务或 Docker 部署的端到端验收。**

微信不是企业微信机器人，也不是腾讯官方插件；这里是根据腾讯公开插件协议实现的
独立客户端。账号是否有资格使用、长时间没有互动后能否主动推送，需要实际验证。

## 最短上手路径

要求 Node.js 22.16+，没有 npm 运行时依赖；Node 内置 SQLite 可能显示实验性警告。

```sh
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

把生成值填到 `.env` 的 `DONERELAY_API_TOKEN`。通过 Telegram 的 `@BotFather` 创建
独立机器人，把令牌填到 `TELEGRAM_BOT_TOKEN`，给机器人发一条私信后执行：

```sh
node --env-file=.env src/cli.mjs telegram-peers
```

核对自己的用户与私聊 ID，填入 `TELEGRAM_USER_ID`、`TELEGRAM_CHAT_ID`。
不要把令牌贴进聊天或 GitHub。确认没有其他程序消费同一个机器人后启动：

```sh
npm start
```

另开终端测试：

```sh
node --env-file=.env src/cli.mjs notify --task demo --text '任务已完成'
node --env-file=.env src/cli.mjs ask --task demo --title '需要选择' --text '先用 SQLite 还是 PostgreSQL？'
node --env-file=.env src/cli.mjs request-approval --task demo --title '需要批准' --text '仅将构建 abc123 部署到测试环境。'
```

问答和审批命令会等待。Telegram 可以直接回复问题消息；两条渠道都支持
`回复 请求编号 回答`、`批准 请求编号`、`拒绝 请求编号`。英文 `reply`、`approve`、
`reject` 也有效。单独一句“好”不会自动批准。`/pending` 显示待处理请求。

## 微信（实验性）

```sh
node --env-file=.env src/cli.mjs weixin-login
```

建议安装本地 `qrencode` 以显示终端二维码；也可打开返回的服务商登录链接。
扫码信息不会交给第三方二维码网站。只实现基本扫码确认流程；遇到验证码、重定向等
流程会明确停止，而不是猜测或把凭据发送给未审核的域名。

凭据保存在私有的 `~/.donerelay/weixin-account.json`，权限为 0600。重启桥接服务后，
**先给机器人发一条私信建立会话上下文**，再测试通知和审批。微信的 1 小时、6 小时
无人互动后主动推送，必须单独验收，不能凭一条即时回复就宣称支持。

同时配置 Telegram 和微信时，请求发送到两边，但共享同一条审批状态。
一边处理后另一边的重复操作无效；所有渠道都未确认送达时，等待端取消请求。

## Codex 原生审批

先在任务所在机器/VPS 安装并登录 Codex CLI，再执行：

```sh
node --env-file=.env src/cli.mjs codex --cwd /absolute/path/to/project \
  --prompt '检查项目并实现指定功能'
```

适配器自己启动 App Server 会话，转发结构化的命令/文件审批与用户输入请求，
再把决定写回原请求。不会把手机文字直接当 shell 命令，也不会授予整段会话权限。

边界：不接管已经运行的终端，不接管 Codex Cloud，不猜测普通自然语言输出是否在
提问；过长的命令/差异必须回本地查看。服务断线或重启后不会自动重放旧批准。

## Skill 与部署

```sh
npx skills add tianxinzh/DoneRelay
```

Skill 是便携的操作说明和脚本，**不等于安装完成常驻服务，也不能覆盖 Agent 原生权限**。
Claude Code 自建 Marketplace 配置已随仓库提供，但不代表被任何官方市场收录。
安装和容器部署详情见 [英文 README](README.md)；发布进度见 [上架计划](docs/MARKETPLACES.md)。

```sh
npm run check
npm test
npm run demo  # 完全离线模拟，不会执行实际部署
```

异常退出留下锁文件时，先确保所有 DoneRelay 进程已停止，再删除存储目录里的
`relay.sqlite.lock`；不要删除数据库。第一版优先安全失败，而不是未经核对恢复任务。

MIT 开源；非 OpenAI、Anthropic、Telegram 或腾讯官方项目。

# DoneRelay

**离开键盘，不错过需要你决定的事。**

给 Codex、Claude Code 和其他 AI Agent 使用的 Telegram 通知、问答与单次操作审批工具，第一版包含通过腾讯 OpenClaw 插件接入个人微信的**实验性适配器**。

[English](README.md) · [微信接入](docs/wechat.md) · [市场分发](docs/marketplaces.md) · [安全说明](SECURITY.md)

```text
Agent 遇到问题 → Telegram / 微信 → 你回复或确认 → 原任务继续
```

它不是一个远程执行任意命令的聊天机器人。运行中的 Node.js 桥接服务负责消息和持久化；Skill 告诉 Agent 何时调用客户端。仅安装 Skill 不会自动启动服务，也不会接管所有原生权限弹窗。

## 当前完成情况

通知、文字问答、单次批准/拒绝、请求超时、幂等键、SQLite 持久化、Telegram 长轮询、微信出站 worker 与确定性的入站命令处理已实现。自动化测试使用模拟消息平台；**尚未使用真实 Telegram / 微信账号完成端到端验证，也没有宣称已经进入官方市场**。

核心为零运行时第三方依赖的 Node.js 22.16+ 程序。微信的 OpenClaw 宿主有独立版本与 Node 要求。当前核心测试环境的内置 SQLite 仍标记为 experimental。

## 不用账号先体验

```bash
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
npm test
npm run demo
```

演示使用真实本地 HTTP 和 SQLite，但消息与人的回复明确为模拟，不会发送外部消息。

## Telegram 启动

1. 通过官方 @BotFather 创建自己的机器人。复制 `.env.example` 为 `.env`，设置随机的 `DONERELAY_API_TOKEN` 与 `TELEGRAM_BOT_TOKEN`，不要提交凭证。
2. 停止其他 bot 轮询进程，运行 `node --env-file=.env scripts/telegram-pair.mjs`，向自己的 bot 私聊发送终端显示的 `/start CODE`，把输出的 chat/user ID 填入 `.env`。
3. 运行 `npm start`；另一个可信终端运行：

```bash
node --env-file=.env bin/donerelay.mjs ask --title "部署到哪个环境？" --message "请回复 staging 或 production"
node --env-file=.env bin/donerelay.mjs approve --title "确认部署？" \
  --action "把构建 abc123 部署到 staging，不修改 production" --ttl 600
```

Agent 只应拿到服务地址和 Agent API key；bot token、微信 transport key、会话文件和数据库必须留在 Agent 无法访问的可信环境。上面的命令用于桥接宿主测试，不会真的执行部署。

## 安装 Skill

```bash
npx skills add tianxinzh/DoneRelay --skill donerelay
```

也可把 `skills/donerelay` 复制到项目的 `.agents/skills/donerelay`（Codex）或 `.claude/skills/donerelay`（Claude Code）。客户端在 Skill 内，不依赖安装前的仓库相对路径。桥接服务仍需单独运行。

微信支持的是个人 WeChat / Weixin，不是企业微信。安装腾讯的 OpenClaw channel、扫码登录、绑定固定 sender ID，再启动 DoneRelay 插件和 worker。请先阅读 [微信接入与已知限制](docs/wechat.md)。

## 安全边界

沉默、断网、超时、取消、服务故障都不等于同意。普通回答不能转换为授权。每个审批对应明确操作和摘要哈希；操作变了，必须重新请求。服务只记录一次最终决定，调用方仍需防止重复执行副作用。

本工具不能延长 Codex Cloud 的任务寿命、复活已经退出的 Agent，或绕过平台原有权限。Docker Compose 与正式市场安装需要按发布清单实际验证。

欢迎提交真实安装反馈、测试和适配器 PR。工具有帮助的话，欢迎 Star。不要把 token、完整日志或私人对话放进 issue。

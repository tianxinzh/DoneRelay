# DoneRelay — AI Agent 的远程确认与任务通知

**离开键盘，也能回答 Agent 的问题。**

DoneRelay 是自托管 Node.js 桥接服务：通过 Telegram，以及实验性的个人微信 / Weixin 接口，接收任务通知、批准或拒绝具体操作、回答澄清问题。配有可移植 Skill 和实验性 Codex App Server 适配器。

[English / 完整说明](README.md) · [实施计划](docs/PLAN.md) · [安全边界](SECURITY.md)

## 当前状态

这是 `0.1.0-alpha.1` 源码预览。离线测试覆盖请求状态、身份校验、重复与过期审批、消息接口格式，以及模拟的 Codex 暂停/继续流程。**尚未用真实 Telegram、微信账号或已认证 Codex 完成联调**，不是上述平台的官方产品。

## 基本用法

需要 Node.js 22+。克隆仓库，执行 `npm ci --ignore-scripts` 与 `npm test`。复制 `.env.example` 为本地 `.env`，生成随机 API token 并填写 Telegram bot token、个人 chat ID、user ID，然后执行 `npm start`。另一个终端执行 `npm run demo`。

手机收到问题后回复：`回答 请求编号 SQLite`。审批回复 `批准 请求编号` 或 `拒绝 请求编号`；Telegram 也支持按钮。含糊的“好”不会被当成授权。两个渠道共用请求记录，在任意一边处理后，另一边不能重复生效。

## Codex 和其他 Agent

桥接服务运行时，执行：

```sh
node --env-file=.env src/cli.js codex --cwd /你的项目绝对路径 --prompt "检查项目并运行测试"
```

适配器启动并管理自己的 Codex App Server 会话，不接管任意现有终端，不承诺 Codex Cloud 可用。只转发支持的单次审批、非敏感结构化问题和完成通知。Skill 用于其他支持宿主，不绕过其原生审批或沙箱。

## 微信限制

已实现实验性文本收发与轮询代码，需要你通过授权登录获得自己的 `WEIXIN_BOT_TOKEN` 与 `WEIXIN_USER_ID` 并在本地配置。**本版没有二维码登录向导，也不会读取其他应用的凭证文件。** 先给机器人发私聊消息，建立会话上下文。长时间没有互动后的主动发送、账号资格和会话过期行为必须实测。详见 [微信说明](docs/WEIXIN.md)。

## 安全与发布

默认监听本机；绑定具体用户；请求单次生效；超时不默认批准；服务重启取消待确认请求。实际使用应将 bot 凭证移出 Agent 工作目录，最好让服务运行在不同系统用户下。不要把任何 token 粘贴进 issue 或提交到 Git。

仓库提供 Docker、测试、Skill 和自托管插件目录文件；这些不等于已经上架官方市场、发布 npm、部署到 VPS 或通过端到端验证。

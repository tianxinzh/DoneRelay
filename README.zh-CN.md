# DoneRelay — Codex、Claude Code 的 Telegram / WhatsApp 通知与远程审批

**离开键盘，也能回答 Agent 的问题。**

DoneRelay 是开源、自托管的 Node.js 桥接服务和 Agent Skill：通过 Telegram 或 WhatsApp Cloud API 接收完成通知、回答澄清问题、批准或拒绝一个明确操作。支持 Codex、Claude Code 的 Skill 工作流和通用 HTTP/CLI。**个人微信 / Weixin 为实验性支持。**

[English / 完整说明](README.md) · [安装](docs/INSTALLATION.md) · [WhatsApp 配置](docs/WHATSAPP.md) · [常见问题](docs/FAQ.md) · [市场上架调研](docs/MARKETPLACES.md) · [安全边界](SECURITY.md)

![DoneRelay 示例：修复空购物车崩溃，通过 Telegram 批准部署到 staging，继续执行并收到完成通知](docs/assets/donerelay-checkout-demo.gif)

*这是示意动画，不是真实 Agent 或账号录屏；图中展示 Telegram 流程。* [静态版本](docs/assets/donerelay-checkout-demo-poster.png) · [可编辑源代码](scripts/render-checkout-demo.py)

## 当前状态

这是 `0.1.0-alpha.2` 之后的未发布源码更新，加入实验性 WhatsApp Cloud API 适配器。**尚未完成真实 Telegram、WhatsApp、微信和已认证 Agent 的端到端验收。** 未上架官方目录、未发布 npm，不承诺 Codex Cloud 可用，也不是相关平台的官方产品。

工作流：Agent 提出具体问题 → 发到绑定账号 → 你回复 → 仍在运行的调用方读取结果并继续检查原生权限。Skill 不会自动接管任意终端，不能复活已终止的任务。动画里的测试数量、commit 和部署结果属于虚构示例，不是本工具的实测结果。

## 基本用法

需要 Node.js 22+。克隆仓库后：

```sh
npm ci --ignore-scripts
npm test
npm run check:discovery
cp .env.example .env
chmod 600 .env
```

本地生成随机 DONERELAY_API_TOKEN；配置 Telegram bot token、个人 chat ID 和 user ID。先私聊机器人，再启动 `npm start`。另一个终端运行 `npm run demo`，收到问题后回复 `回答 请求编号 SQLite`。

审批使用 `批准 请求编号`、`拒绝 请求编号` 或按钮；含糊的“好”不是授权。三个渠道共用请求，先到的有效决定生效。凭证应放在 Agent 工作目录之外，最好让桥接服务使用单独系统用户；不要把 token 放进聊天、issue 或 Git。

## WhatsApp 支持

使用 Meta 官方 Cloud API 协议，但不是 Meta 官方插件，也不是个人 WhatsApp 扫码登录。发送端需要 Meta app、WhatsApp Business Account 和业务号码配置；接收端用你手机上的 WhatsApp。

在可信服务端配置 `.env.example` 中的 WHATSAPP 变量；Graph API 版本必须按你的 Meta app 明确设置。将公网 HTTPS 回调只转发到独立端口 **8788** 的 `/webhooks/whatsapp`，不要暴露 **8787** 的 Agent API。回调验证完成后订阅正确业务账号的 messages 事件。

绑定用户发送 **START** 开启通知，**STOP** 关闭该渠道的发送和审批。支持通知、文本问答、批准/拒绝按钮；较长审批完整发送为文本，绝不截断操作内容。完整配置见 [WhatsApp 说明](docs/WHATSAPP.md)。

**24 小时窗口限制：** 超过用户最后一条消息 24 小时后，Meta 要求使用已批准模板。本版没有模板兜底，窗口关闭会明确报告发送失败，不默认授权，也不自动重发。长任务可同时启用 Telegram；不能把 WhatsApp 描述成无需互动的永久后台推送。

## 安装 Skill

在仓库根目录为本地 Codex 安装：

```sh
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
```

在 Agent 的安全环境配置中设置 DONERELAY_URL 和 DONERELAY_API_TOKEN，然后显式使用 `$donerelay`。

Claude Code 使用本项目自托管目录：

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

再调用 `/donerelay:donerelay`。**安装插件不会启动桥接服务或自动配置机器人。** 这是 Skill，不是 Claude 原生 Channels 或权限拦截插件。

## 原生 Codex 和微信边界

实验性 Codex App Server runner 创建并管理自己的新会话：

```sh
node --env-file=.env src/cli.js codex --cwd /你的项目绝对路径 --prompt "检查项目并运行测试"
```

它只转发已支持的单次审批、非敏感问题和完成通知，不绕过沙箱，不提供会话级无限授权。需实测你的 Codex 版本。

微信使用腾讯公开客户端协议。需要单独授权设置 WEIXIN_BOT_TOKEN 与 WEIXIN_USER_ID，先私聊建立上下文。没有扫码登录向导，也不会读取其他应用的凭证。长时间不互动后的发送、账号资格和会话过期必须实测。详见 [微信说明](docs/WEIXIN.md)。

## 默认拒绝与发布状态

无回复、超时、发送失败都不代表批准；回答问题不是授权执行。主分支在服务重启后取消待确认请求。Docker 只提供桥接服务，不提供已认证 Codex。WhatsApp 签名验证、账号绑定、重放去重和决定持久化都在返回回调成功之前完成。

[上架调研](docs/MARKETPLACES.md) 区分 OpenAI 的公共插件提交、Claude 的社区目录与单独策展的官方目录。[提交材料](docs/SUBMISSION.md) 已准备草稿和验收用例，但未提交审核。GitHub star、SEO 排名和 AI 引用都没有保证。

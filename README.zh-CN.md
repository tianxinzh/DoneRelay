# DoneRelay

编码 Agent 正在等待你的决定。在 Telegram 回复，让同一个任务继续。

DoneRelay 是供 Codex 和 Claude Code 使用的**本地一体化工具包**。技能、Telegram 集成、请求存储和后台服务一起安装，运行在 Agent 所在的同一台电脑上。Slack 通知、问题回复和明确审批复用宿主现有的 MCP 连接；Telegram 首次私下配对机器人后，技能会按需自动启动服务。正常安装无需独立服务器、Docker、桥接地址或手动生成 API 令牌。

[安装说明](docs/INSTALLATION.md) · [验证记录](docs/LAUNCH.md) · [English](README.md)

当前源码候选版本：`0.1.0-alpha.8`。首发范围为 Telegram。WhatsApp 和微信仍是开发预览。未宣称发布 npm、获得官方目录收录或支持托管 Agent 环境。

## 安装到 Codex

需要 Node.js 22+ 和已登录的 Codex。复制完整技能目录：

```sh
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
```

使用 Telegram 时再运行：

```sh
node ~/.agents/skills/donerelay/scripts/relay.mjs setup --language zh
```

通过 @BotFather 创建专用机器人。在终端的隐藏输入中填写令牌，然后打开配对链接，在 Telegram 私聊中点击开始。工具自动绑定账号并生成内部连接配置。不要把令牌发到 Agent 对话中。

重新加载 Codex，然后输入：

> 使用 $donerelay，通过 Telegram 问我一个无害的问题，并等待我的直接回复。

## 安装到 Claude Code

在 Claude Code 中运行：

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

按提示重新加载插件，再让 `/donerelay:donerelay` 帮助设置本机 Telegram。技能会提供包含实际安装路径的 `node .../scripts/relay.mjs setup` 命令。请在自己的交互式终端中运行。同一系统用户已在 Codex 配对的配置会自动复用，不需要第二个机器人或服务。这是项目自己的插件目录。

## 复用现有 Slack 连接

如果 Codex 或 Claude Code 已连接 Slack MCP，可直接要求：

> 使用 DoneRelay，通过我现有的 Slack 连接，把任务结果发到我自己的私聊。

仅使用 Slack 时，可以跳过 Telegram 配对和本地服务。技能通过宿主现有工具验证当前用户、工作区和自己的私聊，再使用同一连接发送；无需新的令牌、机器人或 MCP 服务。缺少身份、私聊查询或发送能力时会明确报告，不猜测收件人，也不改发给同事或频道。

Slack 支持结果通知、原消息讨论串中的问题回复，以及“批准”或“拒绝”明确决策。连接必须能读取完整原始讨论串；审批绑定当前运行流程，只能消费一次，宿主原生权限仍然有效。发送成功不代表手机一定收到推送。本次环境没有可用 Slack MCP 连接，真实投递仍待验证。详见 [Slack 说明](docs/SLACK.md)。

## 日常使用

- 完成通知：明确要求任务结束时通过 Telegram 通知。
- 问题：直接回复原始 Telegram 请求消息，填写答案即可。
- 审批：点击按钮，或直接回复 `批准`、`拒绝`；含糊的“好”不代表授权。
- 语言：`/language zh`、`/language en` 或 `/language auto`。自动模式让 Agent 根据上下文选择一种语言，代码和操作内容保持原样。

问题答案不是执行授权。转发副本不是有效回复目标。旧消息仍可使用带请求编号的命令。

## 本地服务管理

源码目录使用 `node src/cli.js 命令`；已安装技能使用 `node /实际路径/donerelay/scripts/relay.mjs 命令`。

| 命令 | 用途 |
| --- | --- |
| `setup` | 私下配对 Telegram，自动生成内部连接配置 |
| `start` | 启动或复用本机服务 |
| `status` | 查看状态、版本与待处理数量，不显示秘密 |
| `doctor` | 检查本机配置、连接、版本和 Telegram 账号 |
| `stop` | 仅在没有待处理请求或发送时停止 |
| `uninstall` | 安全停止并保留配置，再提示移除宿主技能或插件 |
| `uninstall --purge` | 安全停止并删除本地凭据和请求历史 |

技能在发起请求和读取结果前会自动启动或复用服务。不同 Agent 会共享同一系统用户的服务。更新时先完成待处理请求，再用新工具包执行 `stop` 和 `start`；版本不同不会自动中断旧服务。

后台服务是独立 Node 进程，不安装开机启动项。崩溃或重启后，下次调用会启动服务；原有待确认请求会被取消。等待中的调用断线时不会推断批准。电脑和 Agent 必须保持运行、避免休眠，工具无法复活已经结束的会话。

默认数据目录为 `~/.config/donerelay/local/`，目录权限 0700，文件权限 0600。凭据位于项目之外，不导出到 Agent 的环境变量。同一系统用户仍可访问这些文件，不能把文件权限当作与 Agent 的隔离。

## 原生 Codex 任务

```sh
node src/cli.js codex \
  --cwd /项目的绝对路径 \
  --prompt "检查这个项目并运行测试。"
```

此命令自动启动本地服务，并创建由适配器持有的新线程。结构化规划问题可使用 `--plan`。原生权限保持有效；工具不接管其他终端，也不提供会话级无限授权。Claude 当前通过显式技能请求集成，不拦截所有原生权限提示。

## 验证与限制

```sh
npm ci --ignore-scripts
npm test
npm run check:discovery
npm run check:package
claude plugin validate . --strict
```

运行时代码位于 `skills/donerelay/scripts/runtime/`；`src/` 只是兼容入口。Linux、macOS 和 Windows 的实际验收应分别记录，详见[发布记录](docs/LAUNCH.md)。

WhatsApp 需要 Meta 业务账号、签名 HTTPS 回调和主动同意，24 小时窗口外没有已批准模板回退。微信没有二维码设置向导，登录和长时间闲置后的投递仍需验证。两者都未集成进 Telegram 设置向导。

[安全说明](SECURITY.md) · [隐私说明](PRIVACY.md) · [使用条款](TERMS.md) · [反馈](https://github.com/tianxinzh/DoneRelay/issues)

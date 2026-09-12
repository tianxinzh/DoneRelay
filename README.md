# DoneRelay

**Leave the keyboard. Keep the decisions.**

Telegram notifications, questions, and single-operation approvals for Codex, Claude Code, and other AI agents. Includes an **experimental personal WeChat / Weixin adapter** through Tencent's OpenClaw channel plugin.

[简体中文](README.zh-CN.md) · [Quickstart](#quickstart-telegram) · [Agent skill](#install-the-agent-skill) · [WeChat](docs/wechat.md) · [Marketplaces](docs/marketplaces.md) · [Security](SECURITY.md)

```text
Agent is running → needs your decision → phone notification
                                              ↓
Agent continues ← structured result ← you approve or reply
```

DoneRelay is a small, self-hosted Node.js bridge plus a portable Agent Skill. It does not replace your coding agent, interpret arbitrary chat as permission, or execute commands received from your phone.

**v0.1.0 is an initial implementation, not a production-certified release.** Automated tests use simulated providers. No live Telegram/WeChat account or official marketplace listing is claimed.

## What works in this implementation

| Workflow | Telegram | Personal WeChat |
| --- | --- | --- |
| Task-finished notification | Bot API + long polling | Experimental OpenClaw transport |
| Ask a question and wait for text | Reply to the bot message | `/donerelay reply ID answer` |
| Request an exact operation | Approve once / Reject buttons | `/donerelay approve ID` or `reject ID` |
| Expiry, idempotency, durable records | Shared SQLite state machine | Shared SQLite state machine |
| Verification so far | Mock API + real local HTTP tests | Mock host/CLI + real local HTTP tests |

No runtime dependencies for the core, no hosted account, no inbound Telegram webhook, and no database server. The separate WeChat integration requires OpenClaw and Tencent's plugin.

## Try it without credentials

Node.js **22.16+** with built-in SQLite is required. SQLite is experimental on the tested Node 22.16 runtime. The WeChat host has its own newer Node/OpenClaw requirements.

```bash
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
npm test
npm run demo
```

The offline demo exercises real HTTP and SQLite with **simulated** messaging and human replies. It prints `ask: answered`, `approve: approved`, and `notify: completed`. No external message is sent.

## Quickstart: Telegram

### 1. Configure your private bridge

Create a bot using Telegram's official **@BotFather**. Do not post its token in an issue or give it to your coding agent.

```bash
cp .env.example .env
chmod 600 .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `DONERELAY_API_TOKEN` and your bot token in `TELEGRAM_BOT_TOKEN`. Keep `.env` on the trusted bridge host, outside an untrusted agent's workspace or filesystem.

### 2. Bind your private chat

With the bridge and any other bot poller stopped:

```bash
node --env-file=.env scripts/telegram-pair.mjs
```

Send the displayed `/start CODE` to **your bot** in a private chat. Copy the printed `TELEGRAM_CHAT_ID` and `TELEGRAM_USER_ID` into `.env`. This challenge avoids binding the first stranger who messages your bot. A bot with an existing webhook must have that webhook removed by its owner before long polling can work; DoneRelay does not remove it automatically.

### 3. Start and send a test

```bash
npm start
```

In another terminal on the trusted bridge host:

```bash
node --env-file=.env bin/donerelay.mjs notify --title "DoneRelay is connected"
node --env-file=.env bin/donerelay.mjs ask --title "Which branch?" --message "Reply with staging or main."
node --env-file=.env bin/donerelay.mjs approve --title "Deploy staging?" \
  --action "Deploy build abc123 to staging; no production changes" --ttl 600
```

`approve` waits and exits successfully only for an `approved` result. The request is a decision record: **these examples do not run a deployment**. Codes: `0` successful result, `2` rejected, `3` expired/cancelled/failed, `1` client/network error. `status` and `--no-wait` only report API success; inspect the JSON status before doing anything.

The agent needs only `DONERELAY_URL` and `DONERELAY_API_TOKEN`. Never provide it the Telegram token, WeChat transport token, channel session, or SQLite volume. For a remote agent, use authenticated HTTPS or an SSH tunnel to this loopback service.

## Install the agent skill

After reviewing the source, use the cross-agent installer:

```bash
npx skills add tianxinzh/DoneRelay --skill donerelay
```

This installs the instructions and self-contained client under `skills/donerelay/`; **it does not deploy the bridge**. The command is a repository install path, not a claim that DoneRelay is published to npm or listed on a leaderboard.

A Codex project can instead copy the skill directory into `.agents/skills/donerelay/`; Claude Code supports `.claude/skills/donerelay/`. Resolve `scripts/client.mjs` relative to the installed skill, not the caller's working directory.

Example request to your agent:

> Use DoneRelay while you work. Ask me on Telegram when you need information, request explicit approval for the exact operation before taking it, and notify me when the job finishes. Never treat silence or an error as approval.

## Claude Code and Codex plugin packaging

Claude Code, in the interactive session:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay
```

Codex-compatible catalog: `.agents/plugins/marketplace.json`; portable manifest: `plugin.json`. Setup and the distinction between **your own catalog** and a **reviewed official listing** are in [marketplace distribution](docs/marketplaces.md).

**Cloud limitation:** the bridge must stay running outside an ephemeral task. The host must allow the client script, credentials, and network route. DoneRelay cannot extend Codex Cloud time limits, resume a killed cloud job, or bypass a native permission prompt. No Codex Cloud end-to-end verification has been performed.

## Use it from Node.js

```js
import { Client } from './skills/donerelay/scripts/client.mjs';
const relay = new Client(); // DONERELAY_URL and DONERELAY_API_TOKEN
const request = await relay.create({
  kind: 'ask', title: 'Which deployment target?', channel: 'telegram',
  message: 'Reply with staging or production.', idempotencyKey: 'job-42-target',
});
const result = await relay.wait(request.id);
if (result.status !== 'answered') throw new Error('No confirmed answer');
console.log(result.answer); // Validate as data; never eval or interpolate into a shell.
```

A narrowly scoped [Codex App Server approval handler](integrations/codex/approval-handler.mjs) is included for hosts that own that connection. It is not an automatic hook into existing Codex sessions. See [agent integration](docs/agents.md).

## VPS / Docker

```bash
docker compose up -d --build
```

Compose binds port 8787 to the host's loopback address, uses a persistent SQLite volume, and runs as a non-root user. Configure `.env` first. Run one daemon per database and one polling worker per bot. The WeChat Gateway/worker is configured separately; see [WeChat setup](docs/wechat.md). Docker execution itself remains a live release-check item.

## Safety and reliability

Approval records are immutable and scoped to one exact action string and SHA-256 digest. A request accepts only one terminal decision. The caller must associate it with one job step and prevent duplicate side effects; repeatedly reading `approved` does not create new permission. Delivery is bounded-retry and can duplicate after an ambiguous network failure—it is not exactly-once delivery.

Messages and answers may contain sensitive information. Only send a user-approved, minimal summary. No automatic source-code or log upload, telemetry, or secret scraping is implemented. Read the [security model](SECURITY.md), [data handling](PRIVACY.md), and [API reference](docs/api.md).

## FAQ

**Is this just a notification bot?** No. Questions and approvals return structured results the calling workflow can wait for.

**Can it take over my agent from my phone?** No. It handles scoped decisions, not arbitrary remote shell access or a general chat terminal.

**Is WeChat the same as WeCom?** No. This adapter targets personal WeChat through Tencent's external OpenClaw Weixin plugin. It is experimental and has upstream access-control/version caveats.

**Does installing a skill pause every permission prompt?** No. Cooperative calls use the client directly; native permission prompts require a host adapter.

**Is it in the official marketplaces?** Not yet. Installable repository manifests and submission materials are included. Third-party review and publisher verification are separate steps.

## Contribute

Reproduce a live channel test, improve onboarding, or add an adapter with negative authorization tests. See [CONTRIBUTING](CONTRIBUTING.md) and the [release checklist](docs/release-checklist.md).

If DoneRelay is useful, a GitHub star helps others find it. Reports of real setup friction are even more useful. [MIT license](LICENSE).

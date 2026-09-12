# DoneRelay

**Telegram & WeChat approvals, questions, and notifications for AI agents.**

Step away from your keyboard without leaving your agent waiting for you.
DoneRelay relays a task's question or exact proposed operation to your phone,
records your reply, and returns it to the same waiting request.

[简体中文](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Security](SECURITY.md) · [Distribution](docs/MARKETPLACES.md)

```text
Codex / a cooperative agent       DoneRelay                Your phone
       needs approval  ───────►  pending request  ───────► Telegram / WeChat
       same task waits                                   approve / reject
       continues or stops ◄───── single-use result ◄────── or answer a question
```

## Status: v0.1 developer preview

This is working source code with automated **offline** tests, not a claim of
production readiness. No real Telegram/Weixin account or authenticated live Codex
session was used for the initial verification. See the [live acceptance checklist](docs/LIVE-TEST-CHECKLIST.md).

| Component | Implemented | Verification / boundary |
|---|---|---|
| Telegram | Private messages, long polling, approval buttons, reply-to questions | Mock-tested; dedicated bot and live account test required |
| WeChat / Weixin | Basic QR login, text messages, long polling, context tokens | Experimental independent protocol client; live account eligibility and delayed delivery unverified |
| Codex App Server | Starts its own session; routes command/file approvals and structured questions | End-to-end protocol simulator tested; does not attach to an existing CLI/cloud task |
| Portable agent skill | Notify, ask, request approval, wait for a result | Self-contained script; cooperative gate, not a native permission override |
| State / security | SQLite, bound recipients, one-time decisions, expiry, cancellation, audit metadata | Automated tests; not a security audit |

No npm runtime dependencies. Node.js **22.16+** is required; its built-in SQLite may
emit an experimental warning. The bridge uses your existing agent/model account;
it does not include a model or a hosted messaging service.

## Quick start: Telegram

### 1. Clone and configure

```sh
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `DONERELAY_API_TOKEN` in your local `.env`.
Create a dedicated Telegram bot with **@BotFather**, set `TELEGRAM_BOT_TOKEN`, and
send the bot a private message. With no other consumer running, inspect the IDs:

```sh
node --env-file=.env src/cli.mjs telegram-peers
```

Verify your own numeric IDs and set `TELEGRAM_USER_ID` and `TELEGRAM_CHAT_ID`.
There is no first-message-wins pairing. Do not paste credentials into GitHub issues,
chat, or an agent prompt. Existing bot webhooks are never deleted automatically.

### 2. Start the bridge

```sh
npm start
```

The default HTTP endpoint is loopback-only. Provider tokens stay in the service's
configuration; storage defaults to `~/.donerelay`, outside the agent workspace.

### 3. Send a notification or ask a question

In a second terminal:

```sh
node --env-file=.env src/cli.mjs notify --task demo --text 'DoneRelay is connected.'
node --env-file=.env src/cli.mjs ask --task demo --title 'Database choice' \
  --text 'Use SQLite or PostgreSQL?'
node --env-file=.env src/cli.mjs request-approval --task demo --title 'Deploy staging' \
  --text 'Deploy build abc123 to staging only.'
```

The last two commands wait. Reply to the Telegram question directly, or send
`reply REQUEST_ID your answer`. Approve using the button or `approve REQUEST_ID`;
reject using `reject REQUEST_ID`. Chinese `回复`, `批准`, and `拒绝` also work.
An unbound "yes" never approves a task. `/pending` re-displays up to 20 pending requests.

Exit code **0** means answered/approved (or a notification had a confirmed delivery);
**2** means a negative/expired/cancelled outcome; **1** means an error. No CLI command
in this section executes the proposed action itself.

## WeChat / Weixin — experimental

This is **not** an official Tencent plugin, a WeCom enterprise webhook, or a
universal personal-account API. It is an independent text-only adapter based on
[Tencent's documented OpenClaw Weixin plugin protocol](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md).

```sh
node --env-file=.env src/cli.mjs weixin-login
```

Scan privately with the account that will answer requests. Install the local
`qrencode` utility for terminal QR rendering, or open the provider login link.
No QR material is sent to a third-party rendering service. The basic
`wait → scaned → confirmed` flow is implemented; verification-code and redirect
flows stop with an explicit error rather than trusting an arbitrary host.

Credentials are written to `~/.donerelay/weixin-account.json` with mode 0600.
Restart the bridge, then **send the bot a private message first** to establish a
conversation context. The scanned user ID is the allowed sender. Use
`批准 REQUEST_ID`, `拒绝 REQUEST_ID`, or `回复 REQUEST_ID answer`.

Long-idle proactive delivery is **not established** by the protocol documentation.
Test 1-hour and 6-hour gaps before depending on it. With both channels configured,
requests go to both; they share one decision. If neither confirms delivery, the
waiting client cancels the request instead of pretending it was sent.

## Run a Codex task with native approval forwarding

Install and authenticate the Codex CLI separately on the machine/VPS that runs the
agent. Start the bridge first, then:

```sh
node --env-file=.env src/cli.mjs codex --cwd /absolute/path/to/project \
  --prompt 'Inspect the project and implement the requested change.'
# For longer prompts: --prompt-file /absolute/path/to/task.txt
```

The adapter launches `codex app-server`, starts a thread, and returns decisions to
that thread's original JSON-RPC request. It uses `on-request` approvals and does not
set a weaker sandbox. It only relays approvals the harness actually emits; it does
not force every tool call to require human approval.

Only explicit native `requestApproval` and `requestUserInput` messages are handled.
Ordinary prose questions are not inferred from model text. Secret-input requests
are interrupted locally; unknown permission grants are denied. Large commands or
diffs that cannot fit in a complete approval card are declined for local review.
Only one-time `accept` is used, never `acceptForSession` or policy amendments.

v0.1 **does not** take over an already running terminal, reconnect an interrupted
Codex session automatically, or control Codex Cloud. Completed turns send a summary
and close the owned App Server process. [Protocol source](https://developers.openai.com/codex/app-server/).

## Install the skill

The portable skill lives at [`skills/donerelay`](skills/donerelay/SKILL.md):

```sh
npx skills add tianxinzh/DoneRelay
```

Review third-party installer behavior before running it. Installing the skill does
not install/start the bridge or provision accounts. Configure the service and make
only its API token available to the cooperative agent. The script uses the current
agent's execution environment and requires permitted network access to the bridge.

Codex also supports a local copy in `~/.agents/skills/donerelay` or its skill installer.
For Claude Code, this repository includes a self-hosted marketplace:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-marketplace
```

These are distribution instructions, **not** claims of an official listing. There is
no native Claude permission-hook adapter in v0.1; the Claude skill is a cooperative
workflow aid. [Marketplace status and submission plan](docs/MARKETPLACES.md).

## VPS / containers

```sh
docker compose up --build -d
# Optional basic Weixin QR login inside the relay volume:
docker compose stop relay
docker compose run --rm relay node src/cli.mjs weixin-login
docker compose up -d
```

Compose runs only the bridge; run Codex on the host or in a separately controlled
agent container. The published port stays on `127.0.0.1`. No inbound public webhook
is needed for polling. Keep the data volume private and never mount it into the
agent container. Docker execution is part of the live checklist, not initial test evidence.

## Safety and operational boundaries

Approvals bind an exact immutable request, account, task context, and deadline.
Duplicate replies cannot change the first decision. SQLite persists requests,
channel cursors, conversation tokens, and short audit events. Terminal requests and
audit entries are pruned after seven days while the service runs.

Restart invalidates unresolved/unconsumed decisions; it does **not** automatically
resume a process that has lost its owner. After an unclean crash, the `.lock` file
intentionally blocks startup: stop all relay processes, verify no other instance
uses the data directory, then remove only `relay.sqlite.lock` and restart. Never
remove the database to repair a lock. [Threat model and limitations](SECURITY.md).

## Development and demo

```sh
npm run check
npm test
npm run demo       # Simulated phone; no accounts or real operation
npm pack --dry-run # Local packaging check, not npm publication
```

The tests include HTTP authentication, cross-channel replay protection, account
binding, cancellation, expiry, persistence, Weixin context handling, and a complete
simulated Codex approval/question cycle. Contributions should include deterministic
tests and accurately labeled live verification. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Why DoneRelay?

A narrow, self-hosted human-input bridge rather than a new chat agent or remote shell.
The intended differentiator is one shared approval lifecycle across agent adapters
and message channels. No claim that Telegram remote interaction is unique, no star
incentives, and no guarantee of search ranking or AI recommendations.

If the project saves you a trip back to your keyboard, a GitHub star helps others
find it. Bug reports and reproducible integration results are especially valuable.

MIT licensed. Not affiliated with OpenAI, Anthropic, Telegram, or Tencent.

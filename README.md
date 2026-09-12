# DoneRelay — Approvals & Notifications for AI Agents

**Leave the keyboard. Keep the human in the loop.**

DoneRelay is a self-hosted Node.js bridge for **Telegram notifications, remote task approvals, and human answers**, with an **experimental personal WeChat / Weixin transport**. A supported agent can wait for your reply and continue the same live task. Includes a portable **Codex / Claude Code agent skill** and an experimental native **Codex App Server** runner.

[简体中文](README.zh-CN.md) · [Security](SECURITY.md) · [Implementation plan](docs/PLAN.md) · [Distribution](docs/DISTRIBUTION.md)

> **0.1.0-alpha.1 — source preview.** Offline tests cover the core, channel request shapes, and a simulated Codex session. Live Telegram, Weixin, and authenticated Codex account tests have not been completed. This is not an official OpenAI, Anthropic, Telegram, or Tencent product.

## What it does

| Capability | Included in this source preview |
| --- | --- |
| Task completion notifications | Telegram; experimental Weixin |
| Approve / deny an exact operation | Telegram buttons or explicit numbered text replies |
| Answer a clarification | `answer REQUEST_ID your answer` on either channel |
| Native Codex pause / continue | Runner-owned App Server connection; experimental |
| Other agents / Claude Code | Portable skill + HTTP/CLI; not native permission interception |
| Existing arbitrary terminal or Codex Cloud session takeover | **Not supported / not verified** |

A sample message (illustration, not a live screenshot):

```text
DoneRelay | APPROVAL
Task: website / staging deploy
Request: A1B2C3D4E5F6

Deploy commit abc123 to staging; production will not change.

approve A1B2C3D4E5F6
deny A1B2C3D4E5F6
```

The relay does not execute text received from chat. A bound user can resolve one immutable request, once. A reply of “okay” is not approval. Chinese commands are also supported: `批准 ID`, `拒绝 ID`, `回答 ID 内容`.

## Quick start: Telegram

Requires Node.js 22+ and a Telegram bot you control. No runtime npm dependencies.

### 1. Get and test the source

```sh
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
npm ci --ignore-scripts
npm test
```

### 2. Configure locally, then start the bridge

```sh
cp .env.example .env
chmod 600 .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put that locally generated value in `DONERELAY_API_TOKEN`. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_USER_ID`. Send your bot a private message first. The IDs must identify your own private chat and user. Use the official Bot API `getUpdates` to inspect the message's `chat.id` and `from.id` locally before starting this poller; do not publish its response. Only one polling client can use a bot at a time, and an existing webhook must be removed before polling.

```sh
npm start
```

For real agent runs, put messaging credentials outside the agent's project and preferably run the bridge as a separate OS user. Give the agent only the bridge URL and API token. Never commit `.env`, bot credentials, or `data/`.

### 3. Try a question, without executing any command

In a second terminal:

```sh
npm run demo
```

Reply with `answer ID SQLite` using the ID printed in the message. The example prints the answer and exits; it does not deploy or run arbitrary commands.

## Start a Codex task

Install and authenticate Codex separately. Keep the bridge running, then:

```sh
node --env-file=.env src/cli.js codex \
  --cwd /absolute/path/to/your/project \
  --prompt "Inspect this project and run its tests."
```

This starts a **new** App Server thread with `untrusted` approval policy and `workspace-write` sandbox. It relays supported command/file approvals, structured non-secret questions, and a final completion message. It never returns `acceptForSession` or grants new session-wide permissions. Native proposals too large to display completely are denied for local review. Runtime/schema compatibility still needs testing with your installed Codex version.

It cannot keep a dead Codex process alive, recover a lost native approval after restart, or attach to an unrelated existing terminal. The Docker image contains the messaging bridge, **not Codex**; run the adapter on the host with an authenticated local installation.

## Install the skill

```sh
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
```

The folder includes `SKILL.md`, a standalone Node client, and optional Codex metadata. Configure `DONERELAY_URL` and `DONERELAY_API_TOKEN` in the agent's environment. The skill does not start the service and does not override native security gates. Claude Code can load it through the included self-hosted plugin catalog; see [distribution instructions](docs/DISTRIBUTION.md).

## WeChat / Weixin (experimental)

The text adapter uses the published [Tencent Weixin client protocol](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md), not WeCom and not a notification-only webhook. Configure `WEIXIN_BOT_TOKEN` and `WEIXIN_USER_ID` locally after an authorized login. Obtain them from your own official plugin setup; this version does **not** include a QR-login wizard or automatically read another application's credential files.

Start the service and send a private message from the bound account to establish conversation context. Both channels can be enabled; they then share the same request and the first valid decision wins. Do not run two consumers against the same bot credentials. See [Weixin setup and limitations](docs/WEIXIN.md).

**Account eligibility, context validity after hours of inactivity, session expiry, and actual backend compatibility must be live-tested.** Failed delivery is recorded explicitly. With no successful channel delivery, no approval is inferred; pending requests eventually expire. There is no silent fail-open or promise of reliable unsolicited messages.

## HTTP / CLI for any agent

The local API requires `Authorization: Bearer <DONERELAY_API_TOKEN>` except `/healthz`.

| Method | Path | Action |
| --- | --- | --- |
| POST | `/v1/requests` | Create notification, question, or approval |
| GET | `/v1/requests/:id` | Read state / answer |
| POST | `/v1/requests/:id/cancel` | Cancel a pending request |

There is deliberately no HTTP endpoint that accepts a claimed human approval. Decisions enter through authenticated channel adapters.

```sh
printf '%s' '{"kind":"question","task":"storage-choice","message":"SQLite or PostgreSQL?","ttlSeconds":300}' \
  | node --env-file=.env src/cli.js request --wait
```

Inspect `status` and the original request ID, not just an exit code. `answered` is not `approved`. Optional `idempotencyKey` deduplicates creation during the seven-day retention window; it does not make downstream actions exactly-once.

## VPS / Docker

```sh
docker compose up --build -d
```

The host port binds to `127.0.0.1:8787`; both channels receive replies using outbound polling. No public callback is needed. The container has a persistent state volume and runs without root. Docker assets are provided but have not been live-deployed in this preview.

## Safety and failure behavior

Only a configured private-chat user is accepted. Every request has its own random ID, complete proposal, content hash, and expiry. The first valid response wins across channels. Pending requests are cancelled after a service restart; existing decisions are not automatically executed. State is local plaintext with private file permissions and seven-day completed-request retention. Same-user host compromise is outside this isolation model.

One process owns each state file. After an unclean crash, a stale `.lock` intentionally prevents startup. Verify the old process is stopped before removing that lock. Never delete a live process's lock. Review [SECURITY.md](SECURITY.md) before granting any sensitive operation.

## Roadmap and contributions

Next release gates: live Telegram acceptance; Weixin login wizard and idle-session tests; real Codex-version compatibility; more native agent adapters; then directory submissions and releases. Marketplace manifests are distribution assets, not official marketplace acceptance. No npm publication, stable release, or Codex Cloud support is claimed.

Issues, tests, and small pull requests are welcome. If this is useful, a GitHub star helps others discover it. No tracking, paid API, or cloud service is required by DoneRelay itself; messaging and model providers have their own terms and costs.

[MIT license](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md).

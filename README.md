# DoneRelay — Telegram notifications and remote approvals for AI agents

**Leave the keyboard. Keep the human in the loop.**

DoneRelay is an open-source, self-hosted **Node.js bridge and agent skill for Codex, Claude Code, and other AI agents**. Receive task-completion notifications, answer questions, and approve or deny a specific operation from Telegram. **Personal WeChat / Weixin support is experimental.**

[简体中文](README.zh-CN.md) · [Install the skill](docs/INSTALLATION.md) · [FAQ](docs/FAQ.md) · [Marketplace status](docs/MARKETPLACES.md) · [Security](SECURITY.md)

> **0.1.0-alpha.2 — source preview.** This update improves documentation and plugin packaging, not channel maturity. Live Telegram, Weixin, and authenticated agent acceptance tests are still required. No official marketplace listing, npm publication, or Codex Cloud compatibility is claimed. Independent project; not endorsed by OpenAI, Anthropic, Telegram, or Tencent.

## What problem does it solve?

A long-running agent reaches a decision while you are away. Instead of waiting at the keyboard, receive a specific question on your phone, reply, and let the **same still-running, integrated workflow** read the result. A completion notification closes the loop.

```text
Agent: “Deploy commit abc123 to staging? Production is unchanged.”
   → DoneRelay sends request A1B2C3D4E5F6 to your bound private chat
   → You select Approve or reply: approve A1B2C3D4E5F6
   → The calling workflow reads the decision and checks native permissions
   → It may continue that exact operation, once
```

This is an illustrated workflow, not a recording of a live account test. Chat replies are never executed as shell commands.

## Compatibility and scope

| Integration | What this source includes | Important boundary |
| --- | --- | --- |
| Telegram | Notifications, numbered text answers, approve/deny buttons | Bound private user; live acceptance pending |
| Personal WeChat / Weixin | Experimental text transport and numbered replies | Separate authorized setup; idle-session behavior unverified |
| Codex skill | Portable `SKILL.md` and standalone Node client | Requires a separately running bridge |
| Native Codex runner | Experimental runner-owned App Server session | New session only; real installed-version validation pending |
| Claude Code | Skill packaged as a plugin | Not native Claude permission interception or a Channels plugin |
| Other agents | Authenticated HTTP API and CLI | Caller must wait, check the result, and enforce host policy |
| Codex Cloud / arbitrary existing terminal | Not verified / no session takeover | Installation does not grant background execution or connectivity |

## Quick start: Telegram bridge

Requires **Node.js 22+** and a Telegram bot you control. No runtime npm dependencies.

### 1. Get the source and run checks

```sh
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
npm ci --ignore-scripts
npm test
npm run check:discovery
```

### 2. Configure credentials locally

```sh
cp .env.example .env
chmod 600 .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use that locally generated value for `DONERELAY_API_TOKEN`. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `TELEGRAM_USER_ID` in your private configuration. Send your bot a private message first. Inspect `chat.id` and `from.id` locally using the [Telegram Bot API](https://core.telegram.org/bots/api#getupdates); do not publish the response. A bot must not have another poller or an active webhook competing with this service.

```sh
npm start
```

For actual agent use, keep bot credentials **outside the agent's workspace**, preferably under a separate OS user. Give the agent only the bridge URL and API token. Never commit `.env` or `data/`.

### 3. Try a harmless question

In another terminal:

```sh
npm run demo
```

Reply `answer ID SQLite` using the ID in the message. This example prints the answer and exits; it does not deploy anything. Chinese replies are supported: `回答 ID 内容`, `批准 ID`, and `拒绝 ID`. “Okay” alone is not an approval.

## Install in Codex or Claude Code

Installation supplies the skill; **it does not provision the bridge**.

For a local Codex skill, from the repository root:

```sh
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
```

Configure the agent's `DONERELAY_URL` and `DONERELAY_API_TOKEN` securely, then request `$donerelay` explicitly. Restart or reload the host as required by your installed version.

For Claude Code, use **DoneRelay's own catalog**, not an official directory listing:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

Invoke `/donerelay:donerelay` with a bounded request after setup. See [installation and smoke tests](docs/INSTALLATION.md). The root `plugin.json` and `.agents/plugins/marketplace.json` also provide current OpenAI plugin packaging; host-side validation remains required.

## Native Codex: start a task with remote approval handling

Install and authenticate Codex separately. With the bridge running:

```sh
node --env-file=.env src/cli.js codex \
  --cwd /absolute/path/to/your/project \
  --prompt "Inspect this project and run its tests."
```

The runner creates a **new** App Server thread with `untrusted` approval policy and `workspace-write` sandbox. It relays supported command/file approvals, non-secret structured questions, and completion notifications. It does not grant session-wide permission; oversized proposals are denied for local review. Validate against your installed Codex version before relying on it.

It cannot attach to an unrelated terminal, keep a dead process alive, or recover a lost native approval after restart. The Docker image contains the bridge, not an authenticated Codex installation.

## WeChat / Weixin: experimental

The main-branch adapter uses the published [Tencent Weixin client protocol](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md). This is personal Weixin, not WeCom and not a notification-only webhook. Configure your own `WEIXIN_BOT_TOKEN` and `WEIXIN_USER_ID` locally after authorized setup. This preview does not include a QR-login wizard or read another application's credential files.

Send a private message from the bound account to establish conversation context. Do not run competing consumers for the same credentials. Telegram and Weixin resolve the same request: the first valid decision wins. Account eligibility, idle-session delivery, and expiry behavior need live tests. See [Weixin setup](docs/WEIXIN.md).

## HTTP API and CLI for other agents

All endpoints except `/healthz` require `Authorization: Bearer <DONERELAY_API_TOKEN>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/requests` | Create a notification, question, or approval |
| GET | `/v1/requests/:id` | Read status and answer |
| POST | `/v1/requests/:id/cancel` | Cancel a pending request |

There is deliberately **no HTTP endpoint that accepts a claimed human approval**. Decisions come from bound channel users.

```sh
printf '%s' '{"kind":"question","task":"storage-choice","message":"SQLite or PostgreSQL?","ttlSeconds":300}' \
  | node --env-file=.env src/cli.js request --wait
```

Check the request ID, proposal, and status. `answered` is not `approved`. An optional `idempotencyKey` deduplicates creation within the seven-day retention window; downstream actions are not guaranteed exactly-once.

## VPS and Docker

```sh
docker compose up --build -d
```

The host port binds to `127.0.0.1:8787`. Channel replies use outbound polling, so no public inbound messaging callback is needed. Docker assets include a non-root service and persistent volume but have not been live-deployed in this preview. A remote agent still needs an authenticated, reachable bridge; localhost on a laptop is not reachable from a cloud sandbox.

## Safety and failure behavior

Requests carry a random ID, complete proposal, content hash, and expiry. Only the configured private user can resolve one. Timeout, failed delivery, an unknown sender, or no reply never means approval. Native host permissions remain in force.

**Main-branch behavior:** pending requests are cancelled after restart. Existing decisions are not automatically executed. Local state is plaintext with private file permissions and seven-day completed-request retention. One process owns a state file. After a crash, a stale `.lock` intentionally blocks startup; verify the old process has stopped before removing it. Same-user host compromise is outside this isolation model.

Read [SECURITY.md](SECURITY.md), [privacy and data flow](PRIVACY.md), and [FAQ](docs/FAQ.md) before sensitive use.

## Distribution, roadmap, and contributions

[Marketplace research](docs/MARKETPLACES.md) explains current OpenAI submission and Claude community-versus-official routes. [Submission materials](docs/SUBMISSION.md) contain draft listing copy, reviewer scenarios, and release gates. Local catalogs do not confer approval or endorsement.

Next gates: real Telegram acceptance, Weixin login/idle-session validation, native Codex compatibility, clean-host plugin installation, and owner-reviewed publication. There is no published npm install command to advertise yet.

Issues, reproducible tests, and small pull requests are welcome. A star helps people bookmark the project; the more useful contribution is reporting a tested host version or a reproducible setup problem. No manufactured installs, stars, or ranking claims.

[MIT license](LICENSE) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md)

# DoneRelay v0.1 implementation plan

Updated: 2026-09-12. This document records scope, not a claim that every item is implemented.

## Product

Leave the keyboard without leaving an agent blocked. Receive task-completion notifications, answer questions, and approve or deny specific operations from Telegram or personal WeChat (Weixin).

- Repository: `tianxinzh/DoneRelay`
- Runtime: Node.js 22 or newer; prefer built-in modules and minimal setup.
- Package: agent-neutral HTTP/CLI bridge plus a portable `skills/donerelay/SKILL.md`.
- Initial native agent adapter: a Codex App Server session started by DoneRelay.
- Channels: Telegram private chat; experimental Weixin text transport.
- Hosting: self-hosted on a laptop or VPS; no public webhook needed for polling transports.

## Implementation order

1. Authenticated loopback HTTP service, persistent request state, expiry, atomic single-use decisions, and CLI.
2. Telegram sendMessage/getUpdates, private-user allowlist, approval buttons and explicit text answers.
3. Experimental Weixin sendmessage/getupdates using the published Tencent client protocol, bound user, context token, and explicit numbered replies.
4. Codex App Server adapter for supported per-operation approvals, user questions, and turn-completion notifications. Never imply control of an unrelated running CLI session.
5. Portable skill, English/Chinese README, Docker setup, tests, security policy, and distribution documentation.

## Security invariants

- Default-deny on timeout, invalid sender, unknown request, unsupported native approval type, or stale session.
- Bind every decision to an immutable request ID, task, and exact operation.
- Never interpret an arbitrary chat message as permission to execute a shell command.
- Only a specifically bound private-chat user can answer or approve.
- A shared request resolved on one channel is no longer actionable on another.
- A restarted service cancels pending requests rather than replaying stale approvals.
- Keep bot credentials, API keys, state, and message contents out of the repository and logs.
- Native host sandbox rules still apply. The skill is not a security boundary.

## Acceptance tests

Offline tests must cover authentication, expiry, duplicate decisions, wrong sender/chat, question-versus-approval separation, cross-channel resolution, restart cancellation, channel API errors, and Codex request/response mapping.

Live acceptance requires locally configured Telegram credentials, Weixin credentials/context, and an authenticated Codex installation. Mock tests are not proof of successful account login or end-to-end delivery. Test Weixin after hours of inactivity and after a disconnected session before advertising reliable unattended delivery.

## Release and discovery

Use the brand DoneRelay, with a descriptive title: “DoneRelay — Approvals and Notifications for AI Agents”. Describe Telegram and WeChat support and its maturity honestly. Ship searchable task-focused documentation and reproducible examples; do not promise stars, rankings, or AI citations.

Prepare installation assets and a verified distribution checklist. Marketplace acceptance, npm publication, a hosted website, and Codex Cloud compatibility are separate release gates, not automatically completed by committing source code.

## Primary technical references

- Codex App Server: https://developers.openai.com/codex/app-server/
- Codex skills: https://developers.openai.com/codex/skills/
- Telegram Bot API: https://core.telegram.org/bots/api
- Tencent Weixin plugin: https://github.com/Tencent/openclaw-weixin
- Tencent protocol and its stated limitations: https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md

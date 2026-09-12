# DoneRelay implementation plan

Status: implementation in progress. Updated 2026-09-12.

## Product

Leave the keyboard, keep the decisions. A self-hosted Node.js bridge lets coding agents notify a human, ask a question, or request approval over Telegram and WeChat. The bridge returns a structured result; the agent or its host remains responsible for continuing the job.

## First release

- Dependency-free Node.js CLI and authenticated HTTP service, with durable SQLite requests and delivery queue.
- Telegram private-chat notifications, approval buttons, free-text answers, allowlisted chat/user IDs, long polling, bounded retry, and restart recovery.
- Experimental personal WeChat transport through Tencent's OpenClaw Weixin channel plugin. A deterministic DoneRelay OpenClaw command handles responses; no LLM interprets authorization.
- Portable Agent Skill, Claude Code plugin/marketplace packaging, and OpenAI plugin packaging. A skill is not a replacement for a running bridge or a native host permission prompt.
- A cooperative agent workflow and a narrowly scoped Codex App Server integration, with unsupported permission requests denied rather than silently authorized.
- Single-use, expiring, operation-bound approvals. Separate agent and WeChat transport credentials. No public unauthenticated webhook, arbitrary shell execution, automatic approval, or session-wide permission grant.
- Docker Compose, English/Chinese documentation, offline tests, security guidance, and a distribution/submission checklist with official sources.

## Validation

Run automated state, authorization, Telegram protocol, HTTP API, CLI, and integration tests using mock transports. Live messaging requires user-owned bot/channel credentials and is a separate release gate. Do not claim live verification or official marketplace publication without evidence.

## Distribution

Ship installable repository packages first. Prepare OpenAI and Anthropic submission materials. Public review, identity verification, authenticated submission forms, and third-party acceptance cannot be replaced by adding a manifest. skills.sh discovery must be distinguished from successful GitHub installation. Do not manufacture installs, stars, or testimonials.

## Scope boundaries

One trusted operator per bridge. Keep the bridge and its channel credentials outside an untrusted agent sandbox. Cloud task lifetime and network/secret policies remain host constraints. A surviving bridge can retain a response, but cannot resurrect an expired cloud execution.

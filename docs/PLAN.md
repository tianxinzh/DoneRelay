# Implementation plan

The original planning draft is superseded by the current [delivery plan](../PLAN.md) and [release checklist](release-checklist.md). Updated 2026-09-12.

The implemented v0.1 design uses a persistent Node.js bridge and self-contained Agent Skill. Telegram is a direct Bot API transport. Personal WeChat is an experimental adapter through Tencent's OpenClaw channel, rather than a standalone reimplementation of Tencent's client protocol.

Pending requests survive a bridge restart and expire at their original deadline. Native approval callers must separately cancel requests when their host operation or session becomes invalid. The included Codex code is a narrow callback helper for a host-owned App Server connection, not a complete session launcher or universal permission interceptor.

Use the current plan for delivered scope and the release checklist for the remaining live-account, host integration, Docker, and marketplace publication gates. An earlier proposed feature is not evidence that it shipped.

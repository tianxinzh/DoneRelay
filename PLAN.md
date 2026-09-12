# DoneRelay delivery plan

Updated 2026-09-12. Initial implementation delivered; live integration and distribution gates remain open.

## Implemented

- Zero-runtime-dependency Node.js bridge, CLI and self-contained portable Agent Skill.
- SQLite request state, immutable exact-operation approvals, one terminal decision, expiry, idempotency, audit records, bounded delivery leases/retries and retention.
- Telegram private-chat notification/question/approval transport and challenge-based account-ID discovery.
- Experimental personal WeChat transport via Tencent's OpenClaw channel, with a deterministic sender-bound command handler and outgoing worker.
- Experimental Codex App Server command-approval callback helper for an existing host-managed connection.
- English/Chinese README, API/integration/security docs, Docker Compose, offline tests/demo and CI definition.
- OpenAI portable plugin + repository catalog and Claude plugin + repository marketplace packaging; sourced submission plan and discoverability copy.

## Not claimed complete

- Live Telegram/WeChat account tests, host-native SDK/installer validation and Docker execution.
- General native approval interception, arbitrary remote control or indefinite Codex Cloud job resumption.
- Public npm release, ClawHub publication, skills.sh indexing, official OpenAI/Anthropic review or listing.
- A production security audit, multi-tenant isolation, or exactly-once remote operation execution.

## Next release gates

Follow docs/release-checklist.md. First verify Telegram with a dedicated bot, then the experimental WeChat adapter on recorded compatible versions. Publish reviewed immutable release artifacts before broad promotion. Prepare but do not fabricate publisher identity, credentials, reviews, stars, installs or test screenshots.

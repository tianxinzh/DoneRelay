# Changelog

## 0.1.0-alpha.5

- Support plain-text Telegram replies to new questions and explicit approve/deny replies to approvals.
- Persist exact provider message bindings; preserve authorization, language, expiry, restart, and single-use checks.
- Open Telegram’s reply UI for questions while retaining numbered commands and approval buttons.

## 0.1.0-alpha.4

- Use one message language at a time for request labels, buttons, instructions, and reply acknowledgements.
- Add saved Telegram `/language` preferences, CLI/API/environment selection, and agent-guided automatic choice.
- Keep the selected language on each request and preserve exact proposals and stable callback payloads.

## 0.1.0-alpha.3

- Keep main’s JSON request schema and cancellation of pending requests on restart as the single supported implementation.
- Require confirmed channel delivery before a Telegram/Weixin decision, matching the WhatsApp boundary.
- Add explicit native Codex plan mode for structured questions on the tested CLI.
- Add a read-only, secret-safe `doctor` command for agent connectivity and bridge configuration checks.
- Synchronize CLI, health endpoint, and native adapter versions with package metadata.
- Repair packaged discovery checks and README source links.
- Record actual host validation and remaining launch gates separately from mock-provider tests.

## Unreleased — after 0.1.0-alpha.2

- Embed the approved illustrated checkout workflow GIF and a static alternative in the English and Chinese READMEs. Include editable source and a reproducible asset-rendering workflow. This is not live account footage.
- Add experimental WhatsApp Cloud API notifications, questions, and exact-operation approvals with short-message buttons and complete-text fallback.
- Isolate signed WhatsApp callbacks on a separate listener; validate raw-body HMAC, WABA, business number, and bound sender.
- Add durable START/STOP consent, conservative 24-hour-window enforcement, replay protection, and atomic reply handling. No template fallback or delivery/read-receipt tracking is included.
- Allow Telegram, WhatsApp, and Weixin to share one request and first-valid-decision semantics.
- Add adapter/security tests plus a full local HTTP startup flow against a mocked Meta provider. Update configuration, Docker port mapping, skill guidance, privacy and setup documentation.

Live Meta account setup and acceptance testing remain required. No new registry release or marketplace listing is implied.

## 0.1.0-alpha.2 — 2026-09-12

Documentation and distribution-metadata update; no relay runtime changes in that version.

- Clarify Telegram notifications, remote approvals, Codex/Claude integration, and experimental WeChat scope in bilingual onboarding.
- Add portable OpenAI plugin manifest and local marketplace catalog; improve Claude catalog metadata without renaming its slug.
- Improve skill discovery text while preserving explicit invocation and native permission boundaries.
- Add installation/FAQ guides, factual llms.txt, SEO plan, sourced marketplace research, and a draft submission packet.
- Add source privacy/terms notices and automated discovery metadata/link checks.

No official directory submission, npm publication, live channel acceptance, production deployment, or Cloud compatibility is implied. See [submission status](docs/SUBMISSION.md).

## 0.1.0-alpha.1

Initial main-branch source preview: Node.js bridge, Telegram and experimental Weixin transports, experimental native Codex runner, portable skill, Docker assets, and offline tests. An alternative implementation remains in a separate draft PR; do not mix its API/state behavior with main without reconciliation.

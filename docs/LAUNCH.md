# Local bundle launch record

Current candidate: `0.1.0-alpha.6`. The authoritative runtime ships inside `skills/donerelay/scripts/runtime/`; `src/` only forwards existing entry points. Main's request schema, durable JSON decisions, and cancellation of pending requests on restart are preserved. The alternative PR #2 implementation remains superseded.

## Alpha.6 scope

One environment, one locally installed bundle. Guided private Telegram pairing, generated internal authentication, on-demand detached service startup, shared per-user configuration, status/doctor/stop/uninstall commands, and a copied skill that includes all runtime modules. No separate deployment or manual URL/token configuration is part of the install.

The lifecycle tests use real local processes and HTTP with a simulated Telegram provider. They are distinct from real phone acceptance. Current validation results are recorded below after execution; an earlier release's success does not certify the new setup flow.

## Historical evidence

On AlmaLinux 10.2 with Node 22.23.1, Codex 0.154.0 and Claude Code 2.1.261, alpha.3 testing verified native completion, approval, denial, expiration and restart cancellation. The native plan-question test expired unanswered. Actual Claude strict validators and isolated plugin installation passed, and actual Codex discovered the copied skill.

Alpha.4 added one-language messages and saved en/zh/auto preferences. Alpha.5 passed 74 tests on Node 22/24. A real direct Telegram reply reached the same waiting bridge client at 2026-09-14 04:46:14 UTC, with verified reply-to-message provenance. That was not a completed native Codex question-resumption test.

Those releases used the older standalone-service installation. Their deployment evidence is historical, not the current installation architecture. Provider credentials, private identifiers, and raw native traces remain outside the repository.

## Remaining release gates

- Complete a native Codex question-resumption run through the local bundle on the exact release commit.
- Record guided first-time pairing and real phone replies in the complete local install. A fixture or terminal-only test is not a phone recording.
- Verify provider-origin duplicate replies and an unauthorized sender using a second controlled account.
- Test macOS and Windows independently before marking them verified. Linux checks do not establish those results.
- Recruit 5–10 developers and target at least three independent setups plus repeat use. No tester success is assumed.
- Review the real screen recording, publisher identity/contact/logo, privacy and terms, then submit through appropriate owner-controlled portals. No submissions or acceptance are claimed.
- Publish a versioned tested prerelease once the chosen gates are satisfied. npm publication additionally requires publisher authentication.
- Keep WhatsApp and Weixin experimental until account setup, reply/consent/restart and hours-idle cases pass; WhatsApp still lacks template fallback.

The public site and GitHub metadata are distribution surfaces, not validation evidence. See [tester plan](BETA_TESTING.md), [submission packet](SUBMISSION.md), and [development/migration notes](DEVELOPMENT.md).

## Alpha.6 validation — 2026-09-14

Implementation introduced in `84f7c5c` (PR #6), with follow-up doctor guidance/coverage and this evidence record. Host: AlmaLinux 10.2; Node 22.23.1 and 24.21.0; Codex 0.154.0; Claude Code 2.1.261.

- 86 automated tests pass on Node 22 and 24, including 12 local lifecycle/setup checks. Provider calls in this suite are simulated.
- Installed npm artifact and complete copied-skill checks pass on both Node versions, without repository-only dependencies or manual connection exports.
- Actual Claude strict marketplace and plugin validators pass. A fresh isolated configuration installs and enables alpha.6.
- Actual Codex App Server discovers the complete copied skill in a fresh project with no discovery errors.
- A real PTY setup run with a simulated provider verifies private pairing, generated settings and hidden token input. This test found and fixed a terminal-echo race; it is not a real first-time Telegram pairing recording.
- The existing bot configuration was imported privately into the local bundle on the same machine after the old standalone process stopped. The local service and live Telegram account doctor pass. Both installed host helpers retrieve preferences without connection exports.
- A fresh actual Codex native plan question reached Telegram through the locally bundled service. Its phone-answer/resumption result remains pending until recorded separately; do not infer success from delivery.

Private evidence includes sanitized test logs, wizard results, host discovery, local doctor output and native question status. No credentials, private provider IDs or task traces are committed.

# DoneRelay submission packet — draft, not submitted

Updated 2026-09-14 for `0.1.0-alpha.8`. Copy fields only after validating the exact submitted commit. The publisher must supply identity, contact details, accounts, and attestations personally. This file is not evidence of a passed review.

## Listing copy

**Name:** DoneRelay  
**Stable slug:** `donerelay`  
**Short description:** Telegram notifications and remote human approvals for AI agents.  
**Category candidate:** Productivity / developer tools, according to the target directory's available choices.

**Description:** DoneRelay can reuse an existing Codex/Claude Slack MCP connection for notifications and thread decisions in the authenticated user's verified self-DM, without new credentials or service setup. Slack questions and single-use approve/deny decisions require complete raw thread reads; actual live Slack round trips are not yet validated; see SLACK.md for the exact scope. DoneRelay also connects an integrated agent workflow to a bound private Telegram chat. Receive completion updates, answer a bounded question, or approve or deny one exact operation while away from the keyboard. It includes one local Codex/Claude Code bundle with guided Telegram pairing, the complete Node.js runtime, and automatic local service startup. No separate server or manual API connection is required. Native host permissions remain in force. WhatsApp Cloud API is an optional experimental transport requiring a Meta business phone, signed HTTPS webhook, explicit START opt-in, and an active 24-hour customer-service window. STOP disables sends and decisions. There is no approved-template fallback outside that window. Personal WeChat support and the native Codex runner are experimental. The agent and bundled service run in the same environment and must remain awake and running. Hosted-runtime compatibility is not established. See the exact release evidence in LAUNCH.md.

**Repository and website:** https://github.com/tianxinzh/DoneRelay  
**Support:** https://github.com/tianxinzh/DoneRelay/issues  
**Privacy:** https://github.com/tianxinzh/DoneRelay/blob/main/PRIVACY.md  
**Terms/license notice:** https://github.com/tianxinzh/DoneRelay/blob/main/TERMS.md

These are source-project pages, not proof of a hosted service, verified publisher identity, or acceptance as legal documents by a directory. The owner must review them and supply any additional required policy/contact fields. Do not upload secrets to a public issue.

## Starter prompts

“Use DoneRelay to notify me on Telegram when the tests finish; include the outcome, not secrets.”

“Ask me through DoneRelay whether this change should target staging or remain local. Wait for my answer.”

“Request approval for deploying this exact commit to staging. Do not deploy production and keep native permission checks.”

## Reviewer scenarios

Each scenario needs the exact commit, host/runtime version, fixture, observed output, redacted evidence, and a pass/fail result. **The alpha.6 submission-specific results must be recorded on the exact commit; older evidence is in [LAUNCH.md](LAUNCH.md).** Do not replace actual evidence with a simulated demonstration. Use a controlled test project and dedicated reviewer account; exchange credentials through the directory's secure process, never this repository.

| ID | Prompt / scenario | Fixture and expected result |
| --- | --- | --- |
| P1 | Notify me after the harmless test task completes | Bound Telegram account; one notification with outcome; no secret values |
| P2 | Ask whether the example should use SQLite or PostgreSQL | Live question; a direct Telegram Reply of `SQLite` produces `answered`, not `approved` |
| P3 | Approve this exact harmless staging-simulation operation | Bound user approves; status is `approved` for that immutable ID and proposal; native gate still applies |
| P4 | Deny the staging-simulation operation | Bound user denies; status is `denied`; caller does not execute it |
| P5 | Use the installed skill to ask one bounded question | Fresh local target host; private pairing, automatic startup and copied/installed runtime return the bound user's answer without manual URL/token configuration |
| N1 | Approve from the wrong user or wrong private chat | Unauthorized fixture account; no resolution or execution |
| N2 | Reply “okay”, answer an approval, or approve an expired request | Ambiguous/wrong-kind/expired response does not grant permission |
| N3 | Reuse an old approval for a changed operation, restart, or bypass native permissions | No replay or permission bypass; changed proposal requires a new request; main cancels pending requests on restart |

These eight scenarios follow the positive/negative test structure in [OpenAI's submission guide](https://developers.openai.com/plugins/deploy/submission); they are also useful for local acceptance. Extend them with cross-channel races, delivery errors, and WeChat idle-session cases.

## Blocking checklist

- [ ] Exact commit selected; no unresolved mismatch between main and alternative implementation PRs.
- [ ] Real Telegram notify/question/approve/deny loop recorded, with timestamps and versions.
- [ ] Target host clean installation tested; Claude official validator run and output retained.
- [ ] Local target-host process lifetime and private credential handling validated; no claim that hosted sandboxes support the bundle.
- [ ] Supported WeChat claims restricted to actual live evidence; experimental label retained otherwise.
- [ ] Owner-approved publisher name, secure support contact, logo, privacy/terms, and availability supplied.
- [ ] Official account permissions, identity verification, and policy attestations completed by publisher.
- [ ] Submission ID recorded privately after actual submission; public listing checked after approval.

## Submission log

| Destination | State | Submission ID | Public listing |
| --- | --- | --- | --- |
| Claude community | Not submitted | None | None |
| Claude curated official | Not listed; separate curation | Not an application route | None |
| OpenAI public plugin directory | Not submitted | None | None |

Do not change the log to “submitted” or “listed” without a portal result or a verified public entry. See [current routes and sources](MARKETPLACES.md).

# Telegram launch record

Target: `0.1.0-alpha.3`, based on main commit `0340275157de8dc3e75540192e9c9bdb43941c44`. This is an early Telegram release candidate, not a claim of marketplace acceptance. Evidence collected on 2026-09-13 UTC on AlmaLinux 10.2, Node.js 22.23.1, Codex CLI 0.154.0, and Claude Code 2.1.261. Provider account identifiers, credentials, and raw native session traces are kept outside this repository.

## One implementation

Main's `src/cli.js`, JSON state store, `notification|question|approval` requests, and cancellation of pending requests on restart are authoritative. PR #2 was reviewed as an alternative design; its SQLite recovery, schemas, OpenClaw transport, and entrypoints are not adopted. Its useful issue/PR templates were adapted, and its pairing/setup idea informed the new read-only doctor. No alternative runtime was merged.

Package metadata, plugin manifests, CLI, health endpoint, and native adapter identify the same release. Install and run the client and bridge from the same release. `doctor` reports version mismatches.

## Verified and pending

| Area | Evidence / status |
| --- | --- |
| Automated checks | 53/53 tests passed on Node 22 and 24 after launch changes; installed npm artifact checks passed on both; provider calls in unit tests are simulated |
| VPS bridge | Actual Docker deployment, non-root process, private persistent state, healthy listener bound to host `127.0.0.1:8787`; messaging secrets outside workspace |
| Telegram account | Live getMe/getChat succeeded; configured destination is private; no webhook; request sends accepted by Telegram |
| Phone question round trip | Sent to configured private chat; waiting for the owner's numbered reply; not yet passed |
| Native completion | Real authenticated Codex adapter completed and sent `DONERELAY_NATIVE_COMPLETION_OK` through Telegram |
| Native approval | Actual native approval reached Telegram; owner approved; the same adapter created its exact marker and completed |
| Native expiry | Actual native request expired after 15 seconds; Codex completed without creating the marker file |
| Native question | Default mode reports tool unavailable; explicit `--plan` mode added; real native question reached Telegram and is waiting for its answer |
| Native denial | Live test started; waiting for owner to click Deny |
| Duplicate / unauthorized / restart | Automated fixtures cover these; live acceptance evidence still needs completion |
| Claude validation | `claude plugin validate . --strict` and `.claude-plugin/plugin.json --strict` passed with no warnings |
| Claude clean install | Fresh isolated CLI configuration added local marketplace, installed alpha.3, and lists it enabled; does not establish an authenticated Claude conversation |
| Codex clean install | Fresh project skill copy discovered by actual `skills/list`, enabled with no discovery errors; installed standalone client reached the VPS API |
| WhatsApp / Weixin | Not configured in the deployed bridge; live acceptance blocked on owner-controlled account setup |
| Marketplace submissions | Not submitted; no submission IDs or acceptance claims |

## Decisions and external blockers

1. **Phone participation:** reply to the setup question and native plan question; approve only the approval-marker test and deny the denial-marker test. Do not approve the expiration test. Native callers must remain alive for their own replies.
2. **Release and real recording:** finish the live Telegram cases before promoting a tested Telegram beta. The existing GIF is illustrated. A real phone screen recording requires the owner's phone and review/redaction; it cannot be fabricated from fixtures.
3. **Initial users:** owner supplies 5–10 developer contacts or chooses approved communities. Do not invent recruits or successful setups. Target three independent setups plus repeat use; record actual outcomes.
4. **Publisher accounts:** owner supplies reviewed publisher name, support contact, logo choice, and privacy/terms approval; completes identity verification and submission permissions in the target portals. Do not attest on the owner's behalf. An account-access check and final submission remain pending.
5. **WhatsApp:** owner configures Meta app/business phone credentials and signed HTTPS callback. Run START, question/answer, approve/deny, STOP, replay, and idle-window cases. Approved template name/language/content and business approval are required before implementing and validating an out-of-window fallback. Current release explicitly fails outside the window.
6. **Weixin:** owner supplies authorized bot/session setup. Login, reconnection and hours-idle delivery remain unverified; no QR-login wizard is included. Keep it experimental.

## Owner-run phone acceptance

Each case records exact release SHA, host version, request ID, expected result, observed result, and UTC timestamp in private evidence. Redact personal chat IDs before publishing.

- Question: a numbered answer becomes `answered` in the original waiting caller.
- Approval: the exact marker command runs once after Approve once; repeat the numbered reply and confirm no second execution.
- Denial: Deny leaves the marker absent and the native process finishes without retrying.
- Expiration: no response leaves the marker absent; a later reply cannot approve it.
- Wrong sender: another controlled account sends the numbered command; state remains pending. Local fixtures are not a substitute for this provider-origin case.
- Restart: restart only after other active acceptance callers resolve, then use a dedicated pending request. It becomes `cancelled`; the original waiting caller must not execute it.

## Submission evidence and sources

The five positive and three negative scenarios in [SUBMISSION.md](SUBMISSION.md) remain the review packet. Attach verified release evidence; mark each case live or simulated. WhatsApp's current limits are included in listing copy.

Official documentation checked 2026-09-13: [Codex App Server](https://learn.chatgpt.com/docs/app-server), [OpenAI submission](https://developers.openai.com/plugins/deploy/submission), [OpenAI packaging](https://developers.openai.com/plugins/build/plugins), [Claude plugin guide](https://code.claude.com/docs/en/plugins), and [Telegram API](https://core.telegram.org/bots/api). Account eligibility and acceptance must be established in the actual publisher account.

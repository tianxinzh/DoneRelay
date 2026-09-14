# Telegram launch record

Current candidate: `0.1.0-alpha.4`. The live acceptance record below describes the preceding alpha.3 implementation; language changes are described separately below. Implementation merged in PR #3 at `1d56622379138a6088b1c3b86192713e59216d4c` (source change `3a6da1d0268d42ef4a973a35e0b1dbc82f243261`), based on main `0340275157de8dc3e75540192e9c9bdb43941c44`. This is an early Telegram release candidate, not a claim of marketplace acceptance. Evidence collected on 2026-09-13 UTC on AlmaLinux 10.2, Node.js 22.23.1, Codex CLI 0.154.0, and Claude Code 2.1.261. Provider account identifiers, credentials, and raw native session traces are kept outside this repository.

## One implementation

Main's `src/cli.js`, JSON state store, `notification|question|approval` requests, and cancellation of pending requests on restart are authoritative. PR #2 was reviewed and closed as superseded; its SQLite recovery, schemas, OpenClaw transport, and entrypoints are not adopted. Its useful issue/PR templates were adapted, and its pairing/setup idea informed the new read-only doctor. No alternative runtime was merged.

Package metadata, plugin manifests, CLI, health endpoint, and native adapter identify the same release. Install and run the client and bridge from the same release. `doctor` reports version mismatches.

## Verified and pending

| Area | Evidence / status |
| --- | --- |
| Automated checks | 53/53 tests passed on Node 22 and 24 after launch changes; installed npm artifact checks passed on both; provider calls in unit tests are simulated |
| VPS bridge | Actual alpha.3 Docker deployment, non-root process, private persistent state, healthy listener bound to host `127.0.0.1:8787`; messaging secrets outside workspace |
| Telegram account | Live getMe/getChat succeeded; configured destination is private; no webhook; request sends accepted by Telegram |
| Phone question round trip | Initial unanswered test cancelled by the controlled restart; a fresh native plan question is waiting for the owner’s numbered reply; not yet passed |
| Native completion | Real authenticated Codex adapter completed and sent `DONERELAY_NATIVE_COMPLETION_OK` through Telegram |
| Native approval | Actual native approval reached Telegram; owner approved; the same adapter created its exact marker and completed |
| Native expiry | Actual native request expired after 15 seconds; Codex completed without creating the marker file |
| Native question | Default mode reports tool unavailable; explicit `--plan` mode added; real native question reached Telegram and is waiting for its answer |
| Native denial | Owner denied through Telegram; same Codex workflow completed with the denied marker absent |
| Bridge restart | Actual alpha.2 → alpha.3 replacement cancelled both pending questions; approved/denied/expired results retained. One polling caller encountered a connection error and failed closed; no operation was granted |
| Duplicate / unauthorized | Automated fixtures pass; provider-origin negative acceptance remains pending |
| Setup doctor | Live agent and bridge checks pass against deployed alpha.3; no secrets printed |
| Claude validation | `claude plugin validate . --strict` and `.claude-plugin/plugin.json --strict` passed with no warnings |
| Claude clean install | Fresh isolated CLI configuration added local marketplace, installed alpha.3, and lists it enabled; does not establish an authenticated Claude conversation |
| Codex clean install | Fresh project skill copy discovered by actual `skills/list`, enabled with no discovery errors; installed standalone client reached the VPS API |
| WhatsApp / Weixin | Not configured in the deployed bridge; live acceptance blocked on owner-controlled account setup |
| GitHub CI | Main test run [34790836613](https://github.com/tianxinzh/DoneRelay/actions/runs/34790836613) passed on Node 22/24 at the implementation merge commit |
| Landing page | [Live GitHub Pages site](https://tianxinzh.github.io/DoneRelay/), deployed from main/docs; HTML, logo and poster returned HTTP 200. About description/topics/homepage applied |
| Marketplace submissions | Not submitted; no submission IDs or acceptance claims |

## Decisions and external blockers

1. **Phone participation:** answer the fresh native plan question in Telegram. Approval, denial, expiry and controlled restart already have live evidence. Native callers must remain alive for their own replies. A second controlled account is needed for a real unauthorized-sender test; repeat-reply acceptance also needs confirmation.
2. **Release and real recording:** finish the live Telegram cases before promoting a tested Telegram beta. The existing GIF is illustrated. A real terminal capture of the fresh question is running. A phone-screen recording requires the owner’s phone and review/redaction; it cannot be fabricated from fixtures.
3. **Initial users:** owner supplies 5–10 developer contacts or chooses approved communities. Do not invent recruits or successful setups. Target three independent setups plus repeat use; record actual outcomes.
4. **Publisher accounts:** owner supplies reviewed publisher name, support contact, logo choice, and privacy/terms approval; completes identity verification and submission permissions in the target portals. Do not attest on the owner's behalf. No authenticated publisher portal is available in this session. Identity/role checks and final submission remain pending. npm authentication is also not configured on the VPS; no registry publication is claimed.
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

## Release decision

The GitHub prerelease is prepared as a draft while the remaining live phone-answer and provider-origin negative cases are open. It must not be promoted as a fully validated Telegram beta before those gates are completed or the owner explicitly chooses an alpha release with the gaps disclosed. The landing page invites testing but does not claim completed independent-user validation.

## Single-language follow-up — 2026-09-14

Alpha.4 adds saved `/language en|zh|auto` preferences in the bound Telegram chat, per-request/CLI/environment overrides, and an authenticated preferences read endpoint for agents. Request labels, action buttons, numbered reply instructions, and acknowledgements use one language. Exact proposal text and callback IDs are preserved. The agent skill chooses from conversation context in automatic mode; the bridge uses a documented text heuristic if no explicit choice is supplied. Native Codex uses the configured choice or prompt-language fallback.

Language regression checks cover English/Chinese rendering, restart persistence, unauthorized preference changes, request language stability, duplicate replies, idempotency, native question labels, WhatsApp buttons, CLI precedence, and the standalone copied skill client. These checks use simulated provider calls and do not replace the outstanding live acceptance gates above. The preceding unanswered native question expired; it is no longer a waiting caller.

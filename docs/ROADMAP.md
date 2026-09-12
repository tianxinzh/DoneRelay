# Roadmap

## v0.1 source implementation

- [x] Node.js bridge, authenticated local API and portable client.
- [x] Telegram polling, explicit identity binding, approval buttons and reply-to questions.
- [x] Experimental Weixin basic login/text/polling/context adapter.
- [x] Shared request state, single-use decisions, TTL and restart invalidation.
- [x] Codex owned-session adapter for native approval and structured user-input requests.
- [x] Standard Skill, English/Chinese README, MIT license and custom Claude marketplace files.
- [x] Offline regression tests, protocol simulator, CI definition and Compose deployment files.
- [x] Distribution research and candid compatibility/publication status.

## Before a public stable release

- [ ] Complete the live acceptance checklist; publish tested versions and restrictions.
- [ ] Expand Weixin QR verification/redirect handling only with an audited host policy.
- [ ] Confirm delayed Weixin push reliability; otherwise keep it experimental.
- [ ] Add ready/degraded channel status and a bounded durable notification outbox.
- [ ] Perform independent security review, including hostile action text and filesystem isolation.
- [ ] Record a short real demo, with all account and task secrets removed.
- [ ] Smoke-test skills CLI and Claude marketplace installation in clean environments.
- [ ] Apply repository topics/About metadata; enable private vulnerability reporting.
- [ ] Publish versioned releases/npm only after verifying package ownership and availability.
- [ ] Submit eligible official/community listings; record submission IDs and review results.

## Later, without weakening approval semantics

Native Claude Agent SDK adapter; state-reconciled reconnect; additional channels;
multiple isolated operators; full-diff local review links; explicit cancellation of
active work. No arbitrary chat-to-shell mode or silent "approve all" behavior.

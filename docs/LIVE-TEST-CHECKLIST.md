# Live acceptance checklist

Initial verification: local Node.js 22.16; synthetic provider responses and an
App Server protocol simulator. No live credentialed account tests performed.
Keep the distinction between "implemented", "mock-tested", and "live-verified".

## Required before relying on real work

- [ ] Telegram: dedicated bot, correct private sender/chat binding, DM delivery.
- [ ] Telegram: actual approval/rejection buttons and native reply-to question.
- [ ] Telegram: wrong user/group rejected; a second consumer fails visibly.
- [ ] Weixin: eligible real account, basic QR scan and confirmed identity match.
- [ ] Weixin: actual text send/receive, established context, correct sender binding.
- [ ] Weixin: 1-hour and 6-hour idle gaps followed by proactive notification.
- [ ] Weixin: expired token, verification-code flow and login redirection behavior documented.
- [ ] Both channels: approving once makes the other channel's old request ineffective.
- [ ] Real Codex version recorded; initialize/thread/start/turn/start accepted.
- [ ] Real harmless command approval returns to the same thread/turn/item.
- [ ] Real file-change approval shows complete diff or correctly declines for local review.
- [ ] Real structured question returns the intended option/free-text answer.
- [ ] Denied/expired approvals do not execute; interrupted requests cannot be resurrected.
- [ ] Agent exit, relay restart, network loss and stale-lock recovery tested.
- [ ] Docker Compose build, non-root volume permissions, restarts and private port verified.
- [ ] Skill installed from GitHub through the skills CLI in a clean environment.
- [ ] Claude self-hosted marketplace installed and the cooperative skill invoked.
- [ ] Logs and public demo checked for bot tokens, user IDs and login material.

Record date, OS, Node/Codex/provider version, test case, result, and a sanitized
reproduction. Never upload secrets or real private message contents as evidence.
Do not mark a failed or unavailable test as passed. Record provider restrictions.

Acceptance does not establish an exactly-once downstream execution guarantee or a
security audit. Begin with harmless sandbox tasks, not production deployments.

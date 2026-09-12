# Working on DoneRelay

Use Node.js 22.16+ and ES modules. Runtime has no npm dependencies.
Run `npm run check`, `npm test`, and `npm run demo` before proposing changes.
Never use real bot accounts in tests; use injected provider requests and protocol fixtures.

Preserve these invariants:
- Do not add an HTTP approval/resolve endpoint or execute inbound chat as shell code.
- Explicit user AND private-chat bindings; no first-message-wins pairing.
- Approval is immutable and single-use, scoped to an exact task/action and deadline.
- Unknown statuses, errors, timeouts, lost ownership and process restarts fail closed.
- Reject oversized approvals; never silently truncate the operation under review.
- Do not leak provider tokens, context tokens, .env files, QR login material or raw logs.
- No session-wide permission grants; never weaken an agent's sandbox.
- Distinguish mock-tested adapters from verified live integrations in documentation.

The Weixin client is an independent experimental implementation of a documented plugin
protocol. It is not an official Tencent integration or a promise of universal account access.
Registry publication and official marketplace acceptance are external outcomes, not source files.

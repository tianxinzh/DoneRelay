# Security model

DoneRelay 0.1 is a single-operator developer preview, not an audited access-control
product. Review the implementation before allowing high-impact operations.

## Trust boundaries

The relay process, its host OS, its API-token holders, the configured messaging
accounts, and the upstream agent harness are trusted. Requests supplied by agents
still need human review. Plaintext chat content is not parsed into shell commands.

Do not run an untrusted coding agent as the same OS user with access to the service's
credentials or state directory. Stripping child environment variables does not
prevent a process with the same filesystem permissions from reading files. Prefer
a dedicated service user/container, private data volume, and separate agent workspace.
The service API token permits creating, inspecting and cancelling requests, but
there is no public API route that grants an approval. This is not per-agent tenant isolation.

Telegram bot conversations and this Weixin integration are not treated as end-to-end
encrypted secret channels. Provider operators and account compromise are outside
the guarantee. Never use them for passwords, OTPs, bot tokens, private keys, or
sensitive raw logs. Request payloads and answers are stored locally for seven days;
conversation context tokens/cursors remain until the data is explicitly removed.
Disk encryption and secure backups are the operator's responsibility.

## Implemented controls

- Explicit private recipient bindings; Telegram checks both user ID and chat ID.
- Immutable task/context/action records; random request IDs and button nonces.
- Compare-and-set decisions shared by all configured channels; no approve-all mode.
- Exact-operation review; oversized payloads are declined, not truncated.
- Expiry, cancellation, restart invalidation, and an exclusive local store lock.
- Bearer-authenticated loopback API, no CORS/browser origins, bounded request bodies.
- Fixed Telegram API destination; restricted Weixin HTTPS hosts; no redirect following.
- No provider tokens in normal logs, no arbitrary callback execution, no incoming shell.

## Limitations

Recording one decision is not an exactly-once guarantee for a downstream side effect.
The agent harness must own execution and honor the response. Approvals do not protect
against a malicious local administrator or a compromised messaging account. Files
may change between review and execution; this relay does not lock the agent workspace.
It does not classify every action's risk or enforce a comprehensive command policy.
Keep the harness sandbox enabled and review changed operations again.

No automatic recovery from lost process ownership. After an unclean crash, stop all
instances, verify exclusive ownership, remove ONLY `relay.sqlite.lock`, then restart.
Pending/recorded but unconsumed results become cancelled. Start a fresh task only after
checking the actual state of any external action; do not blindly retry a deployment.

`/healthz` reports HTTP process liveness, not successful Telegram/Weixin delivery.
Network failures can make notification delivery ambiguous. Send timeouts are not
blindly retried; an authorized human can use `/pending` to retrieve active cards.
Initial tests are mocked. No security audit or live-account reliability guarantee.

## Reporting

Never put credentials in public issues. Use GitHub private vulnerability reporting
if enabled. Otherwise, open a non-sensitive issue requesting a private contact
before disclosing exploitable details. Rotate any exposed provider/API credentials.

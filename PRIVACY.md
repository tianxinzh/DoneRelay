# Data handling

DoneRelay is self-hosted software. This repository does not operate a messaging relay service and includes no analytics/telemetry client. The operator runs the bridge and chooses the provider, host and retention policy.

The local SQLite database contains request titles, summaries, exact proposed actions, SHA-256 hashes, answers, timestamps, delivery state, message IDs and an audit trail including responding user identifiers. Tokens are read from process configuration, not intentionally written into request records. The bridge does not upload source files or raw logs on its own.

Telegram receives the messages sent through its Bot API. The experimental WeChat route uses the operator's OpenClaw Gateway and Tencent channel service. Their own policies and retention apply. GitHub, package registries and a separately invoked skill installer may process downloads or installation telemetry independently of DoneRelay. Do not describe those services as anonymous merely because the bridge has no analytics.

Default local retention is seven days after a request reaches a terminal state, checked periodically while the service is running. Set RETENTION_DAYS to 1–365. Pending requests expire within their TTL, at most 24 hours. Local purge does not remove provider messages, backups, free database pages or copies held elsewhere. Stop the service and manage the database volume/backups under your own data policy for complete host-level removal; secure erasure is not promised.

Never put tokens, private message content or full database files in issues or pull requests. See SECURITY.md for isolation and access controls. This description covers the shipped code, not third-party forks or deployments.

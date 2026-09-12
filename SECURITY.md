# Security policy and boundaries

This alpha has not had an independent security audit. Do not use it for unattended high-stakes production operations until reviewed and live-tested.

The bridge binds loopback by default, authenticates the local API with a long random bearer token, validates a bound private-chat user, and resolves immutable requests at most once within a single process. It has no HTTP approve endpoint and does not evaluate chat text as code. It does not request broad native session grants. Unsupported approvals and invisible/oversized proposals are declined for local review.

## Protect credentials and data

Use a separate OS account or container for the bridge and keep bot credentials out of the agent's filesystem and environment. The Codex runner strips `TELEGRAM_*`, `WEIXIN_*`, and `DONERELAY_*` variables before launching Codex, but this is not a boundary against another process running as the same OS user or reading the same `.env` file. The standalone skill needs only the bridge URL/token, never messaging credentials. Do not expose the API publicly without a reviewed HTTPS authentication and network policy.

Task text, answers, sender identifiers, and conversation context are stored locally in plaintext. State files use mode 0600, completed records are retained for seven days, and production application logs avoid request bodies/tokens. Do not send passwords, confidential artifacts, or private reasoning in notifications; messages leave your host and pass through the messaging provider. Bot messages are not an end-to-end encrypted approval channel.

## Failure and replay behavior

A synchronous state transition is persisted before acknowledging a decision. The first valid decision wins across configured channels. Request expiration is checked during each decision, not only by a timer. Restart cancels pending requests. Durable decision recording does not make downstream commands exactly-once: each agent adapter must track whether its own operation already ran and must never reuse an old approval. The live Codex runner creates new native-bound requests and does not resume them after a crash.

The state lock supports one process, not multiple replicas. Never remove a lock while its owner is active. A crash can require verifying the old process has stopped and manually removing a stale lock. A filesystem error, network timeout, lost native session, unsupported request, or empty channel delivery must not be interpreted as approval.

## Supported scope and reporting

Telegram and Weixin adapter tests use mocked transport. Provider login, delivery guarantees, Web/API compatibility, and unattended Weixin context expiration need live validation. Native Codex support is experimental and scoped to its runner-owned connection.

For a security issue, use GitHub's private vulnerability reporting only if it is enabled for this repository. Otherwise contact the maintainer through a private channel listed on their profile. Do not publish exploit details, credentials, task contents, or full state dumps in a public issue. No private-reporting channel is claimed to be preconfigured by this commit.

# Security policy and boundaries

This alpha has not had an independent security audit. Do not use it for unattended high-stakes production operations until reviewed and live-tested.

The bridge binds loopback by default, authenticates the private agent API with a long random bearer token, validates a bound user, and resolves immutable requests at most once within a single process. Its private API has no HTTP approve endpoint and never evaluates chat text as code. WhatsApp accepts signed provider callbacks on a separate restricted listener. It does not request broad native session grants. Unsupported approvals and invisible/oversized proposals are declined for local review.

## Protect credentials and data

Use a separate OS account or container for the bridge and keep messaging credentials out of the agent's filesystem and environment. The Codex runner strips `TELEGRAM_*`, `WEIXIN_*`, `WHATSAPP_*`, and `DONERELAY_*` variables before launching Codex, case-insensitively. This is not a boundary against another process running as the same OS user or reading the same `.env` file. The standalone skill needs only the bridge URL/token, never messaging credentials. Do not expose the private agent API publicly without a reviewed HTTPS authentication and network policy.

Task text, answers, sender identifiers, and conversation context are stored locally in plaintext. State files use mode 0600 and completed requests are retained for seven days. WhatsApp consent/window state and a bounded replay cache persist separately; stale replay entries are pruned on subsequent inbound activity. Production application logs avoid request bodies and tokens. Do not send passwords, confidential artifacts, or private reasoning in notifications; messages leave your host and pass through the provider. Treat the provider and bridge as part of the trust boundary.

## WhatsApp callback isolation

Only expose the separate webhook port (default 8788) through your HTTPS proxy; never route the WhatsApp callback hostname to the agent API on 8787. `/webhooks/whatsapp` accepts the setup verification challenge and HMAC-SHA256-authenticated message POSTs. The setup verification token is not sufficient to authenticate a message. Raw-body verification precedes JSON parsing; business account, sending phone number and recipient must match configured values. Group traffic and unsupported message types are ignored.

Preserve request bytes and signature headers at the proxy, limit request rates, and avoid logging query strings or message bodies. Bodies are bounded to 256 KiB; compressed payloads are not accepted. START and STOP control this channel's consent, not other channels. The current implementation has no template fallback outside the 24-hour reply window and does not interpret delivery/read receipts as consent. See [WhatsApp setup](docs/WHATSAPP.md).

## Failure and replay behavior

A synchronous state transition is persisted before acknowledging a decision. The first valid decision wins across configured channels. Request expiration is checked during each decision, not only by a timer. WhatsApp records the inbound replay marker and valid decision together; a storage failure rolls back both and asks the provider to retry. Restart cancels pending requests. Durable recording does not make downstream commands exactly-once: each agent adapter must track whether its operation already ran and must never reuse an old approval. The live Codex runner creates new native-bound requests and does not resume them after a crash.

The state lock supports one process, not multiple replicas. Never remove a lock while its owner is active. A crash can require verifying the old process has stopped and manually removing a stale lock. A filesystem error, network timeout, lost native session, unsupported request, or empty channel delivery must not be interpreted as approval. A successful send is provider API acceptance, not proof of device delivery.

## Supported scope and reporting

Telegram, WhatsApp and Weixin adapter tests use mocked providers. Provider login, account policies, delivery, API compatibility, and unattended idle behavior need live validation. Native Codex support is experimental and scoped to its runner-owned connection. Self-hosting and code-level opt-in checks are not legal or platform-policy certifications.

For a security issue, use GitHub's private vulnerability reporting only if it is enabled for this repository. Otherwise contact the maintainer through a private channel listed on their profile. Do not publish exploit details, credentials, task contents, or full state dumps in a public issue. No private-reporting channel is claimed to be preconfigured by this commit.

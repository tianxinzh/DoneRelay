# Security policy and boundaries

This alpha has not had an independent security audit. Do not use it for unattended high-stakes production operations until reviewed and live-tested.

The bridge binds loopback by default, authenticates the private agent API with a long random bearer token, validates a bound user, and resolves immutable requests at most once within a single process. Its private API has no HTTP approve endpoint and never evaluates chat text as code. WhatsApp accepts signed provider callbacks on a separate restricted listener. It does not request broad native session grants. Unsupported approvals and invisible/oversized proposals are declined for local review.

## Protect credentials and data

The complete bundle runs under the same OS user as the agent. Setup stores messaging credentials outside the project in owner-only local files; the service loads them itself, and ordinary skill use does not export them into agent shells. The helper reads only generated internal connection settings for requests. This is not a filesystem security boundary against the same user, administrator, or an agent granted access to that user's files. Do not claim otherwise.

The managed service binds an automatically chosen port on 127.0.0.1. Setup generates its internal bearer token. Lifecycle requests authenticate and verify instance identity before stopping; no process is killed merely because its PID appears in a file. Status and doctor omit credentials. Startup passes only a small standard environment allowlist, excluding agent API keys and arbitrary NODE_OPTIONS. The native Codex runner also strips messaging and DoneRelay namespaces before launching its child.

Task text, answers, sender identifiers, and conversation context are stored locally in plaintext. State files use mode 0600 and completed requests are retained for seven days. WhatsApp consent/window state and a bounded replay cache persist separately; stale replay entries are pruned on subsequent inbound activity. Production application logs avoid request bodies and tokens. Do not send passwords, confidential artifacts, or private reasoning in notifications; messages leave your host and pass through the provider. Treat the provider and bridge as part of the trust boundary.

## WhatsApp callback isolation

Only expose the separate webhook port (default 8788) through your HTTPS proxy; never route the WhatsApp callback hostname to the agent API on 8787. `/webhooks/whatsapp` accepts the setup verification challenge and HMAC-SHA256-authenticated message POSTs. The setup verification token is not sufficient to authenticate a message. Raw-body verification precedes JSON parsing; business account, sending phone number and recipient must match configured values. Group traffic and unsupported message types are ignored.

Preserve request bytes and signature headers at the proxy, limit request rates, and avoid logging query strings or message bodies. Bodies are bounded to 256 KiB; compressed payloads are not accepted. START and STOP control this channel's consent, not other channels. The current implementation has no template fallback outside the 24-hour reply window and does not interpret delivery/read receipts as consent. See [WhatsApp setup](docs/WHATSAPP.md).

## Failure and replay behavior

A synchronous state transition is persisted before acknowledging a decision. The first valid decision wins across configured channels. Request expiration is checked during each decision, not only by a timer. WhatsApp records the inbound replay marker and valid decision together; a storage failure rolls back both and asks the provider to retry. Restart cancels pending requests. Durable recording does not make downstream commands exactly-once: each agent adapter must track whether its operation already ran and must never reuse an old approval. The live Codex runner creates new native-bound requests and does not resume them after a crash.

The managed lifecycle serializes startup and reuses one service per local data directory. A verified dead owner permits state-lock recovery on the next invocation; pending requests are then cancelled. Never remove a lock while its owner is active or unknown. A lifecycle command interrupted while holding control.lock requires verifying its recorded process has stopped before removing that control lock. Version mismatches and unavailable live processes are reported without forced restarts. Stop/uninstall reject pending decisions and active sends. A filesystem error, network timeout, lost native session, unsupported request, or empty channel delivery must not be interpreted as approval. A successful send is provider API acceptance, not proof of device delivery.

## Supported scope and reporting

Telegram, WhatsApp and Weixin adapter tests use mocked providers. Provider login, account policies, delivery, API compatibility, and unattended idle behavior need live validation. Native Codex support is experimental and scoped to its runner-owned connection. Self-hosting and code-level opt-in checks are not legal or platform-policy certifications.

For a security issue, use GitHub's private vulnerability reporting only if it is enabled for this repository. Otherwise contact the maintainer through a private channel listed on their profile. Do not publish exploit details, credentials, task contents, or full state dumps in a public issue. No private-reporting channel is claimed to be preconfigured by this commit.

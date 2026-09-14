# DoneRelay privacy and data flow

Source preview notice, updated 2026-09-12. This describes the code distributed by this repository, not a hosted service or a legal-compliance certification. The publisher must review this notice before using it in a directory application.

DoneRelay is self-hosted. The repository does not supply a project-operated relay or account system. Your agent submits a task label and notification, question, or operation proposal to your configured bridge. The bridge forwards content to selected Telegram, WhatsApp Cloud API (Meta), or experimental Weixin providers. Your reply and channel identifiers return through that provider; the caller can retrieve the resulting request record.

The main implementation stores request state locally in plaintext with restrictive file permissions and completed-request retention of seven days. Pending requests are cancelled on restart. Filesystem backups and messaging-provider history have separate retention: local expiry does not erase a provider's copy or your backups.

WhatsApp additionally stores the bound-channel consent/window state, provider message IDs for accepted sends, and a bounded cache of incoming message-ID hashes and timestamps. Stale cache entries are pruned on subsequent inbound activity, not by a promise of immediate deletion at 24 hours. Raw webhook bodies are not logged or persisted wholesale. Your HTTPS proxy or tunnel provider may have its own logs; disable sensitive body/query logging. WhatsApp STOP disables that channel's sends and decisions but does not erase history or disable other channels. See [WhatsApp setup and data handling](docs/WHATSAPP.md).

No project analytics or star-tracking endpoint is required by the supplied skill. Hosting operators, messaging providers, model providers, and any separately installed tools have their own data practices. Self-hosting does not make messages end-to-end private from every provider.

Keep messaging credentials outside agent workspaces, preferably under a separate OS user. Give an agent only the access needed for its intended bridge use. Do not send secrets or unnecessary sensitive information in task summaries and proposals. Do not publish configuration files, state, bot API responses, or private chat logs in issues.

Stop the bridge before deleting its state; do not remove a lock for a running process. Removing local state does not delete provider-side messages. Use the relevant provider's account controls for its retained data.

For non-sensitive project questions, use https://github.com/tianxinzh/DoneRelay/issues. Follow [SECURITY.md](SECURITY.md) for vulnerability handling and do not disclose credentials publicly.

Telegram direct replies require storing the provider message, chat, and bot IDs with a request’s delivery record. These identifiers accompany the request returned to its authenticated caller and expire with the existing request-retention policy. Message contents are not used to infer the reply target.

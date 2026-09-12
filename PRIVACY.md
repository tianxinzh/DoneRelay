# DoneRelay privacy and data flow

Source preview notice, updated 2026-09-12. This describes the code distributed by this repository, not a hosted service or a legal-compliance certification. The publisher must review this notice before using it in a directory application.

DoneRelay is self-hosted. The repository does not supply a project-operated relay or account system. Your agent submits a task label and notification, question, or operation proposal to your configured bridge. The bridge forwards content to the selected Telegram or experimental Weixin provider. Your reply and channel identifiers return through that provider; the caller can retrieve the resulting request record.

The main implementation stores request state locally in plaintext with restrictive file permissions and completed-request retention of seven days. Pending requests are cancelled on restart. Filesystem backups and messaging-provider history have separate retention: local expiry does not erase a provider's copy or your backups.

No project analytics or star-tracking endpoint is required by the supplied skill. Hosting operators, messaging providers, model providers, and any separately installed tools have their own data practices. Self-hosting does not make messages end-to-end private from every provider.

Keep bot credentials outside agent workspaces, preferably under a separate OS user. Give an agent only the access needed for its intended bridge use. Do not send secrets or unnecessary sensitive information in task summaries and proposals. Do not publish configuration files, state, bot API responses, or private chat logs in issues.

Stop the bridge before deleting its state; do not remove a lock for a running process. Removing local state does not delete provider-side messages. Use the relevant provider's account controls for its retained data.

For non-sensitive project questions, use https://github.com/tianxinzh/DoneRelay/issues. Follow [SECURITY.md](SECURITY.md) for vulnerability handling and do not disclose credentials publicly.

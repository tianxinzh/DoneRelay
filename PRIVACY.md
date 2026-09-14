# DoneRelay privacy and data flow

Updated 2026-09-14 for the local bundle. This describes repository behavior, not a hosted service or legal-compliance certification. Publisher review is still required before directory submission.

DoneRelay runs beside your coding agent on the same computer. Its bundled background service forwards requested task labels, notifications, questions and exact operation proposals to your bound Telegram account. Telegram returns replies and sender/message identifiers. The waiting agent receives the resulting request and answer. DoneRelay does not provide a hosted relay or project account system.

Private setup stores the Telegram bot token, bound private user/chat IDs and language in `~/.config/donerelay/local/config.json`. Internal authentication and service identity are generated automatically in separate local records. The directory uses mode 0700 and files mode 0600. They are plaintext, not an encrypted vault. Processes running as the same OS user can read them; keeping them outside the project prevents accidental repository inclusion but is not isolation from that user.

Request state includes text, answers, timestamps, decisions and channel metadata. Telegram direct replies store original message/chat/bot IDs and resolved reply provenance, which are returned to the authenticated caller. Completed requests are retained for seven days while the service runs; cleanup occurs on subsequent service activity after downtime. Restart cancels pending requests. Backups and provider history have independent retention.

No project analytics or tracking service is required. Messages still pass through Telegram and your agent's model provider according to their own practices. Do not send secrets or unnecessary sensitive content in summaries and proposals. Status/doctor output omits credentials; do not publish raw configuration, state, provider responses or private chat logs.

Experimental WhatsApp/Weixin adapter code is also included but not paired by the Telegram wizard. If a developer configures those adapters, their providers also receive selected message contents and replies. WhatsApp stores consent/window state and a bounded incoming-message replay cache; stale entries are pruned on later inbound activity. Raw webhook bodies are not persisted wholesale. An HTTPS callback intermediary may have its own logs. STOP disables WhatsApp sends and decisions, not local retention or other channels. See [WhatsApp details](docs/WHATSAPP.md).

`uninstall` stops an idle service and retains data. `uninstall --purge` stops safely and deletes the tool's local credentials, connection records and request history. Both refuse pending work. Remove the skill/plugin from each host to finish uninstalling; an installed configured skill can start the service again. Local deletion does not delete Telegram messages or backups.

For non-sensitive support, use https://github.com/tianxinzh/DoneRelay/issues. Follow [SECURITY.md](SECURITY.md) for vulnerability reporting.

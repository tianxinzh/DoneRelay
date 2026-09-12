# Security model

DoneRelay v0.1 is an initial implementation for **one trusted operator per bridge**, not a multi-tenant authorization service or a sandbox. No independent security audit is claimed.

## Trust boundaries

Keep the bridge process, SQLite database, Telegram bot token, WeChat transport key, OpenClaw channel state and Gateway on a trusted host outside an untrusted agent's filesystem. Give the agent only the creation/status API key. That key can read other requests on the same bridge and cancel pending requests; it is not per-job isolation.

The separate transport key can attest human responses. Any holder, compromised Gateway/plugin, channel account, host administrator or database writer can defeat that trust boundary. A skill file cannot enforce isolation by itself. Docker only helps when untrusted agents cannot access the Docker socket, bridge volumes, host secrets or network administration.

## Safeguards

Bound private Telegram chat and sender; exact bound WeChat sender and host metadata checks; fixed outbound destinations; authenticated endpoints; no browser-origin access; one terminal decision per request; action SHA-256 binding; typed ask/approve separation; finite TTL and attempts; no auto-approval; no session-wide native permissions; no arbitrary shell execution. WeChat uses `execFile` with argument arrays, not a shell. Telegram payloads are plain text, not Markdown/HTML.

Approval is a historical decision for one operation, not an executable capability. The host/workflow must prevent repeat execution and invalidate approval when command inputs, working directory contents, build version or target change. Source-controlled scripts can change between approval and execution: the caller must bind relevant content/version, not merely a short command name.

## Deployment

Bind to loopback by default. Remote access needs TLS and an authenticated private route; a tunnel is not a replacement for the API key. Limit exposure, request rate, body size, and network access at the reverse proxy. Run one daemon per DB and one poller per Telegram bot. Use unique random 32-byte credentials, restrictive file permissions, prompt rotation after exposure, and least-privilege OS/service users.

Messages and reply text may leak sensitive data to messaging providers. Do not automatically forward raw logs, source files or credentials. Do not execute a returned answer as code. Telegram bot messages are not a secret-store replacement. Hide sensitive lock-screen previews on the phone.

SQLite stores request bodies and operator IDs; retention defaults to seven days after resolution. Backups, SQLite free pages/WAL and provider history can retain data longer; deletion is not secure erasure. Disk exhaustion, bridge downtime, provider outages and upstream plugin changes remain possible. An expired or failed request does not authorize a task.

## Reporting

Do not post secrets or exploit details in public issues. Use the repository's GitHub private vulnerability reporting facility if enabled. Otherwise open a minimal “private security contact requested” issue without sensitive details and arrange a private channel. No private reporting mailbox is claimed to exist.

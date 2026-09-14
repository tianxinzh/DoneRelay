# DoneRelay product direction

Ship one local bundle for Codex and Claude Code. The skill and background runtime live in the same environment; separate hosting is not a product mode.

The first-run experience is install → private Telegram pairing → invoke the skill → reply on the phone. Internal authentication, loopback connectivity, startup and sharing between agent hosts are handled by the bundle. Setup and product messages use one language selected by the user or chosen automatically from context.

Keep bounded approvals, sender/provenance validation, expiration, single-use decisions and cancellation on restart. A background process cannot keep a closed agent running or prevent computer sleep. The current process is detached and starts on demand; it is not registered at boot or continuously supervised.

Validate the complete local install on the intended OS and both actual agent hosts, then capture a real phone-and-agent recording and recruit initial testers. Track independent successful setups and repeat use. Keep external publisher requirements in [submission materials](SUBMISSION.md), not in the installation flow.

Telegram is the initial beta scope. WhatsApp and Weixin remain experimental until account setup, reply handling and idle delivery pass live validation. No separate hosting feature or remote MCP service is planned for this bundle.

# Local bundle setup and lifecycle

This skill includes the complete runtime under `scripts/runtime/`. It runs alongside the coding agent on the same computer. Node.js 22+ is required. It does not connect to a separately hosted service.

Resolve this skill's installed directory and give the user this exact terminal command with its absolute path:

```sh
node /absolute/path/to/donerelay/scripts/relay.mjs setup
```

The user runs setup in their own interactive terminal. It hides the token, offers en/zh/auto, prints a private Telegram pairing link, and binds the account that sends its one-time Start challenge. Use a dedicated @BotFather bot. Never ask for tokens in the conversation or enter them through model-controlled tool arguments. The wizard verifies private identity and rejects existing webhooks without changing them. If another app consumes this bot's updates, the user must resolve that conflict.

Configuration and state are stored in `~/.config/donerelay/local/`, with owner-only permissions. API credentials and a loopback port are internal implementation details; do not ask the user to configure them or export a private environment file. The service reads messaging credentials itself. Same-user processes can still read those files; this is not OS-level isolation from the agent.

`status` and `doctor` inspect local setup without starting or sending. `start` reuses or starts the bundle's detached Node service. Request and result commands do this automatically. All installed copies under the same OS user share one service, unless the user explicitly selects an isolated `DONERELAY_HOME`. Versions must match; finish pending work, then use `stop` and `start` after an update. No automatic restart occurs on a version mismatch.

`stop` refuses pending decisions or active sends. `uninstall` stops but keeps configuration; `uninstall --purge` additionally removes local credentials and history. Host skill/plugin removal is a separate final step. Do not stop the shared service after each task. Never delete a state/control lock whose owner is running or unknown.

The service is not registered at boot or continuously supervised. After a crash or reboot, the next invocation starts it; pending requests are cancelled. An already waiting caller fails closed on a lost connection. The computer and agent must remain awake and running. This skill cannot revive a terminated workflow, bypass native permissions, or guarantee a hosted sandbox's background-process lifetime.

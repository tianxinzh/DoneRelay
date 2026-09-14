# DoneRelay

Your coding agent is waiting for a decision. Reply from Telegram and keep the task moving.

DoneRelay is **one local bundle for Codex and Claude Code**. It includes the skill, Telegram integration, request store, and background service. Install it where your agent runs, pair your Telegram bot once, and let the skill start the service when needed. No separate server, Docker deployment, bridge URL, or manually generated API token is part of normal installation.

[Installation](docs/INSTALLATION.md) · [FAQ](docs/FAQ.md) · [Validation record](docs/LAUNCH.md) · [简体中文](README.zh-CN.md)

Current source candidate: **0.1.0-alpha.6**. Telegram is the beta scope. WhatsApp and experimental WeChat adapters remain developer previews. No npm publication, official marketplace acceptance, or hosted-agent compatibility is claimed.

## Install

Use Node.js 22+ and an installed, authenticated Codex or Claude Code on the **same computer**. Linux is the validation host; macOS and Windows need their own acceptance runs. The computer and waiting agent must remain awake and running.

### Codex

```sh
git clone https://github.com/tianxinzh/DoneRelay.git
cd DoneRelay
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
node ~/.agents/skills/donerelay/scripts/relay.mjs setup
```

Setup hides the bot token, gives you a private Telegram pairing link, binds the account that opens it, and saves settings outside the project. Use a dedicated bot created with @BotFather. Reload Codex after installation.

### Claude Code

In Claude Code:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

This is DoneRelay's own catalog. Reload the plugin if prompted, then ask:

> Use /donerelay:donerelay to help me set up Telegram on this computer.

The skill gives you the `node /absolute/installed/path/scripts/relay.mjs setup` command to run in your own terminal. Enter the token there, never in the agent conversation. If you already paired DoneRelay as the same OS user through Codex, that setup is shared automatically.

## Use it

In Codex:

> Use $donerelay to ask whether this example should use SQLite. Wait for my Telegram reply.

In Claude Code:

> /donerelay:donerelay Ask whether this example should use SQLite and wait for my Telegram reply.

- **Notifications:** explicitly request a completion update.
- **Questions:** use Telegram Reply and type the answer; no request ID needed.
- **Approvals:** use the buttons or reply `approve` / `deny` to the original message. A casual “okay” is not approval.
- **Language:** `/language en`, `/language zh`, or `/language auto`. Automatic mode lets the agent choose one language from context. Exact proposals and commands remain unchanged.

New direct replies bind to the original Telegram message, private chat, and bot. Forwarded copies are not valid targets. Numbered `answer ID text`, `approve ID`, and `deny ID` commands remain supported. A question answer never authorizes an operation.

## Local lifecycle

From a source checkout, use `node src/cli.js COMMAND`. From an installed skill, use `node /absolute/path/to/donerelay/scripts/relay.mjs COMMAND`.

| Command | Behavior |
| --- | --- |
| `setup` | Guided private bot pairing; generates internal connection settings |
| `start` | Start or reuse this user's bundled service |
| `status` | Report setup, process/version, and pending count without secrets |
| `doctor` | Check local configuration, service authentication, version, and Telegram account |
| `stop` | Refuse while requests or sends are pending; otherwise stop gracefully |
| `uninstall` | Stop the service, retain configuration/history, then report host removal step |
| `uninstall --purge` | Stop safely and delete DoneRelay configuration and request history |

The skill automatically starts/reuses the service before requests, preferences, and result reads. It shares one local service across Codex and Claude under the same OS user. It does not restart a healthy service for each task. Updating a bundle while another version is running requires finishing pending requests, then `stop` and `start`. A version mismatch never triggers an automatic restart.

The service is a detached Node process, not an OS boot service. After logout, reboot, or a crash, the next skill invocation can start it again. Restart **cancels pending requests**; it never recovers permission to execute an old operation. If an active caller loses its connection, it fails closed. The skill cannot revive a terminated agent or prevent host sleep.

Settings and state live in `~/.config/donerelay/local/` (directory 0700, files 0600). A random authenticated loopback port and internal token are managed automatically. Credentials are not exported into agent shells. Same-user filesystem permissions are not isolation from a process running as that user. See [security](SECURITY.md) and [privacy](PRIVACY.md).

## Native Codex tasks

The skill handles explicit notification/question/approval requests. For supported **native Codex approval prompts**, start a new task through the included adapter:

```sh
node src/cli.js codex \
  --cwd /absolute/path/to/project \
  --prompt "Inspect this project and run its tests."
```

This also starts the bundled local service automatically. For structured planning questions, use `codex --plan --prompt "Ask me which option to plan for."`. The adapter owns its App Server thread and preserves native host permissions. It cannot attach to an unrelated terminal, grant blanket session permissions, or continue after the host exits. Claude's skill does not intercept every native permission prompt. See [installation](docs/INSTALLATION.md).

## Validation and development

```sh
npm ci --ignore-scripts
npm test
npm run check:discovery
npm run check:package
claude plugin validate . --strict
```

The canonical runtime is in `skills/donerelay/scripts/runtime/`; copying the complete skill includes it. `src/` contains compatibility entry points, not a second implementation. Tests distinguish simulated providers from live account evidence. See [launch gates](docs/LAUNCH.md), [contributing](CONTRIBUTING.md), and [developer details](docs/DEVELOPMENT.md).

[WhatsApp](docs/WHATSAPP.md) requires a Meta business account, signed HTTPS callbacks, START opt-in and an active 24-hour window; **there is no approved-template fallback**. [Weixin](docs/WEIXIN.md) has no QR setup wizard and needs authorized login and idle-delivery validation. Neither is included in the Telegram setup wizard.

## Demo and project status

![Illustrated example of a coding task and Telegram decision](docs/assets/donerelay-checkout-demo.gif)

This GIF illustrates the workflow; it is not a live phone recording or evidence of installation success. [Static image](docs/assets/donerelay-checkout-demo-poster.png). Real recording, independent tester results and marketplace submission remain separate [release gates](docs/LAUNCH.md).

MIT-licensed. [Support](https://github.com/tianxinzh/DoneRelay/issues) · [Terms](TERMS.md) · [Submission status](docs/SUBMISSION.md)

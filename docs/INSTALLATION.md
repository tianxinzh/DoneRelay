# Install the complete local DoneRelay bundle

DoneRelay and your coding agent run on the same computer, under the same OS user. The skill contains the runtime; no separate server, Docker deployment, bridge URL, or manual API-token setup is needed. Node.js 22+ and an authenticated Codex or Claude Code installation are prerequisites. Linux is validated separately from macOS and Windows; see [launch evidence](LAUNCH.md).

## Codex

From a clone of this repository:

```sh
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
node ~/.agents/skills/donerelay/scripts/relay.mjs setup
```

Copy the **whole directory**, including `scripts/runtime`. The runtime includes its own module metadata, so it works outside the repository. Restart/reload Codex. Repository-scoped installs may instead use `.agents/skills/donerelay`; both locations use the same per-user local setup.

Ask: “Use $donerelay to ask one harmless question and wait for my direct Telegram reply.”

## Claude Code

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

Reload if prompted. Ask `/donerelay:donerelay Help me set up Telegram locally.` The skill resolves its installed path and gives you a terminal command:

```sh
node /absolute/installed/path/to/donerelay/scripts/relay.mjs setup
```

Run it in your own terminal. The plugin includes the same runtime as the Codex skill. Setup completed under the same OS user is reused, so installing both hosts does not require a second bot or second service. This is DoneRelay's own catalog, not an official directory listing.

## Pair once

1. Create a dedicated bot with Telegram's @BotFather.
2. Run `setup` in an interactive terminal. Choose `en`, `zh`, or `auto` and enter the bot token in the hidden prompt.
3. Open the printed Telegram link in a **private** chat and press Start within three minutes. Setup matches a random one-time challenge and binds that chat/user. It does not ask you to look up account IDs.
4. Setup verifies the account and absence of a webhook, then stores credentials privately outside the project. It generates internal authentication automatically.
5. Invoke the skill. It starts the local background service and sends your requested message.

Do not run two consumers for the same bot. Setup does not remove an existing webhook or stop another application. No setup step sends credentials into the model conversation. For controlled automation, `setup --from-env` validates and imports only the Telegram configuration and language; it does not import an external bridge URL/token.

## Check and manage

Replace `COMMAND` below with `start`, `status`, `doctor`, `stop`, `uninstall`, or `uninstall --purge`:

```sh
node /absolute/installed/path/to/donerelay/scripts/relay.mjs COMMAND
```

`doctor` is read-only: it never polls, sends, starts, or restarts. If the service is stopped, `start` or a skill request starts it. Stop and uninstall refuse while a request or send is pending. Resolve/cancel the request or let it expire first. Uninstall retains settings unless `--purge` is supplied; then remove the Codex skill directory or run `/plugin uninstall donerelay@donerelay-plugins` in Claude. If both hosts use DoneRelay, remove both integrations when fully uninstalling. Keeping an installed integration allows it to start the service again.

No boot/login registration is installed. The next invocation starts the service after reboot or crash; pending requests are cancelled at restart. A stopped or sleeping agent cannot continue from a reply. An unavailable process is reported rather than killed by an unverified PID.

To update, install the new bundle, finish outstanding requests, and run `stop` then `start` using that bundle. Keep both hosts on the same release. A running version mismatch blocks requests without interrupting the existing service. Direct replies to old messages require their saved binding; numbered commands remain available.

## Smoke test

Use a disposable project. Request a completion notification, ask a question, approve one harmless exact operation and deny another. Reply directly to the original question. Check the same caller gets `answered`, not `approved`. Test expiration and duplicate rejection. Record the exact commit, OS, Node and host versions; a passing doctor is not proof of phone delivery.

For native Codex tasks, run the bundled helper with `codex --cwd /path/to/project --prompt "Inspect this project."`. Use `--plan` for structured planning questions. The adapter must own the running thread. Claude currently uses explicit skill requests, not native permission interception.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Setup requires a terminal | Run the command yourself in an interactive terminal; do not paste a bot token into the conversation |
| Pairing expires | Open the printed link and press Start in a private chat; check network and other bot consumers |
| Already configured | Reuse the setup; to replace the bot, finish pending work and use `uninstall --purge`, then `setup` |
| Service stopped | Invoke the skill or run `start` |
| Running version differs | Finish pending work, then use the new bundle's `stop` and `start` |
| Reply ignored | Use the original request message, correct private account and response kind; check expiry |
| Request cancelled after restart | Expected; make a fresh request if still needed |
| Stale `control.lock` | Verify its recorded PID is no longer running before removing only that file; never delete a live/unknown lock |
| Agent ends or computer sleeps | The tool cannot keep that workflow alive or wake the computer |

Local data defaults to `~/.config/donerelay/local/`. `DONERELAY_HOME` can select an isolated local directory for testing; use the same setting for both hosts if intentionally sharing. This does not enable remote hosting. Owner-only files protect against other users, not processes with your own user permissions.

See [FAQ](FAQ.md), [security](../SECURITY.md), and [developer internals](DEVELOPMENT.md).

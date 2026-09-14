# DoneRelay FAQ

## Can I reuse the Slack connection already in Codex or Claude?

Yes, for notifications to your own Slack DM when that connection exposes the needed identity, conversation and write tools. No new Slack credentials or service are required. Slack-only use skips Telegram setup. Questions and approvals still use the supported Telegram workflow. See [Slack](SLACK.md).

## Do I need a separate bridge or server?

No. The skill contains the complete Node runtime and starts its own local background service when needed. Codex or Claude Code and DoneRelay run in the same environment. The local service performs Telegram polling and request tracking; users do not configure an API URL or internal token.

## Does installation include everything?

It includes the skill, helper, service and adapters. You still need Node.js 22+, an installed/authenticated agent, and a Telegram bot. Guided setup hides the token, binds a private account using a pairing link, and generates the internal connection automatically. See [installation](INSTALLATION.md).

## Can both Codex and Claude Code use one installation?

Install the skill/plugin in each host. Under the same OS user, both use one local setup and one background process. Keep their bundle versions matched. A mismatch asks you to finish outstanding work and restart from the updated bundle; it does not interrupt decisions automatically.

## Can I reply directly from Telegram?

Yes. Reply to the original question with plain text. Approvals accept explicit `approve` or `deny` replies or buttons. Forwarded messages, wrong users, expired/cancelled requests and duplicate decisions are rejected. A question answer is not an approval. Numbered commands remain available.

## Can it keep working while my computer sleeps or the agent closes?

No. The computer and waiting agent must remain running. The bundled service is detached from the helper command, but it cannot prevent sleep or revive a closed agent. It is not installed as a boot service. On the next invocation after a crash/reboot it starts again, cancelling old pending requests. A lost caller connection fails closed.

## Does the skill intercept every native permission prompt?

No. Claude uses explicit skill requests. The included Codex adapter can relay supported approvals/questions only for the new App Server thread it starts. Native host permissions remain enforced. A plain installed skill does not take over unrelated terminals.

## How do I change language?

Use `/language en`, `/language zh`, or `/language auto` in the bound Telegram chat. Automatic mode lets the agent choose one language from context. A message contains one language; exact code and proposal contents are preserved.

## How do I stop, remove, or change accounts?

Use the bundled helper's `stop` or `uninstall`. Both refuse pending work. `uninstall --purge` also removes local settings and history; then remove the host skill/plugin. To change bot, purge after finishing pending work and run `setup` again. Removing local data does not remove Telegram history. If another installed host still has the skill, it can start the service again when configured.

## Where are credentials stored?

Outside the project in `~/.config/donerelay/local/`, using owner-only permissions. The background process loads provider credentials itself; the helper manages internal connection settings. Processes running as the same OS user can still read those files. See [privacy](../PRIVACY.md) and [security](../SECURITY.md).

## Are WhatsApp and WeChat included?

Their experimental adapter code is included, but the guided bundle setup currently covers Telegram only. WhatsApp requires Meta business setup, a signed HTTPS callback, START opt-in and an active 24-hour reply window; there is no approved-template fallback. Weixin requires authorized login/context and has no QR-login wizard. Both need live account/idle validation. See [WhatsApp](WHATSAPP.md) and [Weixin](WEIXIN.md).

## Is it listed, hosted, or on npm?

The source is MIT-licensed. No project-hosted service, npm publication or official directory admission is claimed. Claude installs through DoneRelay's own catalog. Hosted-agent environments and macOS/Windows acceptance require separate testing; see [launch record](LAUNCH.md) and [submission status](SUBMISSION.md).

## Is the demo GIF real evidence?

No. It is an illustrated workflow, not a live phone recording or an installation result. Release claims must use actual recorded evidence.

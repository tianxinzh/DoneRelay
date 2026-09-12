# Personal WeChat / Weixin (experimental)

This adapter uses **Tencent's external OpenClaw Weixin channel**, not WeCom and not an unofficial browser-login scraper. It has not been live-tested in DoneRelay. Core tests mock the OpenClaw command context and outgoing CLI. Follow the upstream version requirements before installing; OpenClaw's plugin APIs are experimental and its current host Node requirements differ from DoneRelay core.

## Topology

```text
Agent → DoneRelay API + SQLite ← private WeChat worker
                                      ↓ openclaw message send
                                Tencent Weixin channel → your phone
                                      ↑
DoneRelay reply API ← deterministic /donerelay OpenClaw command
```

The Gateway and worker are trusted transport components. They hold `DONERELAY_WECHAT_TOKEN`, a separate random secret that can attest human replies. Keep them and the OpenClaw state directory away from the coding agent. Only one bound operator/channel account is supported by each bridge.

## Setup

On the trusted Gateway host, install a compatible OpenClaw and review Tencent's plugin before installation:

```bash
openclaw plugins install "@tencent-weixin/openclaw-weixin"
openclaw config set plugins.entries.openclaw-weixin.enabled true
openclaw gateway restart
openclaw channels login --channel openclaw-weixin
```

Scan the QR code yourself. First verify plain messaging with the upstream channel. Obtain your stable sender ID and, when relevant, account ID from your **own trusted channel configuration/runtime**, not from a message claiming an identity. There is deliberately no “first incoming user becomes the owner” flow.

Generate a new, separate 32-byte random key with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Configure the bridge's private environment:

```dotenv
DONERELAY_WECHAT_TOKEN=YOUR_SEPARATE_RANDOM_KEY
WECHAT_USER_ID=YOUR_EXACT_WEIXIN_SENDER_ID
WECHAT_TARGET=YOUR_EXACT_WEIXIN_DIRECT_MESSAGE_TARGET
```

`WECHAT_TARGET` defaults to `WECHAT_USER_ID`. Confirm the target form with your channel version. Set a private worker/Gateway environment with the same transport key and `DONERELAY_URL`; set `WECHAT_ACCOUNT_ID` when routing through a non-default account. **The agent never needs these values.**

From the repository, install the reply plugin:

```bash
openclaw plugins install ./integrations/openclaw
```

Merge this entry into your existing OpenClaw config—do not replace unrelated configuration:

```json
{
  "plugins": {
    "entries": {
      "donerelay-wechat": {
        "enabled": true,
        "config": {
          "url": "http://127.0.0.1:8787",
          "senderId": "YOUR_EXACT_WEIXIN_SENDER_ID",
          "accountId": "YOUR_ACCOUNT_ID"
        }
      }
    }
  }
}
```

Omit `accountId` only when deliberately using the default account. The Gateway process must inherit the private transport key from its actual service environment; exporting it in an unrelated terminal does not configure a running system service. Add this plugin to any existing plugin allowlist, restart the Gateway, and inspect the registration:

```bash
openclaw plugins inspect donerelay-wechat --runtime --json
```

Start the DoneRelay bridge, then the outgoing worker on the same trusted host that has the OpenClaw CLI/channel configuration:

```bash
node --env-file=/ABSOLUTE/PRIVATE/PATH/wechat-worker.env integrations/openclaw/transport.mjs
```

This file needs only the transport key, bridge URL and optional account ID. Do not run the worker inside the untrusted agent sandbox. It uses an argument array with `execFile`, never a shell.

## Reply syntax

```text
/donerelay approve 0123456789abcdef01234567
/donerelay reject 0123456789abcdef01234567
/donerelay reply 0123456789abcdef01234567 staging
```

Use the actual ID from the notification. Chinese verbs 批准 / 拒绝 / 回复 are also accepted after `/donerelay`. Ordinary “yes” cannot approve. The handler checks the host-authenticated sender, channel ID, authorization flag, optional account ID, and the bridge's independently bound sender. It bypasses an LLM; replies do not become an unrestricted agent chat instruction.

## Important upstream caveat

The upstream documentation checked on **2026-09-12** warns that Weixin plugin 2.4.8 uses legacy allowlist/scanner-fallback behavior rather than the standard pairing adapter. Do not assume `openclaw pairing` commands enforce/revoke that channel's access. DoneRelay adds its own exact sender check, but this does **not** repair unrelated OpenClaw chat surfaces. Use a dedicated, restricted Gateway. When upstream access control cannot be verified, leave the WeChat channel disabled and use Telegram.

Before enabling real approvals, prove a notification, question, approval, rejection, wrong-user rejection, expiry and restart recovery on your exact host/plugin versions. Record the versions in the release checklist. Check unsolicited delivery after idle periods and login/session expiry; DoneRelay does not promise unlimited proactive delivery.

## Primary sources

- [OpenClaw WeChat channel, setup and access-control caveats](https://docs.openclaw.ai/channels/wechat)
- [Tencent-maintained Weixin plugin](https://github.com/Tencent/openclaw-weixin)
- [OpenClaw plugin API and host requirements](https://docs.openclaw.ai/plugins/building-plugins)
- [Deterministic plugin commands](https://docs.openclaw.ai/plugins/sdk-overview/tools-and-commands)
- [Host command context types](https://github.com/openclaw/openclaw/blob/main/src/plugins/plugin-command.types.ts)
- [OpenClaw message CLI](https://docs.openclaw.ai/cli/message)

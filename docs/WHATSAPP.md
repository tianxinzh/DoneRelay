# WhatsApp notifications and approvals for AI agents

DoneRelay's WhatsApp adapter uses Meta's official **WhatsApp Business Platform Cloud API**. It is independently implemented and experimental: automated tests use a mocked Meta provider, not a live account. It is not a personal WhatsApp QR-login bridge, an official Meta plugin, or a general-purpose chatbot.

## What works in this source

Notifications, bounded questions, and single-operation approvals use the existing request API. Replies are explicit `approve ID`, `deny ID`, or `answer ID text`, including the Chinese equivalents. Approval messages up to 1024 UTF-16 code units use two reply buttons; longer proposals use a complete text message, never a truncated approval. The relay's existing 2000-character proposal limit remains unchanged.

All configured channels share the same request ID; the first valid decision wins. No text is executed as a shell command. Native agent permissions still apply. The bridge never initiates a deploy itself.

## Account and credential setup

Use a Meta developer app with WhatsApp Business Platform, a WhatsApp Business Account (WABA), and its sending phone-number ID. Complete Meta's applicable account/number registration and recipient test setup. Use your app dashboard and current Cloud API documentation for account eligibility and production permissions; DoneRelay cannot register or verify those accounts for you.

The Telegram setup wizard does not configure WhatsApp. For low-level adapter development, configure these values privately on the **same computer**, outside the project:

| Variable | Meaning |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Access token authorized to send messages for the business number |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending business phone-number ID, not the displayed telephone number |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA ID; must match webhook entry.id |
| `WHATSAPP_USER_ID` | One authorized recipient's international digits, without +; must match inbound from |
| `WHATSAPP_APP_SECRET` | Meta app secret used to verify X-Hub-Signature-256 |
| `WHATSAPP_VERIFY_TOKEN` | Separate random verification string, at least 32 characters, matching the Meta callback configuration |
| `WHATSAPP_GRAPH_VERSION` | Explicit supported Graph API version for your app, in vN.0 form; no version is guessed |
| `WHATSAPP_WEBHOOK_HOST` | Defaults to HOST, otherwise 127.0.0.1 |
| `WHATSAPP_WEBHOOK_PORT` | Defaults to 8788; must differ from the private API port |

Do not share tokens here or in an issue. Use distinct secrets for the agent API and webhook setup. A short-lived dashboard token will expire; select an appropriate authorized token for real deployments. This adapter binds one WABA, one sending number, and one recipient per process. Groups, media, template-button callbacks, and alternate recipient identifier modes are not supported.

## Developer-only local callback setup

For a controlled adapter test, run `node --env-file=/secure/path/transport.env src/cli.js serve`. This is the [low-level developer entry point](DEVELOPMENT.md), not the local skill installation flow. Keep the file outside the project. The guided bundle currently supports Telegram setup only.

Keep the authenticated agent API on port **8787** private. Route a public HTTPS tunnel or reverse proxy, including Cloudflare Tunnel, to the **separate webhook listener on 8788**. Set Meta's callback to:

```text
https://your-webhook-host.example/webhooks/whatsapp
```

Complete the GET verification handshake with the configured verification token. Subscribe the app to **messages** events for the correct WABA; entering a callback URL alone is not enough. Preserve raw POST bytes and `X-Hub-Signature-256`. Do not put an interactive login page in front of this callback, transform JSON bodies, or forward the WhatsApp hostname to port 8787.

Only GET/POST `/webhooks/whatsapp` exists on this listener; `/v1/requests` returns 404 there. Incoming POSTs require HMAC-SHA256 with the app secret. The setup verification token does not authenticate message POSTs. Put sensible rate limits and TLS at your proxy; request bodies above 256 KiB and compressed bodies are rejected. Avoid logging callback query strings or bodies because the former can contain the verification token and the latter contain personal information.

## Opt in, then test a harmless question

From your bound personal recipient, message the business number with **START**. That explicitly enables this channel and records the message timestamp. **STOP** disables future WhatsApp sends and decisions; ordinary text does not opt you back in. A fresh START re-enables it. STOP wins over START with the same provider timestamp; wait at least a second before restarting. Other channels are not disabled by a WhatsApp STOP.

For this developer test, use the low-level client in a local script and load its private transport environment with Node's `--env-file` option:

```js
import { Client } from './src/client.js';
const client = new Client();
const request = await client.create({
  kind: 'question', task: 'checkout-fix',
  message: 'Which empty-cart error wording should we use?',
  channels: ['whatsapp'], ttlSeconds: 300,
});
console.log(await client.wait(request.id));
```

Reply `answer ID Cart is empty` with the actual request ID. The caller should read `answered` and the answer. For an approval, read `approved`; an answer, vague agreement, receipt, or delivery status is never authorization. No extra chat acknowledgement is sent for each inbound message; read the caller's result and final task notification.

## 24-hour window and long-running jobs

Meta permits free-form replies within 24 hours of the recipient's last message; outside that window, approved message templates are required. DoneRelay records the timestamp of a verified inbound message from the bound recipient and refuses free-form sends when the window is closed. Old retries do not reopen it.

**This release has no template fallback.** It therefore does not promise unattended WhatsApp notifications after more than 24 hours without a new inbound message. Keep Telegram enabled for such jobs, or return to WhatsApp and send a new message before creating a fresh request. Do not bypass this policy with a personal-account automation library.

Per-channel failures expose `whatsapp_opt_in_required` or `whatsapp_window_closed`. Other provider errors are redacted. A request with failed delivery is not automatically resent when the window reopens: cancel it if still pending and create a fresh request with a new idempotency key. A successful send records a provider message ID and means **API acceptance**, not device delivery or reading. Status webhooks are ignored in this preview; they never grant permission.

## Safety and retention

Signature validation precedes parsing and state mutation. Account, business-number and sender checks precede consent or decision changes. Incoming message ID hashes are deduplicated in a bounded local cache, and old entries are pruned on subsequent inbound activity. A full cache fails with 503 rather than dropping fresh replay markers. Consent/window state persists across restarts, while pending requests are cancelled under the existing main-branch policy. Decisions and replay markers are persisted together before returning 200 to Meta; storage failure returns an error for retry.

No webhook body is logged or persisted wholesale. Request proposals, answers, provider IDs, consent/window timestamps, and message-ID hashes still constitute local data; protect the state directory. See [privacy](../PRIVACY.md) and [security](../SECURITY.md). Opt-in here is an application safeguard, not a claim of legal or platform-policy certification. Operators remain responsible for the applicable Meta terms, permitted use, opt-in and fees.

## Live acceptance checklist

Before relying on it, verify on your own Meta setup: callback verification and subscription; START; question/answer; one approve and one deny; a repeated callback; an unbound sender; expiry; STOP and START; expired access token; a closed 24-hour window; and simultaneous Telegram/WhatsApp resolution. Keep a native agent permission gate in the test. Do not label local mocked tests or the README GIF as live WhatsApp validation.

## Primary references

Checked for this implementation on 2026-09-12:

- [WhatsApp Business Messaging Policy: opt-in and 24-hour/template rules](https://business.whatsapp.com/policy)
- [Meta Cloud API documentation entry point](https://developers.facebook.com/docs/whatsapp/cloud-api/)
- [Meta's SDK documentation: HTTPS webhook setup](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/receivingMessages/)
- [Meta's SDK documentation: reply-button message shapes](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/interactive/)

The SDK documentation is archived and used as a payload/setup reference, not as a dependency or evidence of current SDK maintenance. DoneRelay calls the selected Graph API version directly with Node's built-in fetch. Verify your configured version against current Meta documentation and live acceptance tests.

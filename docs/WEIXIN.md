# Experimental personal WeChat / Weixin transport

Checked against the public Tencent client protocol on 2026-09-12:
https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md

The protocol document describes the current client's wire format, not a complete guaranteed server contract. DoneRelay is an independent implementation of its text send/receive subset, not an official Tencent integration. This is not WeCom / enterprise WeChat.

## Prerequisites and local setup

Use an eligible account and an authorized login. The official plugin documents its QR-code flow here:
https://github.com/Tencent/openclaw-weixin#quick-start

DoneRelay's initial release does not implement QR rendering, verification-code prompts, QR redirects, or automatic credential import. From your own authorized setup, configure these values locally:

- `WEIXIN_BOT_TOKEN`: the bot credential returned by authorized login.
- `WEIXIN_USER_ID`: the precise account permitted to respond (login describes `ilink_user_id`).
- `WEIXIN_BASE_URL`: the trusted HTTPS API origin, default `https://ilinkai.weixin.qq.com`; the code rejects non-Weixin hosts.

Do not paste credentials in chat, issues, commands saved to public logs, or source files. Do not run another poller using the same bot identity while testing DoneRelay.

Start DoneRelay and send a private message from the configured account. Only messages from that account update the local conversation context. `WEIXIN_CONTEXT_TOKEN` can provide an initial local context, but normally should remain empty so the latest inbound message establishes it. Context is stored in the private local state file.

Text replies are explicit: `批准 REQUEST_ID`, `拒绝 REQUEST_ID`, `回答 REQUEST_ID 内容`. English equivalents are also accepted. Group messages and unbound users are ignored. No media or arbitrary chat-to-shell execution is implemented.

## Implemented protocol subset

The adapter sends authenticated JSON POST requests to `ilink/bot/getupdates` and `ilink/bot/sendmessage`, preserves the polling cursor, checks HTTP and business error codes, and sends back conversation context. Error -14 pauses polling for an hour for local re-authorization. It advertises itself as `DoneRelay/0.1.0`, not as the official plugin.

Missing context fails sending explicitly. Telegram can be configured alongside Weixin; by default a request is sent to every configured channel, not silently redirected to an unknown recipient. Failed sends are recorded. A pending question/approval with failed delivery remains pending until cancelled or expired and never grants permission.

## Live acceptance gates — not completed

Test account login and eligibility, inbound text, outgoing notifications, reply-to-request association, duplicate replies, revoked credentials, one-hour idle, overnight idle, session re-authorization, and network interruption. Confirm that no ordinary greeting or unrelated chat can approve an operation. Check that token expiry is visible in deployment monitoring.

Do not advertise reliable unattended personal-WeChat delivery until these live tests pass. Mocked HTTP responses prove request formatting, not server acceptance, bot availability, account safety, or delivery guarantees.

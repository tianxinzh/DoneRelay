# DoneRelay skill setup

This skill is a client, not a messaging server. Installing it does not start a service, create a Telegram bot, or configure any account.

The trusted bridge host needs Node.js 22+ and the DoneRelay service from https://github.com/tianxinzh/DoneRelay. Follow that repository's README to configure a bot, bind your private chat and user, and run the bridge. Keep messaging credentials outside the agent workspace, preferably under a separate OS user.

Give the agent only `DONERELAY_URL` and a locally configured `DONERELAY_API_TOKEN`. The bundled client accepts HTTPS or loopback HTTP, rejects redirects, and requires an API token of at least 32 characters. A remote hosted agent cannot reach a laptop's loopback address. Never expose an unauthenticated bridge or put tokens in a URL, prompt, issue, or commit.

Check a harmless question first. A valid result is an `answered` request with your reply; that is not an approval. For an approval, verify both the request ID and exact operation. Timeout, delivery failure, or a missing response does not grant permission.

Telegram and experimental WeChat share request state. Live account validation and installed host compatibility remain release gates for this source preview. A skill cannot intercept all native permissions, attach to an unrelated terminal, guarantee Codex Cloud compatibility, or keep a dead process running.

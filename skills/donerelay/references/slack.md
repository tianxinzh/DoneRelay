# Slack notifications through the host's existing MCP connection

Use this path when the user requests Slack updates to themselves. **It does not require Telegram setup, a local service, or Slack credentials in DoneRelay.** The running Codex/Claude host owns and invokes its already connected Slack tools. A bundled Node process cannot inherit another process's MCP session or OAuth grant.

## Discover and verify

1. Inspect the host's available connected Slack tools and their actual input/output schemas. Reuse that connection; do not read its config/secrets, extract OAuth tokens, launch another server or add a duplicate connection. Names vary by connector; do not assume a particular tool name.
2. Use the same connection to resolve its authenticated **human** user ID and workspace ID. An explicit “current user” capability or trusted connection identity is required. A bot identity, guessed email/name, arbitrary user profile, or user-supplied “this is me” ID is not enough.
3. Resolve that user's existing **self-DM**, using conversation listing/metadata and complete membership (follow pagination). It must be an IM with a `D…` ID in the same workspace; its only human/member ID must be the authenticated user's ID. A DM with a teammate or bot, a group DM or a channel does not meet this route's contract. Reverify the destination when switching connections/workspaces.
4. If several connections/workspaces are available and the request does not select one, ask the user to choose. If identity, self-DM lookup or write capability is unavailable, report that missing capability. Do not guess a recipient, fall back to a channel, install another connection, or request tokens. The user may need to open their self-DM in Slack or enable their host's Slack write tools. A connector advertising “send messages” alone is insufficient.

Use connector-supported self-conversation lookup; do not assume `conversations.open(users=[current_user])` works. Slack's generic API says to omit the calling user's ID and documents `not_enough_users`. An existing verified self-DM avoids that ambiguity. If the connector cannot expose/resolve it, stop this send and explain the limitation.

## Prepare, send once, then confirm

Slack currently supports **notifications only**. Do not represent a Slack message, reaction or reply as an approval, or promise Slack question/resumption handling. For questions/approvals explain the supported Telegram route; switch only if the user requests it.

Compose the task and message in the user's chosen language, or choose one language from conversation context. Do not start Telegram just to retrieve a language preference. Normalize only fields actually returned by the existing connection into a private temporary JSON file outside the project:

```json
{
  "kind": "notification",
  "task": "Tests completed",
  "message": "The requested checks passed.",
  "language": "en",
  "recipient": "self",
  "connectionId": "EXACT_EXISTING_HOST_CONNECTION",
  "identity": {"workspaceId": "T123", "userId": "U123", "isBot": false},
  "conversation": {
    "workspaceId": "T123", "channelId": "D123",
    "isIm": true, "isMpim": false,
    "members": ["U123"], "membersComplete": true
  }
}
```

IDs above are examples, never destinations to copy. `membersComplete` is true only after reading the complete membership. Workspace/connection identity may come from trusted host connection metadata if omitted by a provider response; do not infer it from a display name or message body.

Run the installed helper:

```sh
node /absolute/path/to/donerelay/scripts/relay.mjs slack prepare < /private/temp/input.json
```

This returns `prepared`, **not sent**, with the exact DM, formatted text and disabled mention/unfurl settings. Invoke the existing host Slack send tool exactly once, mapping these fields to its supported schema. Prefer plain text; preserve entity escaping. Disable mention expansion and link/media unfurls where the tool supports those options. If supported, pass the generated client-message ID as the connector's idempotency key; do not invent unsupported parameters. Keep native tool permissions in force.

The helper does not send or know which MCP tools ran. After the send returns, normalize the actual provider result into `{prepared, receipt}` and run `slack receipt`:

```json
{
  "prepared": "REPLACE_WITH_THE_COMPLETE_PREPARED_OBJECT",
  "receipt": {
    "connectionId": "EXACT_EXISTING_HOST_CONNECTION",
    "workspaceId": "T123",
    "ok": true,
    "channelId": "D123",
    "ts": "1789370000.000001"
  }
}
```

Only a successful result for the same connection/workspace/DM with a real message timestamp may be recorded as `sent`. A draft, preview, tool approval request or queued action is not a receipt. The evidence is explicitly **host-reported MCP output**, not an independent service attestation. Never synthesize a successful result. `ok:false` is used only for an explicit provider rejection. On timeout, malformed result or uncertain delivery, report unconfirmed and inspect the self-DM before any retry; no blind resend or exactly-once guarantee. Delete temporary payload/receipt files when finished.

A sent message proves provider acceptance, not a mobile push alert. Verify phone notification behavior in the user's actual Slack client. No Slack background polling, reply ingestion, or native Codex adapter forwarding is installed by this path. The host must still be running to send.

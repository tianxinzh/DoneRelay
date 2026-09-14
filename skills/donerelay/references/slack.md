# Slack messages and decisions through the host's existing MCP connection

Use this path when the user requests Slack updates to themselves. **It does not require Telegram setup, a local service, or Slack credentials in DoneRelay.** The running Codex/Claude host owns and invokes its already connected Slack tools. A bundled Node process cannot inherit another process's MCP session or OAuth grant.

## Discover and verify

1. Inspect the host's available connected Slack tools and their actual input/output schemas. Reuse that connection; do not read its config/secrets, extract OAuth tokens, launch another server or add a duplicate connection. Names vary by connector; do not assume a particular tool name.
2. Use the same connection to resolve its authenticated **human** user ID and workspace ID. An explicit “current user” capability or trusted connection identity is required. A bot identity, guessed email/name, arbitrary user profile, or user-supplied “this is me” ID is not enough.
3. Resolve that user's existing **self-DM**, using conversation listing/metadata and complete membership (follow pagination). It must be an IM with a `D…` ID in the same workspace; its only human/member ID must be the authenticated user's ID. A DM with a teammate or bot, a group DM or a channel does not meet this route's contract. Reverify the destination when switching connections/workspaces.
4. If several connections/workspaces are available and the request does not select one, ask the user to choose. If identity, self-DM lookup or write capability is unavailable, report that missing capability. Do not guess a recipient, fall back to a channel, install another connection, or request tokens. The user may need to open their self-DM in Slack or enable their host's Slack write tools. A connector advertising “send messages” alone is insufficient.

Use connector-supported self-conversation lookup; do not assume `conversations.open(users=[current_user])` works. Slack's generic API says to omit the calling user's ID and documents `not_enough_users`. An existing verified self-DM avoids that ambiguity. If the connector cannot expose/resolve it, stop this send and explain the limitation.

## Prepare, send once, then confirm

For notifications, use this stateless preparation/receipt flow. For questions and approvals, use the session-bound thread flow below.

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

A sent message proves provider acceptance, not a mobile push alert. Verify phone notification behavior in the user's actual Slack client. No Slack background polling or native Codex adapter forwarding is installed. The host must remain running to send and read threads.

## Questions and explicit decisions in a thread

This route is available only when the same host connection can read **complete raw thread messages**, including the original message, authors, timestamps, edits and automation metadata. Search snippets and summaries are insufficient. Keep native permissions in force. The helper does not intercept native Codex/Claude permission dialogs.

Use private JSON files as above for every command. All commands below read stdin JSON; replace placeholders with actual returned values. Never construct a successful receipt or reply yourself.

1. At the beginning of each running workflow, call `slack open` with `{"workflowId":"ACTUAL_HOST_THREAD_OR_WORKFLOW_ID","ttlSeconds":3600}`. Save its `sessionId` in this running workflow. On restart, open a fresh session with that same workflow ID; this cancels its old unconsumed decisions. Never recover/reuse an old session ID from disk or previous conversation history. Different workflows cannot share requests. Session leases are bounded to one day and do not renew automatically.
2. Call `slack create` with the identity/conversation fields from the notification example, plus `sessionId`, `kind` (`question` or `approval`), `capabilities:{"readThread":true,"rawMessages":true}`, and optional `ttlSeconds` (default 600, maximum 86400, bounded by session expiry). For approval, `message` must contain the **complete exact operation, target, environment and consequences**, within 2000 characters. Preserve the returned `id` and `binding` alongside that unchanged operation. The helper renders one language and thread instructions.
3. Send the returned `prepared` payload once through the existing host tool. Bind its actual receipt using `slack sent` with `{sessionId,id,receipt}`; receipt has the same shape as above. The request is pending only after this binding. On an ambiguous send, inspect the actual original message/receipt before binding; do not resend blindly. Cancel if delivery cannot be verified.
4. While this workflow remains running, read **all pages** of that exact DM thread through the same connection. Use a conservative interval of at least 60 seconds and honor any longer provider Retry-After. Keep the user informed while waiting. Slack's [thread API](https://docs.slack.dev/reference/methods/conversations.replies/) includes the parent and paginated replies. Never set `complete:true` until pagination is exhausted. Stop on errors or an exceeded limit; do not truncate to manufacture completeness. The helper accepts at most 500 messages / 256 KiB input.
5. Call `slack ingest` with the following envelope. Preserve every original raw message field, particularly `user`, `type`, `subtype`, `bot_id`, `app_id`, `bot_profile`, `edited`, `hidden`, attachments/files, `ts` and `thread_ts`. Do not strip provenance fields to make a reply acceptable.

```json
{
  "sessionId": "RETURNED_SESSION_ID",
  "id": "RETURNED_REQUEST_ID",
  "snapshot": {
    "connectionId": "EXACT_EXISTING_HOST_CONNECTION",
    "workspaceId": "T123",
    "channelId": "D123",
    "threadTs": "ACTUAL_PARENT_TIMESTAMP",
    "complete": true,
    "messages": ["COMPLETE_ORIGINAL_RAW_MESSAGE", "COMPLETE_RAW_REPLIES"]
  }
}
```

6. For a question, the first valid text reply from the bound user in the original thread becomes `answered`. For an approval, only exact `approve` / `deny` (or `批准` / `拒绝`), or a matching numbered command, counts. “Okay,” reactions, a top-level self-DM message, forwarded messages, edits, bot/app messages, another sender, and replies after expiry do not grant approval. A modified original cancels the request. The earliest valid decision wins; later replies cannot replace it.
7. `slack get` with `{sessionId,id}` inspects state. **Neither get nor ingest authorizes execution** (`mayExecute:false`). Immediately before continuing, call `slack take` with `{sessionId,id,binding}` using the binding saved with the unchanged operation. Only its first successful result with **both `status:"approved"` and `mayExecute:true`** permits that exact operation once, subject to the host's native gates. A question answer never grants execution permission. Denial, expiry, cancellation, failure or any helper error means no operation. Check the deadline again immediately before the operation; request fresh approval if elapsed. After an ambiguous crash following take, do not retry the operation or reuse the result.
8. Close in a finally/cleanup path using `slack close` with `{sessionId}`. `slack cancel` with `{sessionId,id}` cancels an individual unconsumed request. If the host dies without cleanup, the lease expires; no background process revives the workflow. Helpers exiting between polls is normal and does not reset the lease. The host must open a new session after restart; this is a cooperative lifecycle boundary, not independent process attestation.

Private `slack.json` records contain proposals, routing IDs, answers and consumption state, but no Slack credentials. Finished history is pruned on subsequent commands after seven days beyond expiry. `uninstall --purge` removes it after workflows are closed.

**Trust limit:** all evidence comes from the trusted host's actual MCP output. A user-authenticated tool can potentially post as that same user; a matching Slack user ID alone does not prove a physical human typed the reply. Never send, edit or fabricate a decision on the user's behalf. Reject available automation markers; if the connector hides provenance, this decision route is unsupported. These checks do not bypass native permissions or provide independent human attestation.

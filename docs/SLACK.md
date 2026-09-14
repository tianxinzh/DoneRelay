# Slack self-DM notifications, replies and decisions

DoneRelay can use the **Slack MCP connection already available in Codex or Claude Code** to send completion updates, receive thread answers and request explicit decisions to the connected user's own DM. Install the DoneRelay skill/plugin, then ask:

> Use DoneRelay to send the result of this task to my own Slack DM through my existing Slack connection.

No Telegram pairing, DoneRelay background service, Slack bot token or second MCP server is needed for this route. The host retains its connection and credentials and executes the Slack tools. DoneRelay does not scrape configuration or borrow tokens from another process.

## Required host capabilities

The selected connection must expose authenticated human/workspace identity, self-DM lookup and verification, and message sending. The skill resolves the exact self-DM from provider metadata and complete membership. A public/private channel, group DM, another person's DM or a bot conversation is rejected. If multiple workspaces are available, select one. Read-only or identity-ambiguous connectors need additional host capability before DoneRelay can use them; the tool does not create a replacement integration.

Connector tool names and schemas differ, so the skill maps the available host tools rather than hardcoding a single Slack server. [Slack's MCP overview](https://docs.slack.dev/ai/slack-mcp-server/) describes identity/profile, conversation and messaging capabilities and distinct read/write scopes. Being connected does not necessarily grant every capability.

The tool looks up an existing verified self-DM. It does not assume the generic conversation-open API can open a DM using only the caller's own ID; see [Slack's conversation API](https://docs.slack.dev/reference/methods/conversations.open/). If the connector cannot locate your self-DM, open it in Slack or resolve the missing host capability before retrying. No teammate or channel fallback occurs.

## What is supported

- Completion/outcome notifications to **your own DM**, in one chosen language.
- Question answers in the original message’s thread.
- Explicit `approve` / `deny` decisions, bound to one unchanged operation and consumed once.
- Existing host authentication and tool permissions.
- Bundled preparation and receipt validation without local Telegram setup.
- Explicit failed/unconfirmed results; no automatic retries after ambiguous sends.

For questions and decisions, the connection must also return complete raw thread history with authors, timestamps and edit/automation metadata. Reply in the original message’s thread: plain text answers a question; exact `approve` / `deny` (or `批准` / `拒绝`) decides an approval. Reactions, casual agreement, another sender and top-level DM messages do not count. The host must stay running and poll all pages; no Slack background reader or native Codex/Claude permission-dialog interception is installed. Native permissions remain in force. A self-DM send is not proof of a phone push notification; test your actual Slack client's notification behavior before depending on alerts.

## Implementation boundary

The helper's `slack prepare` validates normalized host identity/conversation metadata and produces the exact destination and message. It does not send. The agent invokes its connected Slack tool, then passes the actual normalized result to `slack receipt`. A successful receipt must match the connection, workspace and DM and contain a provider timestamp. The result is labeled `host_reported_mcp_receipt`, not an independent service attestation. Raw provider errors and OAuth credentials are not printed or stored by the helper. Questions and approvals use private local session/request records, with expiry and atomic single-use consumption. Notification preparation remains stateless. There is no exactly-once delivery guarantee; inspect ambiguous delivery before retrying.

Integrators may bind the exported `sendSlackSelf(input, connector)` callbacks to their own existing authenticated host tools. This interface does not establish a new connection. See the bundled [Slack workflow](../skills/donerelay/references/slack.md) for the normalized contract.

## Validation and current blocker

Automated tests use connector fixtures and exercise self-only routing, user/workspace identity, receipt matching, one-language rendering, no blind retry, full-thread validation, wrong-author/edited/bot replies, denial/expiry, workflow reopening, concurrent single-use consumption and copied-skill execution with no service setup. They do not establish live Slack delivery.

During this change, no Slack MCP tool was exposed in the active agent session, and neither local Codex nor Claude CLI listed a Slack connection. Actual host-to-self-DM delivery and mobile notification behavior therefore remain **unverified**. Connect/enable Slack through the intended host, run the prompt above, and confirm the message appears in your own DM. No Slack message was sent during fixture validation.

## Decision lifecycle and trust

The host opens a session for its actual running workflow, creates an immutable request, sends it once, binds the actual provider receipt, and ingests complete raw thread snapshots. A question becomes answered; an explicit decision becomes approved or denied. Get/ingest never grant execution. Immediately before the exact approved operation, the host calls `slack take` with the original binding. Only its first approved result with `mayExecute:true` permits continuation, subject to the request deadline and native host gates. Close on completion; open a fresh session after restart. Never reuse an old session or retry an uncertain operation after consumption. The helper cannot independently detect every host crash; leases bound abandoned records.

These are trusted-host checks, not independent human attestation. A user-authenticated tool may be able to post as the same Slack user. Never fabricate a reply; preserve all provider provenance, reject automation markers, and treat connectors that hide the required metadata as unsupported. See the exact [command sequence and JSON contract](../skills/donerelay/references/slack.md#questions-and-explicit-decisions-in-a-thread).

Live acceptance still requires: a completion notification, a question answered by the phone user in the same running workflow, an approved disposable operation, denial and timeout without execution, duplicate replies, a wrong sender, and restart handling. Record the actual host/connector versions, OS and release commit. Fixtures do not close this gate.

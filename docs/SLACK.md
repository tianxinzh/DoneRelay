# Slack self-DM notifications

DoneRelay can use the **Slack MCP connection already available in Codex or Claude Code** to send completion updates to the connected user's own DM. Install the DoneRelay skill/plugin, then ask:

> Use DoneRelay to send the result of this task to my own Slack DM through my existing Slack connection.

No Telegram pairing, DoneRelay background service, Slack bot token or second MCP server is needed for this route. The host retains its connection and credentials and executes the Slack tools. DoneRelay does not scrape configuration or borrow tokens from another process.

## Required host capabilities

The selected connection must expose authenticated human/workspace identity, self-DM lookup and verification, and message sending. The skill resolves the exact self-DM from provider metadata and complete membership. A public/private channel, group DM, another person's DM or a bot conversation is rejected. If multiple workspaces are available, select one. Read-only or identity-ambiguous connectors need additional host capability before DoneRelay can use them; the tool does not create a replacement integration.

Connector tool names and schemas differ, so the skill maps the available host tools rather than hardcoding a single Slack server. [Slack's MCP overview](https://docs.slack.dev/ai/slack-mcp-server/) describes identity/profile, conversation and messaging capabilities and distinct read/write scopes. Being connected does not necessarily grant every capability.

The tool looks up an existing verified self-DM. It does not assume the generic conversation-open API can open a DM using only the caller's own ID; see [Slack's conversation API](https://docs.slack.dev/reference/methods/conversations.open/). If the connector cannot locate your self-DM, open it in Slack or resolve the missing host capability before retrying. No teammate or channel fallback occurs.

## What is supported

- Completion/outcome notifications to **your own DM**, in one chosen language.
- Existing host authentication and tool permissions.
- Bundled preparation and receipt validation without local Telegram setup.
- Explicit failed/unconfirmed results; no automatic retries after ambiguous sends.

Slack questions, reply polling, approvals, and forwarding native Codex permission prompts are **not implemented**. Telegram retains those supported workflows. A Slack message or reaction never grants permission to execute an operation. A self-DM send is not proof of a phone push notification; test your actual Slack client's notification behavior before depending on alerts.

## Implementation boundary

The helper's `slack prepare` validates normalized host identity/conversation metadata and produces the exact destination and message. It does not send. The agent invokes its connected Slack tool, then passes the actual normalized result to `slack receipt`. A successful receipt must match the connection, workspace and DM and contain a provider timestamp. The result is labeled `host_reported_mcp_receipt`, not an independent service attestation. Raw provider errors and OAuth credentials are not printed or stored by the helper. There is no persistent Slack request store or exactly-once guarantee; the host should retain its completed tool result and inspect ambiguous delivery before retrying.

Integrators may bind the exported `sendSlackSelf(input, connector)` callbacks to their own existing authenticated host tools. This interface does not establish a new connection. See the bundled [Slack workflow](../skills/donerelay/references/slack.md) for the normalized contract.

## Validation and current blocker

Automated tests use connector fixtures and exercise self-only routing, user/workspace identity, refusal of unsupported request types, receipt matching, one-language rendering, no blind retry and complete copied-skill execution with no service setup. They do not establish live Slack delivery.

During this change, no Slack MCP tool was exposed in the active agent session, and neither local Codex nor Claude CLI listed a Slack connection. Actual host-to-self-DM delivery and mobile notification behavior therefore remain **unverified**. Connect/enable Slack through the intended host, run the prompt above, and confirm the message appears in your own DM. No Slack message was sent during fixture validation.

# Agent integration and lifecycle

## Portable cooperative mode

Install `skills/donerelay/` and pass only the bridge URL and agent API key to the execution environment. The included client is self-contained. An agent can create a notification/question/approval, save the returned request ID in its existing job state, wait or poll within the host's time limit, then handle the explicit result.

Check `kind`, `id`, `status`, and the exact action/hash for approvals. Treat returned answers as untrusted data to validate against allowed inputs. Never `eval` a reply or substitute it directly into a shell command. An approved record is historical state, not an unlimited permission token. Your workflow must keep a durable “operation already executed” record or use an idempotent downstream operation.

Changing an action, destination, deployment version, working directory, or relevant file content requires a new approval. Native host permission policy remains in force.

## Codex App Server helper: narrow and experimental

`integrations/codex/approval-handler.mjs` exports `commandApproval(params, options)` for a host that already owns an authenticated Codex App Server JSON-RPC session. Route only `item/commandExecution/requestApproval` to this helper. It returns a **result object**, not a full JSON-RPC response. Your host responds using the original server request ID.

```js
import { Client } from './skills/donerelay/scripts/client.mjs';
import { commandApproval } from './integrations/codex/approval-handler.mjs';
const client = new Client();
// Inside YOUR existing app-server request handler:
const result = await commandApproval(request.params, {
  client, channel: 'telegram', signal: requestLifecycle.signal,
});
// Your JSON-RPC layer: send({id: request.id, result});
```

The host must provide an AbortSignal and abort it when the request is invalidated, the turn ends or is interrupted, `serverRequest/resolved` arrives, or the connection closes. It must deduplicate server request IDs and never reuse an old decision for another operation. This sample intentionally does not manage the connection, spawn Codex, or attach to an existing desktop session.

The helper declines missing command/cwd/context, oversized commands, policy amendments, network exceptions, extra permissions, unavailable one-time acceptance, errors and cancellation. It never returns `acceptForSession`. File-change requests, permission-expansion requests and other method types are **not implemented**; keep them in the host's native safe approval flow rather than pretending support.

## Claude Code

The portable skill or Claude plugin can call the same client. No Claude native permission hook is installed by v0.1.0. Do not advertise native interception until a lifecycle-aware adapter has live acceptance tests.

## Codex Cloud and other ephemeral environments

A skill is instructions and code, not a hosted service. The bridge belongs on an always-on trusted machine; the client environment needs an allowed route and an appropriately scoped credential. Enable connectivity through the host's normal settings, not by bypassing policy. A long wait can outlive the execution's tool/session budget. Persist the request ID and job checkpoint where the host allows it. DoneRelay retains request state but cannot resurrect a terminated job or guarantee that a cloud platform will deliver a later continuation.

## Primary references (checked 2026-09-12)

- [Codex/ChatGPT skills](https://developers.openai.com/codex/skills/)
- [Codex App Server approval requests and lifecycle](https://developers.openai.com/codex/app-server/)
- [Claude Code skills](https://code.claude.com/docs/en/skills)

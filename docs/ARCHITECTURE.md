# Architecture and API

## Components

`src/server.mjs` exposes a small bearer-authenticated API. `src/relay.mjs` fans
requests out to explicitly configured channels and handles authenticated replies.
`src/store.mjs` maintains SQLite state. Channels poll the provider, normalize a
message, and enforce private-account binding before passing it to the relay.

The portable skill has a self-contained client script. Other integrations can use
the same API. `src/adapters/codex.mjs` owns a child App Server process and pairs
server-initiated request IDs with relay IDs in memory; ownership is never inferred
from a later message or restored automatically after a crash.

## Request lifecycle

`pending → approved | rejected | answered | expired | cancelled`

Only `approval` accepts approve/reject. Only `question` accepts an answer. Approval
payloads are immutable after creation and include task and optional thread/turn/item
context. Each result includes the same digest as its request. Replies after expiry
or a previous decision cannot replace it. A recorded approval/answer also becomes
unusable once its deadline passes or its owning request is cancelled.

Cross-channel decisions use one SQLite row and a guarded update. This prevents two
independent approval results, not duplicate execution by a faulty downstream agent.
Restart cancels pending/approved/answered rows; the harness must reconcile external
side effects before a fresh task. DB writes use WAL and FULL synchronous mode.
A lock file refuses concurrent instances and requires deliberate cleanup after a crash.

## API (v1)

Every route except `/healthz` requires `Authorization: Bearer <DONERELAY_API_TOKEN>`.
POST JSON requires `Content-Type: application/json`, at most 16 KiB. No CORS, browser
origin, dynamic recipient override, arbitrary callback URL, or approval HTTP route.

### Create a request

`POST /v1/requests`

```json
{
  "kind": "approval",
  "taskId": "build-123",
  "title": "Deploy staging",
  "action": "Deploy immutable build abc123 to staging only.",
  "ttlSeconds": 3600,
  "context": {"threadId": "thread-123", "turnId": "turn-456", "itemId": "item-789"}
}
```

For a question, use `kind: "question"`, replace `action` with `question`, and optionally
supply `choices: ["SQLite", "PostgreSQL"]` and `allowOther: false`. The server accepts
at most 100 pending requests. TTL is 1..86400 seconds; default one hour.

The response includes `id`, `nonce`, `digest`, `status`, `expiresAt`, and per-channel
`deliveries`. A sent status means the provider accepted the send, not that the human
read it. An API consumer must inspect deliveries; the bundled client cancels if no
channel confirmed delivery. No creation request is automatically replayed on timeout.

### Wait or cancel

`GET /v1/requests/:id` returns the current request and result. Polling does not execute
anything. The bundled client checks the digest, waits for a terminal state, and treats
connection failures as unsafe. `POST /v1/requests/:id/cancel` invalidates a result that
has not yet been forwarded. Cancellation cannot undo an operation already started.

### Notify

`POST /v1/notifications` with `{"taskId":"build-123","text":"Tests passed."}`.
Delivery reports are returned; notifications are not a durable outbox. Only explicit
Telegram 429 rejections get bounded send retries. Ambiguous network send failures
are not silently retried. Polling reconnects with bounded backoff.

## Codex mapping

| App Server request | DoneRelay handling |
|---|---|
| `item/commandExecution/requestApproval` | Exact command + context → one-time accept or decline |
| `item/fileChange/requestApproval` | Cached exact change item + context → accept or decline |
| `item/tool/requestUserInput` | Questions sent sequentially, exact option labels or permitted free text |
| `item/permissions/requestApproval` | Empty permission set; no expansion |
| `mcpServer/elicitation/request` | Decline |
| Other server requests | Error/interrupt; never automatic permission |

`serverRequest/resolved` cancels a still-pending relay request. A turn completion
sends the final text summary and closes the owned process. Native secret input is
interrupted locally. Ordinary prose is not heuristically turned into an approval.
The generic skill's cooperative gate is not interchangeable with this native mapping.

## Protocol references

Checked for implementation on 2026-09-12; provider interfaces can change.

- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Tencent Weixin plugin protocol](https://github.com/Tencent/openclaw-weixin/blob/main/docs/protocol.md)

Weixin client metadata mirrors protocol example version 2.4.8 while identifying the
agent as DoneRelay/0.1.0. This is compatibility metadata, not impersonation of official
maintenance or proof that the backend supports every documented optional field.

# HTTP API v0.1

The server defaults to `127.0.0.1:8787`. All API requests require `Authorization: Bearer TOKEN`; JSON bodies require `Content-Type: application/json`. Browser Origin requests are rejected. Remote clients must use HTTPS (or tunnel to loopback). There is no public unauthenticated callback endpoint.

## Agent endpoints

`POST /v1/requests` creates a request:

```json
{
  "kind": "approve",
  "channel": "telegram",
  "title": "Deploy staging?",
  "message": "Tests passed. Production is excluded.",
  "action": "Deploy build abc123 to staging",
  "ttlSeconds": 600,
  "idempotencyKey": "job-42-deploy-staging"
}
```

Kinds: `notify`, `ask`, `approve`. Channels: `telegram` (default), `wechat`. Limits: title 100, message 1,000, approval action 1,600, reply 2,000 UTF-16 code units. Approval action is required and cannot be used on other kinds. Plain text only; control/bidi/invisible formatting characters are rejected. Total HTTP body is limited to 16 KiB. TTL is 30–86,400 seconds (default 3,600). Unknown creation fields are rejected, including destination/actor overrides. At most 1,000 requests may remain pending.

Idempotency is scoped to this single-operator bridge: the same key and same normalized payload returns the same request, including after completion/expiry; changed content returns 409. Retention eventually removes old keys. Use one durable key per workflow step, never one global key.

`GET /v1/requests/ID` returns state and the original request. `POST /v1/requests/ID/cancel` cancels only a pending request; a resolved decision remains historical fact. API callers cannot resolve or edit approvals.

Example response shape:

```json
{
  "id": "0123456789abcdef01234567",
  "kind": "approve", "channel": "telegram",
  "title": "Deploy staging?", "message": "Tests passed.",
  "action": "Deploy build abc123 to staging", "actionHash": "SHA256_HEX",
  "status": "pending", "answer": null,
  "createdAt": 0, "expiresAt": 600000, "resolvedAt": null,
  "delivery": {"status": "queued", "attempts": 0, "lastError": null}
}
```

Timestamps are Unix milliseconds. Terminal states: approved/rejected for approvals, answered for questions, completed for notifications; expired/cancelled/failed for unsuccessful requests. An API success or delivery `sent` is **not** human approval. `completed` means provider acceptance, not read receipt.

## Private WeChat transport endpoints

These require **DONERELAY_WECHAT_TOKEN**, distinct from the agent key. The credential holder is trusted to attest sender identity; exposing it defeats the boundary.

- `POST /v1/wechat/claim` returns null or `{id, lease, target, text}`. The target is server-configured.
- `POST /v1/wechat/ack` with `{id, lease, ok}` acknowledges that delivery attempt only.
- `POST /v1/wechat/reply` with `{senderId, text}` accepts the exact bound sender and deterministic reply syntax. The host adapter must derive senderId from authenticated channel metadata, not a user-controlled payload.

Lease timeout: 60 seconds. At most five attempts; retry delay is bounded. A stale lease cannot acknowledge another worker's attempt. After ambiguous network/worker failures a message can be delivered twice. Single terminal decision is enforced in SQLite, but callers must handle side-effect idempotency separately.

`GET /healthz` is unauthenticated liveness only. It does not verify provider connectivity or a logged-in WeChat session.

Error statuses include 400 validation, 401 credential, 403 sender/channel/origin, 404 missing record, 409 invalid transition/idempotency, 413 body size, 415 content type, 429 pending-capacity, 503 unavailable channel. Unexpected errors are generic and do not log provider bodies or secrets.

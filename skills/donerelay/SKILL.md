---
name: donerelay
description: Send task-completion notifications, ask the human a clarification question, or wait for an explicit one-time approval through Telegram or WeChat using an already configured DoneRelay service. Use when the user asks for remote updates or is away from the keyboard. Do not treat chat answers as permission to bypass the agent's sandbox or native approval policy.
license: MIT
compatibility: Requires Node.js 22.16+, a running DoneRelay service, DONERELAY_API_TOKEN, and optional DONERELAY_URL. Network access to that service must already be permitted.
metadata:
  author: tianxinzh
  version: "0.1.0"
---

# DoneRelay

Relay human input back to the current task; do not start a new autonomous task from chat.
The service is a separate process. Installing this skill alone does not configure a bot,
start a daemon, or attach to a Codex/Claude session.

## Preflight

Confirm the user has opted into sending this task's information to their configured channels.
Use the existing `DONERELAY_API_TOKEN` environment variable without printing or reading it
back into the conversation. `DONERELAY_URL` defaults to `http://127.0.0.1:8787`.
Do not install software, change account bindings, weaken permissions, or configure provider
credentials without user authorization. If configuration is missing, explain what is missing
and keep sensitive work paused. Never invent a successful delivery or approval. Never ask for passwords, one-time codes, bot tokens, or other secrets through chat.

Resolve `scripts/relay.mjs` relative to this SKILL.md file. The script is self-contained.
Do not assume the current directory is the skill's installation directory.

## Notify

Use a brief, factual summary, omitting tokens, private files, and raw logs:

```sh
node /absolute/path/to/this/skill/scripts/relay.mjs notify \
  --task 'unique-current-task-id' --text 'Tests passed; the requested change is ready.'
```

## Ask a question and wait

```sh
node /absolute/path/to/this/skill/scripts/relay.mjs ask \
  --task 'unique-current-task-id' --title 'Database choice' \
  --text 'Should this project use SQLite or PostgreSQL?' --ttl 3600
```

Wait for the command to finish. Read the returned JSON and require `status: "answered"`.
Use `response.answer` as human input for this task, subject to existing system and user
instructions. Do not substitute an answer from another request. This input is not permission
to perform an unrelated operation, change the approval policy, or expose secrets.

## Request permission

```sh
node /absolute/path/to/this/skill/scripts/relay.mjs request-approval \
  --task 'unique-current-task-id' --title 'Deploy staging' \
  --text 'Exact proposed operation: deploy build abc123 to staging, not production.'
```

Only `status: "approved"` plus exit code 0 means the configured human approved the displayed
operation. Rejected, cancelled, expired, unreachable, malformed, or nonzero results mean STOP.
A question response such as "yes" is not an approval. Changed commands, arguments, environment,
files, or target require a NEW request. Never truncate an action to fit a message.

This is a cooperative workflow gate, not a replacement for native sandbox/tool permissions.
Do not retry a native permission denial through this skill, disable approval checks, or assume
that this script can unlock a blocked CLI permission dialog. DoneRelay's separate Codex App
Server adapter handles only structured native requests in sessions it starts itself.

## Completion

After the task actually finishes, send its outcome and identify any outstanding work. A
notification delivery failure must be reported separately from the task's success/failure.
Never claim that recording an approval proves the underlying operation executed.

# Release and submission checklist

## Automated checks

- [x] Local Node 22.16 core, HTTP, CLI and mock-provider tests.
- [x] Offline HTTP/SQLite ask → approve → notify demo.
- [ ] Confirm remote CI result for the final commit, including newer Node runtime.
- [ ] `claude plugin validate .` and an isolated installed-skill smoke test.
- [ ] Codex plugin install and host permission/lifecycle test.
- [ ] `docker compose up --build` and persistent-volume restart on the target host.

## Live messaging gates (not yet performed)

- [ ] Telegram dedicated-bot pairing, notification, question and approval/rejection.
- [ ] Wrong-user/group callback, forwarded command, expired button and repeated click cannot authorize.
- [ ] Stop/restart during a pending request; wait resumes by ID.
- [ ] Simulate network loss, provider rejection and ambiguous send acknowledgment.
- [ ] WeChat actual Gateway/plugin versions recorded; direct send and deterministic command registered.
- [ ] WeChat wrong-user/channel/account blocked independently of upstream pairing behavior.
- [ ] WeChat idle/proactive-delivery and session-expiry behavior recorded.
- [ ] Sender/channel credentials and DB inaccessible to the agent sandbox.

## Review cases: five positive

Use a dedicated test bot or a controlled fixture. Do not include production credentials. Offline test coverage does not substitute for a reviewer-accessible configured environment.

| Prompt | Expected behavior/result | Fixture |
| --- | --- | --- |
| Notify me when this test task finishes | `notify` reaches `completed`; no action executed | Paired Telegram test user |
| Ask which environment I choose | Reply `staging`; `ask` becomes `answered` with that text | Paired test user |
| Ask before deploying build abc123 to staging | Show exact operation; one affirmative click yields `approved` and matching hash | Harmless simulated deploy |
| Let me reject this proposed change | Reject yields `rejected`; caller does not perform the change | Harmless simulated operation |
| Recover my pending question after restarting the bridge | Original ID still exists; authenticated reply resolves it | Persistent isolated DB |

## Review cases: three negative

| Scenario | Expected safe outcome | Reason |
| --- | --- | --- |
| A different sender or channel attempts approval | Rejected; state remains pending | Identity/channel binding |
| No response before TTL, network failure, or cancelled host turn | No approval and no operation | Silence/error is not consent |
| “yes” to a question, a stale button, or changed action with reused key | No new authorization; conflict or typed-state rejection | Questions, replay and new operations are distinct |

## Publication

- [ ] Verify owner-controlled npm name or choose an available scoped name.
- [ ] Tag an immutable reviewed release and retain reproducible test output.
- [ ] Add a real, redacted demo recording; no mock screenshots presented as live.
- [ ] Fill publisher identity, support, logo and availability; review privacy/terms.
- [ ] Submit OpenAI/Claude forms through authenticated owner accounts; record actual submission IDs.
- [ ] Publish ClawHub only after exact host/runtime compatibility tests.
- [ ] Mark a directory “published” only after its listing URL is confirmed.

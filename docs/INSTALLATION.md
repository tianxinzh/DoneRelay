# Install DoneRelay in Codex or Claude Code

This guide installs the skill client. First configure the separate bridge using the [README](../README.md). Node.js 22+ is required on the host running the bundled client. Keep provider credentials on the bridge; the agent receives only `DONERELAY_URL` and a privately configured `DONERELAY_API_TOKEN`.

## Codex: Telegram task notifications

From the cloned repository root:

```sh
mkdir -p ~/.agents/skills
cp -R skills/donerelay ~/.agents/skills/
```

Reload the host as required by your installed version. Ask: “Use $donerelay to notify me when this harmless test task finishes.” For a question: “Use $donerelay to ask whether the test example should use SQLite; wait for my numbered answer.” A successful answer must be `answered`, not permission to run unrelated commands.

A repo-scoped installation can instead put the skill in that project's `.agents/skills/`. See the [official skills guide](https://developers.openai.com/codex/skills/). The included root `plugin.json` and `.agents/plugins/marketplace.json` are a separate local plugin packaging option described by [OpenAI](https://developers.openai.com/plugins/build/plugins), not a public directory listing.

## Claude Code: Telegram notifications and questions

In Claude Code:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

Then invoke `/donerelay:donerelay` with your explicit request. This is **DoneRelay's self-hosted catalog**. It is not `claude-plugins-official` or a confirmed community entry. See [Claude's marketplace instructions](https://code.claude.com/docs/en/plugin-marketplaces).

For local development, an installed Claude Code CLI can check the package:

```sh
claude plugin validate . --strict
```

A metadata pass does not test a Telegram account or native permissions. DoneRelay is not a native Claude Channels implementation. Existing [Claude Telegram Channels](https://code.claude.com/docs/en/channels) are a separate option for Claude-specific messaging.

## Clean-host smoke test

Use a harmless test project and a private bot. Verify that the skill can locate `scripts/relay.mjs` after installation, create one question, and read back your numbered answer. Try a deny and an expired approval before any consequential operation. Record host version and the exact DoneRelay commit. Do not count a mock-provider test as live messaging acceptance.

No `.env` or credential value belongs in this guide's examples. A cloud sandbox's localhost is not the bridge on your laptop. Remote deployment needs secure connectivity; do not disable sandboxing or authentication to make a smoke test pass.

## Common setup failures

| Symptom | Check |
| --- | --- |
| Skill visible, no message | Bridge running, host network access, configured token, per-channel delivery results |
| Telegram polling conflict | Another consumer or webhook using the same bot |
| Reply ignored | Exact request ID, response type, bound private chat/user, expiry |
| Request cancelled after restart | Expected behavior on main; create a new request if still needed |
| Cloud agent cannot connect | Network namespace and reachable secure endpoint; Cloud compatibility is not verified |
| WeChat cannot send after idle time | Conversation context/session may be invalid; do not infer success or approval |

See [FAQ](FAQ.md), [Weixin setup](WEIXIN.md), and [security](../SECURITY.md).

# Discovery, installation, and marketplace status

Reviewed 2026-09-12. A valid manifest is not proof of registry publication,
marketplace review, search indexing, or production compatibility.

| Destination | Prepared in this repo | Actual publication status |
|---|---|---|
| GitHub | English/Chinese README, LICENSE, searchable package/skill metadata, CI | Source publication is separate from third-party listings |
| skills.sh / skills CLI | `skills/donerelay/SKILL.md` plus a self-contained script | Compatible repository layout; leaderboard/index appearance not verified |
| Codex local skill | Standard skill folder plus `agents/openai.yaml` | Local install path documented; no official directory listing |
| Claude Code custom marketplace | `.claude-plugin/plugin.json` and `marketplace.json` | Self-hosted manifest included; CLI installation needs a live smoke test |
| OpenAI universal plugin directory / Codex Cloud | Source skills and a submission plan | Not packaged/submitted as an approved universal plugin; no cloud session takeover |
| Claude official directory | Description, license and source ready | Not submitted or accepted |
| npm | package metadata and local packing check | Not published; package-name availability not reserved |
| Additional community directories | Reusable project description below | Not submitted; verify each site's current requirements first |

## Immediately usable installation paths

After reviewing the repository, users can run:

```sh
npx skills add tianxinzh/DoneRelay
```

The skills.sh FAQ says listings are tracked through real installations via the
skills CLI. There is no promise that simply committing SKILL.md immediately indexes
a project. Do not manufacture installs or stars to manipulate a leaderboard.

Codex local authoring can use `~/.agents/skills/donerelay`, or ask `$skill-installer`
to install `skills/donerelay` from this repository. The runtime service remains separate.

For a Claude Code self-hosted marketplace:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-marketplace
```

This installs skill material, not Telegram/Weixin accounts or a running service.
A custom marketplace is not the official Anthropic marketplace. The skill cannot
replace Claude Code's native permission checks; no native Claude adapter ships yet.

## Official submission gates

Before applying, finish the live acceptance checklist, document supported versions,
record a real demonstration with secrets removed, provide a clear privacy/security
statement, and inspect the current official review form and packaging rules.
OpenAI's documentation now distinguishes locally authored skills from distributable
plugins in a directory shared by ChatGPT and Codex. A local skill folder alone is
not a completed directory submission or a way to take over cloud task sessions.

External submissions can require owner accounts, attestations, terms acceptance,
contact details and review. None were submitted or accepted during initial source
implementation. Do not mark them complete until there is a submission ID or live listing.

## Search and launch copy

Repository name: **DoneRelay** (keep the canonical GitHub casing).

Suggested About description:
> Self-hosted Telegram and WeChat notifications, questions, and one-time approvals for Codex and other AI agents.

Suggested GitHub topics (recommendations, not a claim they were applied):
`codex`, `agent-skills`, `telegram-bot`, `wechat`, `weixin`, `human-in-the-loop`,
`notifications`, `nodejs`, `self-hosted`, `claude-code`.

Use the same name in README, package metadata, skill, demo and community submissions.
Lead with the concrete away-from-keyboard use case and the compatibility table.
Explain experimental boundaries rather than adding unsupported keywords. `llms.txt`
is a navigation aid, not an AI-search ranking mechanism. No ranking or star guarantees.

## Primary references

- [Skills CLI FAQ](https://skills.sh/docs/faq)
- [Codex skill authoring and local installation](https://developers.openai.com/codex/skills/)
- [OpenAI plugins](https://developers.openai.com/codex/plugins/)
- [Claude custom marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude plugin discovery](https://code.claude.com/docs/en/discover-plugins)

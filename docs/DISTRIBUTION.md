# Distribution and discovery

Status checked 2026-09-12. These are installation assets and release steps, not claims of completed submission or approval.

## Agent Skills / Codex local installation

`skills/donerelay/SKILL.md` follows the portable name/description format and includes a standalone client. Copy that folder to `~/.agents/skills/` or the target project's `.agents/skills/`. A running bridge and separately configured environment are still required.

References:
- https://agentskills.io/specification
- https://developers.openai.com/codex/skills/

## skills.sh ecosystem

The documented CLI installs skills from GitHub repositories. After reviewing the source, users can try:

```sh
npx skills add tianxinzh/DoneRelay
```

The leaderboard is informed by installation telemetry; a GitHub commit is not a guarantee of a listing or ranking. This command installs a skill, not a running relay or native approval adapter. We have not submitted or confirmed a listing.

Reference: https://skills.sh/docs

## Claude Code self-hosted plugin catalog

The repository contains `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`. In Claude Code:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay-plugins
```

This distributes the skill from our own catalog. It does not mean Anthropic has accepted it into an official directory, and does not implement native Claude Code permission relay. Validate with the locally installed Claude Code CLI before release:

```sh
claude plugin validate .
```

References:
- https://code.claude.com/docs/en/plugin-marketplaces
- https://code.claude.com/docs/en/plugins-reference

## Official directories and hosted agents

Official OpenAI/Anthropic review and publication are separate workflows. Codex local skills, public plugin directories, and Codex Cloud are not interchangeable surfaces. Do not claim Cloud compatibility before confirming execution lifetime, network access, secrets handling, and the ability to return to the same pending task. We have not submitted to an official directory.

## Honest SEO / GEO release checklist

Use the brand `DoneRelay`, an informative title, a short statement of the actual use case, practical examples, and explicit compatibility/maturity labels. Suggested repository topics: `ai-agents`, `codex`, `agent-skills`, `telegram-bot`, `wechat`, `weixin`, `human-in-the-loop`, `notifications`, `nodejs`. These are suggestions, not metadata already applied by this commit.

Record an actual end-to-end demo only after live validation. Avoid fabricated screenshots, competitor claims, ranking promises, artificial install telemetry, mass promotional issues, or manufactured stars. Documentation examples are explicitly illustrative. Publish reproducible test results, troubleshooting answers, and a changelog that other people and search systems can reference.

npm publication, a release tag, a website, GitHub topics/description changes, a real demo, directory acceptance, and third-party submissions remain release tasks. Do not advertise `npx donerelay` as an available npm install until the package has actually been published and ownership verified.

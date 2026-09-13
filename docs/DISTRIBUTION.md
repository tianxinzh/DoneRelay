# DoneRelay distribution and discovery

Updated 2026-09-13. Source version `0.1.0-alpha.3`. No official submission, listing, npm publication, or Cloud compatibility is claimed.

## Install now from source

Follow [Codex and Claude Code installation](INSTALLATION.md). Both paths require a separately configured DoneRelay bridge; installing a skill does not start it.

- Codex local: copy `skills/donerelay` to `~/.agents/skills/` or the target project's `.agents/skills/`.
- Claude Code own catalog: `/plugin marketplace add tianxinzh/DoneRelay`, then `/plugin install donerelay@donerelay-plugins`.
- OpenAI local plugin assets: root `plugin.json` plus `.agents/plugins/marketplace.json`, subject to installed-host validation.

## Directory publication

[Marketplace research](MARKETPLACES.md) documents the current primary-source routes and limitations. [Submission packet](SUBMISSION.md) provides draft listing text, eight reviewer scenarios, and release gates. Do not substitute a pull request to deprecated `openai/skills` for the current plugin submission flow. Claude community submission does not request official curated placement.

## Other distribution

The third-party [skills.sh documentation](https://skills.sh/docs) describes GitHub-based skill installation. No skills.sh listing or install telemetry is claimed for DoneRelay. Do not manufacture installs or imply that such a directory is the official OpenAI/Anthropic marketplace.

No npm package has been published or verified here; do not advertise `npx donerelay` yet. Package metadata is a preparation asset, not a registry reservation.

## Discoverability

[SEO and GEO plan](SEO.md) records the positioning, intent map, suggested GitHub About/topics, and an evidence-led launch sequence. The root `llms.txt` is a factual navigation aid, not a search-ranking guarantee.

# Marketplace and directory distribution

Verified against primary documentation on **2026-09-12**. This file describes supported packaging and actual submission routes, not accepted listings. Repository commits do not automatically submit forms, verify publisher identity, or publish a package.

| Surface | What this repository provides | What remains |
| --- | --- | --- |
| Direct Agent Skill install | `skills/donerelay/SKILL.md` plus self-contained client | Real host installation check |
| skills.sh | `npx skills add tianxinzh/DoneRelay --skill donerelay` | Genuine user installs and directory indexing; no listing claim |
| Claude self-hosted marketplace | `.claude-plugin/marketplace.json` + plugin manifest | Run Claude validator and live install |
| Claude public directory | Public repo and submission copy | Owner login, submit, automated review and publication |
| Codex/ChatGPT repo marketplace | `.agents/plugins/marketplace.json` + portable `plugin.json` | Validate against the installed host and enable |
| OpenAI universal Plugins Directory | Skills-only package structure and 5+3 review cases | Verified identity, form, review, approved publish |
| OpenClaw / ClawHub | Experimental native WeChat package + portable skill | Live host validation, publisher login and explicit publication |
| npm | Local `npm pack` compatible core | Name ownership verification and owner-controlled publishing |

## Direct and Claude repository installs

```bash
npx skills add tianxinzh/DoneRelay --skill donerelay
```

Inside Claude Code:

```text
/plugin marketplace add tianxinzh/DoneRelay
/plugin install donerelay@donerelay
```

Before public submission, run `claude plugin validate .` and test the installed skill in a separate project. The `.claude-plugin` files describe **our own** catalog, not membership in Anthropic's directory. Follow the current [Claude submission guide](https://claude.com/docs/plugins/submit); it provides signed-in forms at [Claude Console](https://platform.claude.com/plugins/submit) and [Claude organization settings](https://claude.ai/admin-settings/directory/submissions/plugins/new). Public community admission and an Anthropic Verified badge are different states.

## Codex / ChatGPT

The portable root manifest uses `extensions.com.openai` and root `skills/`. The repository catalog points to `./` relative to the repository root, not `.agents/plugins/`. For host versions supporting CLI marketplace management:

```bash
codex plugin marketplace add tianxinzh/DoneRelay
```

Then enable/install the plugin through the host's plugin UI. If using the checkout as a local repo marketplace, merge (do not overwrite) the host setting:

```toml
[plugins."donerelay@donerelay"]
enabled = true
```

See the [official packaging guide](https://developers.openai.com/plugins/build/plugins) for current local-install behavior. This catalog is not an official global listing.

The current [OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission) accepts **Skills only**. The publisher needs verified identity and Apps Management write access. Submit the final tested bundle, required listing/policy/support assets, starter prompts, availability choices and at least five positive plus three negative test cases. Review and the developer's approved publish step precede directory availability. A localhost-only service is not a usable cloud integration without an authorized route; validate that environment instead of promising it works everywhere.

## skills.sh

According to its [FAQ](https://www.skills.sh/docs/faq), directory rankings are driven by actual skill installations reported through the installer, not by sending a marketplace PR. Keep the real install command visible; do not script installs, fabricate counts or buy stars. Package installation availability is distinct from directory indexing.

## OpenClaw / ClawHub

Follow [the official plugin build/publish guide](https://docs.openclaw.ai/plugins/building-plugins). Native package publication uses a signed-in `clawhub` publisher and supports `clawhub package publish ... --dry-run`. The WeChat integration is deliberately marked private/experimental until host acceptance tests pass. Do not publish it by merely removing the private flag without verifying SDK/runtime requirements. A portable skill and a native channel/command plugin are different artifacts.

## Submission copy

**Name:** DoneRelay

**Short description:** Keep AI agent decisions moving from your phone.

**Long description:** DoneRelay lets a configured coding agent send task notifications, ask a question, or request approval for one exact operation through a self-hosted bridge. Telegram supports private-chat replies and approval buttons. An experimental personal WeChat adapter uses Tencent's OpenClaw Weixin channel. Expiring requests, fixed recipients, separate transport credentials and durable decision records support unattended workflows without granting arbitrary remote shell access. A running bridge and user-owned messaging account are required. Native permissions and cloud execution lifetimes remain controlled by the host.

**Starter prompts:** “Ask me on Telegram before deploying the reviewed build.” “Notify me when the test run finishes.” “Ask which target I want and continue only after a valid answer.”

Before submitting: use an owner-approved publisher identity and support contact, add an original production-ready logo, complete real host/channel tests and reviewer setup, and review the privacy/terms text for the intended distribution. No form or attestation has been submitted by this implementation.

## Sources

- [OpenAI portable packaging and catalogs](https://developers.openai.com/plugins/build/plugins)
- [OpenAI submission requirements](https://developers.openai.com/plugins/deploy/submission)
- [Claude marketplace schema](https://code.claude.com/docs/en/plugin-marketplaces)
- [Claude directory submission](https://claude.com/docs/plugins/submit)
- [skills.sh listing FAQ](https://www.skills.sh/docs/faq)
- [OpenClaw publisher workflow](https://docs.openclaw.ai/plugins/building-plugins)

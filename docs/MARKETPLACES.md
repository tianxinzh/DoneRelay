# DoneRelay: Codex and Claude marketplace submission research

Checked **2026-09-12** against the primary sources linked below. Status: repository packaging prepared; **not submitted, approved, listed, or verified**. Review the current portals again before submitting.

## Routes are not interchangeable

| Destination | Actual route | DoneRelay status |
| --- | --- | --- |
| Local Codex skill | Copy `skills/donerelay` to a supported skills directory | Packaged; bridge setup remains separate |
| OpenAI local plugin | Root `plugin.json` and `.agents/plugins/marketplace.json` | Packaged; host validation pending |
| OpenAI public directory | Platform plugin submission, review, then publisher-initiated publication | Submission not started |
| Claude Code self-hosted catalog | Add `tianxinzh/DoneRelay`, install `donerelay@donerelay-plugins` | Catalog provided; clean-host validation pending |
| Claude community directory | Submit through Claude's plugin submission form | Not submitted |
| `claude-plugins-official` | Separate selection by Anthropic, not the community application form | Not listed; selection cannot be promised |

## OpenAI / Codex

The [OpenAI skills repository](https://github.com/openai/skills) now marks itself deprecated and directs authors to plugins. Do not make a pull request to the old curated-skills catalog the launch plan.

[OpenAI's submission guide](https://developers.openai.com/plugins/deploy/submission) describes a public directory shared by ChatGPT and Codex. The developer uses the Platform submission portal, supplies a skill bundle or remote MCP integration, completes review, and publishes after approval. It requires verified developer/business identity and Apps Management write access, listing materials, and five positive plus three negative test cases. [Draft materials](SUBMISSION.md) are prepared here; owner identity and attestations are not.

[Package documentation](https://developers.openai.com/plugins/build/plugins) describes root `plugin.json` using the portable Agent Plugins format, with OpenAI presentation fields under `extensions.com.openai`. DoneRelay includes that format and a local repo catalog. Neither file grants public-directory membership, configures credentials, nor enables Codex Cloud execution.

### Product fit is the unresolved gate

DoneRelay needs Node.js, a running bridge, secure per-user configuration, and a living caller. It is **not currently a zero-configuration hosted skills-only integration**. The [Claude-to-OpenAI migration guide](https://developers.openai.com/plugins/guides/submit-claude-plugin) requires clean-environment testing without undeclared dependencies; its credentials/persistent-settings guidance points to MCP, and inbound channel requirements need separate discussion.

Our recommendation: first validate the local skill/plugin experience. For a general hosted directory integration, evaluate an authenticated MCP wrapper with explicit request-creation and status tools. A remote MCP submission requires an appropriately authenticated public HTTPS service; a private laptop's loopback address is not sufficient. This is a recommended next design, **not an implemented MCP server**. Never expose the current local bridge unauthenticated or turn an arbitrary client-supplied reply into human authorization.

## Claude: community submission versus official selection

The current [Claude Code plugin guide](https://code.claude.com/docs/en/plugins#submit-your-plugin-to-the-public-marketplace) explicitly distinguishes `claude-community` from `claude-plugins-official`. Third-party submissions enter the community review process. Anthropic chooses the official catalog separately; the guide says there is no application process for that selection.

Submission entry points documented by Anthropic:

- [Claude Console plugin submission](https://platform.claude.com/plugins/submit).
- [Claude organization directory submission](https://claude.ai/admin-settings/directory/submissions/plugins/new), requiring relevant organization access.

The [general submission guide](https://claude.com/docs/plugins/submit) explains account access, a public GitHub repository, validation, and directory review. Use Console for an individual publisher with the required role. Passing validation is not an endorsement.

The [official repository README](https://github.com/anthropics/claude-plugins-official) uses broader language about submitting external plugins. Prefer the newer, explicit community-versus-official distinction in the developer guide rather than treating that README as a promise of official admission.

Before submission, run:

```sh
npm ci --ignore-scripts
npm test
npm run check:discovery
claude plugin validate . --strict
```

The last command requires an installed Claude Code CLI and was **not run** by the repository-only metadata checker. Follow the [manifest reference](https://code.claude.com/docs/en/plugins-reference) and [marketplace format](https://code.claude.com/docs/en/plugin-marketplaces). Keep the `donerelay` slug stable; update descriptions and display names instead of renaming an installed plugin for SEO.

## Position against existing options honestly

Claude already documents [Telegram Channels](https://code.claude.com/docs/en/channels), including two-way messaging in a running Claude Code session. DoneRelay should not claim to invent Telegram agent control. Its intended niche is an agent-neutral request API, explicit bounded decisions, a Node-based self-hosted bridge, and experimental WeChat. The current Claude integration is a skill, not native channel/permission interception.

## Publication order

Validate real Telegram setup and clean-host installation, record a real demonstration, then submit to the Claude community route. Resolve OpenAI hosted-runtime and credential handling before representing that experience as review-ready. Keep WeChat experimental until live idle-session tests pass. Use [submission materials](SUBMISSION.md) and retain evidence tied to the exact reviewed commit. Public availability must be checked after approval; do not advertise a directory install command before the entry exists.

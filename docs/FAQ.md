# DoneRelay FAQ: Telegram, Codex, Claude Code, and WeChat

## What is DoneRelay?

An MIT-licensed Node.js bridge and portable agent skill for completion notifications, bounded questions, and explicit operation approvals. Telegram is the primary transport; personal WeChat is experimental. This is an alpha source preview, not a verified production or official marketplace product.

## Can Codex notify me on Telegram?

The supplied skill client can request a notification from a separately configured DoneRelay bridge. The experimental native runner can report a task it starts itself. The bridge, agent process, bot configuration, and network connectivity must all be available. See [installation](INSTALLATION.md).

## Can I answer from my phone and let the task continue?

An integrated, still-running caller can read your numbered response and continue. It must distinguish an answer from approval and preserve native host permissions. Installing a skill does not give control of an unrelated terminal or revive a stopped process.

## Does it approve every Claude Code permission prompt?

No. The current Claude package provides a skill, not native permission interception or a Channels server. DoneRelay approval is an application-level signal for an unchanged proposal; host permissions still apply. Claude has its own [Channels feature](https://code.claude.com/docs/en/channels), which should be evaluated separately.

## Does it work in Codex Cloud?

Not verified. A reachable secure bridge, supported runtime, credential handling, and sufficient session lifetime are separate requirements. A public-directory listing would not by itself solve those constraints.

## Does WeChat mean WeCom?

No. Main includes an experimental personal Weixin text adapter using the published Tencent client protocol. Authorized account setup, conversation context, and idle-session behavior need live validation. No QR-login wizard is included. See [Weixin notes](WEIXIN.md).

## Does a plain “okay” authorize an action?

No. Use the exact request ID and expected command or bound approval button. A question answered with text is not an approval. Wrong-user, expired, cancelled, duplicate, and missing responses do not authorize a new operation.

## What if both channels receive my response?

They share the request record; the first valid decision wins. Approval does not make downstream actions exactly-once. Callers must avoid replaying an operation, particularly after a process restart.

## What data leaves my computer?

The requested notification/question/proposal and your reply pass through the selected messaging provider. The bridge stores request state locally. The agent receives the resulting request data. Do not send secrets or unnecessary sensitive content. See [privacy/data flow](../PRIVACY.md).

## Is it free, hosted, or available on npm?

The source is MIT-licensed and self-hosted. There is no project-hosted service or published npm release claimed here. You provide the runtime and accounts; third-party terms and costs are separate. Clone the repository rather than using an unverified package name.

## Is DoneRelay in the official Codex or Claude marketplace?

Not currently claimed. Install manifests and a self-hosted catalog are present. [Marketplace research](MARKETPLACES.md) explains OpenAI public submission, Claude community review, and separate Anthropic official curation. [Submission status](SUBMISSION.md) is explicit.

## Does llms.txt improve AI search rankings?

No ranking benefit is established for this project. The file is an optional factual documentation index. Google's [AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) says no special AI text files or schema are required for its AI search features.

# DoneRelay FAQ: Telegram, WhatsApp, Codex, Claude Code, and WeChat

## What is DoneRelay?

An MIT-licensed Node.js bridge and portable agent skill for completion notifications, bounded questions, and explicit operation approvals. It includes Telegram, experimental WhatsApp Cloud API, and experimental personal WeChat transports. This is an alpha source preview, not a verified production or official marketplace product.

## Can Codex notify me on Telegram or WhatsApp?

The supplied skill client can request a notification from a separately configured DoneRelay bridge. The experimental native runner can report a task it starts itself. The bridge, agent process, channel configuration, and network connectivity must all be available. WhatsApp also needs opt-in and an active reply window. See [installation](INSTALLATION.md) and [WhatsApp setup](WHATSAPP.md).

## Does WhatsApp require a business account or a personal QR login?

The sending side uses Meta's WhatsApp Business Platform Cloud API with an app, WhatsApp Business Account, and sending number. You receive and reply from your bound personal recipient. DoneRelay does not implement WhatsApp Web scraping or personal-account QR login. Provider account eligibility and production setup must be completed separately.

## Can WhatsApp reach me after a long period away?

Free-form messages require an active 24-hour customer-service window measured from the recipient's last message. Outside it, approved templates are required by Meta. This version has no template fallback and reports `whatsapp_window_closed`, rather than claiming delivery. A new inbound message reopens the window when consent is already active. Failed requests are not automatically resent; cancel a pending failed request and create a fresh one. Telegram can remain enabled alongside WhatsApp. See the policy references in [WhatsApp setup](WHATSAPP.md).

## Do I need a public webhook?

Telegram and Weixin use outbound polling. WhatsApp requires a public HTTPS callback routed only to the separate webhook listener on port 8788. The authenticated agent API stays on port 8787 and must not be exposed through that callback. SIGNED provider events are required; the setup verification token alone cannot authorize replies.

## What do START and STOP do?

From the bound WhatsApp recipient, START opts into that channel and STOP disables its sends and decisions. Other messages do not opt you back in after STOP. Telegram and Weixin are not disabled by a WhatsApp STOP. No chat acknowledgement is sent for every inbound message in this version; check the caller's stored result.

## Can I answer from my phone and let the task continue?

An integrated, still-running caller can read your direct Telegram reply or numbered response and continue. It must distinguish an answer from approval and preserve native host permissions. Installing a skill does not give control of an unrelated terminal or revive a stopped process.

## Does it approve every Claude Code permission prompt?

No. The current Claude package provides a skill, not native permission interception or a Channels server. DoneRelay approval is an application-level signal for an unchanged proposal; host permissions still apply. Claude has its own [Channels feature](https://code.claude.com/docs/en/channels), which should be evaluated separately.

## Does it work in Codex Cloud?

Not verified. A reachable secure bridge, supported runtime, credential handling, and sufficient session lifetime are separate requirements. A public-directory listing would not by itself solve those constraints.

## Does WeChat mean WeCom?

No. Main includes an experimental personal Weixin text adapter using the published Tencent client protocol. Authorized account setup, conversation context, and idle-session behavior need live validation. No QR-login wizard is included. See [Weixin notes](WEIXIN.md).

## Does a plain “okay” authorize an action?

No. Use the exact request ID and expected command or bound approval button. A question answered with text is not an approval. Wrong-user, expired, cancelled, duplicate, and missing responses do not authorize a new operation. WhatsApp delivery or read receipts do not authorize anything either.

## What if several channels receive my response?

Telegram, WhatsApp and Weixin share the request record; the first valid decision wins. Approval does not make downstream actions exactly-once. Callers must avoid replaying an operation, particularly after a process restart.

## What data leaves my computer?

The requested notification/question/proposal and your reply pass through the selected messaging provider. The bridge stores request state locally. The agent receives the resulting request data. Do not send secrets or unnecessary sensitive content. See [privacy/data flow](../PRIVACY.md).

## Is the README GIF a real account recording?

No. It illustrates a concrete checkout-fix and staging-deployment scenario. Its commit, test count and deployment outcome are fictional scenario details, not claims about a live integration. A [static version](assets/donerelay-checkout-demo-poster.png) is available for reduced motion.

## Is it free, hosted, or available on npm?

The source is MIT-licensed and self-hosted. There is no project-hosted service or published npm release claimed here. You provide the runtime and accounts; third-party terms and costs are separate. Clone the repository rather than using an unverified package name.

## Is DoneRelay in the official Codex or Claude marketplace?

Not currently claimed. Install manifests and a self-hosted catalog are present. [Marketplace research](MARKETPLACES.md) explains OpenAI public submission, Claude community review, and separate Anthropic official curation. [Submission status](SUBMISSION.md) is explicit.

## Does llms.txt improve AI search rankings?

No ranking benefit is established for this project. The file is an optional factual documentation index. Google's [AI search guidance](https://developers.google.com/search/docs/appearance/ai-features) says no special AI text files or schema are required for its AI search features.

## Can I use Telegram’s Reply action?

Yes. Reply to a question sent by alpha.5 or newer with plain text. Approval replies require an explicit approve/deny command or a button. Older messages, forwarded copies, and replies to acknowledgements do not provide a request binding. See [direct replies](../README.md#reply-directly-in-telegram).

# Developing the local bundle

The shipped source of truth is `skills/donerelay/scripts/runtime/`. `src/` keeps thin compatibility entry points for existing imports, examples and package binaries. Never create a second implementation or generate a client-only skill archive. The skill's nested `package.json` supplies ESM semantics when copied without the repository.

## Local architecture

The CLI/helper reads private local connection records, serializes lifecycle operations with `control.lock`, and starts a detached Node service. The service opens an ephemeral loopback port and stores its authenticated identity locally. Every lifecycle action verifies that identity; it does not signal a process based solely on a PID record. Service startup strips arbitrary agent credentials and `NODE_OPTIONS` from the child environment.

The service owns Telegram polling, JSON state, expiry and single-use resolution. Authenticated local stop atomically blocks new request creation and refuses existing pending decisions or active sends. Crashed service state locks can be recovered under the lifecycle lock only after verifying that the owner PID no longer exists. A stale lifecycle-control lock requires verifying the owner is stopped before removing that one file; ambiguous/live owners always block. PID reuse can require local investigation, not an automatic kill.

Per-user data defaults to `~/.config/donerelay/local/`. `DONERELAY_HOME` selects a different **local** directory for tests. `config.json` contains messaging configuration; `connection.json` holds the generated internal token and instance ID; `runtime.json` identifies the verified loopback service; `state.json` contains requests and channel metadata. Files are private but readable by the same user. No OS boot service, network listener outside loopback, or remote-host mode is installed by setup.

## Checks

```sh
npm ci --ignore-scripts
npm test
npm run check:discovery
npm run check:package
claude plugin validate . --strict
```

Lifecycle tests launch real detached processes with a fixture at the Telegram boundary. They cover singleton startup, copied skill execution, pending-stop refusal, crash cancellation, provenance and private-file handling. This is not live Telegram acceptance. Package checks install the tarball into a clean directory and check the copied skill without repository dependencies.

Use actual local Codex and Claude installations for acceptance. Record OS, Node/agent versions, commit, results and provider-vs-fixture boundaries. Keep tokens and account traces out of the repository. Test macOS and Windows separately before advertising them as verified.

## Low-level adapter development

`src/cli.js serve`, `src/server.js`, and `src/client.js` remain developer entry points for existing transport tests. The low-level client can be configured programmatically; the installed skill and normal CLI always use the bundled local lifecycle and ignore external connection environment variables. Low-level `doctor --bridge` checks explicit environment configuration. These are not the user installation flow.

The `.env.example` file documents developer-only transport variables. Docker files are optional isolated **development fixtures**, not a product deployment requirement. Normal users run setup and the skill on one computer.

Telegram setup is guided. WhatsApp and Weixin remain experimental adapter code; their account setup is not integrated into the wizard. Developers can test them through the low-level server. Keep their platform restrictions and unverified scope explicit; see [WhatsApp](WHATSAPP.md) and [Weixin](WEIXIN.md).

## Migration from alpha.5

Do not share a bot between the old standalone service and the local bundle. Finish or cancel old pending requests and stop the old process before pairing/importing that bot locally. The new bundle generates fresh local state and internal credentials; it does not silently import previous approvals or replay them. A controlled `setup --from-env` imports validated Telegram credentials and language only. Source archives and plugin metadata must all use the same version.

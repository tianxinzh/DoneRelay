# Contributing

Run Node.js 22.16+, then `npm run check`, `npm test`, and `npm run demo`.
No bot token or model account is required for the deterministic test suite.

Keep pull requests focused. Include regression tests for changes to authorization,
request lifecycle, provider parsing, or Codex protocol routing. Provider HTTP calls
are injectable so tests can remain offline. Do not submit live account credentials,
private message samples, login QR material, or databases.

Useful first contributions: authenticated live acceptance results (sanitized), QR
verification/redirect support with host validation, provider retry diagnostics,
additional harness adapters with exact approval semantics, and documentation fixes.

Do not claim an official marketplace listing or a successful integration without
recorded evidence. Avoid duplicate directory submissions, artificial installs, and
star exchanges. CI exercises Node 22/24; the initial local run used Node 22.16.

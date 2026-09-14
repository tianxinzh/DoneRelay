# Contributing

Use Node.js 22+ and run `npm ci --ignore-scripts`, `npm test`, and `npm pack --dry-run`. There are no runtime dependencies. Keep the local service single-instance and ship the full runtime inside the skill. Canonical implementation lives in skills/donerelay/scripts/runtime; src contains compatibility entry points. See [development](docs/DEVELOPMENT.md).

For channel or native-agent changes, add tests for a successful request, a wrong sender, a duplicate response, expiry, a network failure, and a lost session. Cite official protocol documentation and label live versus mocked results explicitly. Never add real credentials, traces with task contents, or machine-specific state.

Open focused pull requests. Do not loosen sender validation, authorize arbitrary chat commands, silently truncate approval proposals, grant broad session permissions, or treat tests as evidence of live marketplace acceptance.

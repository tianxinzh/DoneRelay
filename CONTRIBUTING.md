# Contributing

Use Node 22.16+ for core development. Run `npm test`, `npm run check`, and `npm run demo`. Core has no third-party runtime dependencies. Keep integration dependencies out of the portable skill's client.

Every new channel must preserve deterministic response parsing, verified sender metadata, fixed destinations, expiring single-operation decisions and separate credentials. Include wrong-user, wrong-channel, duplicate, late-reply and transport-failure tests. A fake SDK/HTTP fixture is not live integration proof; report both separately.

Good first contributions: a documented live Telegram test; WeChat host/version acceptance results; Windows CLI portability tests; improved accessible onboarding. Avoid broad “supports every agent” claims and unrelated features in the MVP.

Do not commit `.env`, session files, SQLite data, captured conversations, tokens or screenshot secrets. Redact logs in bug reports. Keep README English/Chinese feature-status claims aligned. See SECURITY.md for private vulnerability handling.

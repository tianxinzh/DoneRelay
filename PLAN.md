# DoneRelay implementation direction

Ship one local bundle alongside Codex or Claude Code. The canonical plan is [product direction](docs/PLAN.md); implementation details are in [development](docs/DEVELOPMENT.md) and evidence in [launch record](docs/LAUNCH.md).

The runtime lives inside the skill, uses the main JSON request store, and cancels pending requests on restart. Previous alternative SQLite/OpenClaw plans are superseded.

# Agent Burn for Windows

An unofficial Windows desktop port of [Agent Burn](https://github.com/Melvynx/agent-burn) by
[Melvynx](https://github.com/Melvynx). It is a fork: everything outside `desktop/` is his work,
kept in sync with upstream.

The app reads Claude Code, Codex, OpenCode and the other supported harnesses on native Windows
and inside WSL, and shows usage, cost and subscription quotas for each environment or for the
whole computer. It runs Melvynx's CLI from `rust/` as a sidecar and renders its JSON; the cost
calculation is his, unchanged. The only CLI addition is the Codex 5-hour window in the quota
reading.

- Windows app: [`desktop/`](../desktop/README.md) (Tauri v2, React, TypeScript)
- Original project, CLI and macOS app: [Agent Burn README](../apps/agent-burn/README.md),
  [agent-burn.melvynx.dev](https://agent-burn.melvynx.dev)

Status: in development, not signed, no release yet.

Licensed under MIT, like the original project ([LICENSE](../LICENSE)).

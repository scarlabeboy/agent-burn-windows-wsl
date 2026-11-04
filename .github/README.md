# Agent Burn for Windows

An unofficial Windows desktop port of [Agent Burn](https://github.com/Melvynx/agent-burn) by
[Melvynx](https://github.com/Melvynx). It is a fork: everything outside `desktop/` is his work,
kept in sync with upstream.

The app reads Claude Code, Codex, OpenCode and the other supported harnesses on native Windows
and inside WSL, and shows usage, cost and subscription quotas for each environment or for the
whole computer. It runs Melvynx's CLI from `rust/` as a sidecar and renders its JSON; the cost
calculation is his, unchanged. The CLI additions are small: the Codex 5-hour window in the
quota reading, each model's reference rates in the JSON summary, and a switch that stops it
from renewing the Claude Code sign-in.

- Windows app: [`desktop/`](../desktop/README.md) (Tauri v2, React, TypeScript)
- Original project, CLI and macOS app: [Agent Burn README](../apps/agent-burn/README.md),
  [agent-burn.melvynx.dev](https://agent-burn.melvynx.dev)

Status: in development. The installer is on the
[releases page](https://github.com/scarlabeboy/agent-burn-windows-wsl/releases), and the app
updates itself from it.

## Installing

The installer is not signed with a Windows code-signing certificate, so Windows SmartScreen
may show "Windows protected your PC". Click **More info**, then **Run anyway**. It installs
for your user only, without administrator rights. Updates are signed: the app checks the
signature before installing one, and never installs without your click.

## Privacy

Everything is computed on your computer. There is no account, no analytics and no telemetry,
and your prompts, conversations and file paths never leave the machine.

**What the app reads**, on Windows and inside your WSL distributions: the local usage logs of
the supported harnesses (Claude Code, Codex, OpenCode, Cursor…), and, for the subscription
quotas, the sign-in each harness already stored (for example `~/.claude/.credentials.json` or
`~/.codex/auth.json`). It never writes to those files, and never renews a sign-in.

**What it sends, and where**:

| Server | Why | What is sent |
| --- | --- | --- |
| `api.anthropic.com` | Claude Code quota | Your Claude Code access token |
| `chatgpt.com` | Codex quota | Your Codex access token |
| `api2.cursor.sh` | Cursor usage | Your Cursor access token, if Cursor is installed |
| `raw.githubusercontent.com`, `models.dev` | Current model prices | Nothing but the download request |
| `github.com` | Update check and download | Nothing but the download request |

Each token goes only to the service that issued it. Quotas can be turned off on their own in
the settings. **Offline mode** turns all of the above off, the automatic update check
included; prices then come from a copy embedded in each release.

**What it writes**: its settings and history in `%LOCALAPPDATA%\dev.scarlabeboy.agent-burn-windows`,
short-lived scan files in `%TEMP%\agent-burn-windows`, and, only if you turn on
"Start with Windows", an entry in your user's startup programs. In WSL it runs nothing that
changes your distributions; "Kept running" only keeps WSL awake while the app is open.

## Uninstalling

Uninstall "Agent Burn Windows" from Windows Settings > Apps. The uninstaller removes the
startup entry, and offers to delete the app data (settings and history) too. Your harnesses
and their sign-ins are left as they were.

Licensed under MIT, like the original project ([LICENSE](../LICENSE)).

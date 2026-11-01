# Agent Burn for Windows

Tauri v2 + React/TypeScript desktop app that reads Agent Burn usage for native Windows,
for WSL (optional), and for both combined (Computer). It runs the unmodified Agent Burn
CLI from `../rust` as a sidecar and renders its JSON; it never parses logs itself.

## Build the installer

```powershell
powershell -File scripts/prepare-cli.ps1   # builds the CLI and stages the sidecar
npm install
npx tauri build                            # NSIS installer in src-tauri/target/release/bundle/nsis
```

For development run `npx tauri dev` after `prepare-cli.ps1`.

## Notes

- WSL is optional. The settings only offer a WSL choice when a distribution exists. The
  modes are: **Désactivé** (WSL is never queried, Windows only, no WSL tab), **Automatique**
  (default: a distribution is read when it is already running and never woken up) and
  **Maintenu allumé** (the app runs `wsl.exe -d <distro> --exec sleep infinity` for each
  distribution while it runs, inside a Windows job so it ends with the app; it never runs
  `wsl --shutdown`).
- Distributions are listed with `wsl -l -q` and `wsl --list --running --quiet`, which do not
  start anything; only running ones are read, through `\\wsl.localhost\<distro>`. A stopped
  distribution keeps its last report and is marked as stopped. Every `wsl.exe` call has a
  5 s limit. OpenCode's SQLite database is copied to a temporary folder for each scan that
  reads OpenCode (WAL databases cannot be opened on that share), and removed afterwards.
- The archive (quota history, report cache, WSL user names) lives in
  `%LOCALAPPDATA%\dev.scarlabeboy.agent-burn-windows\archive`, apart from the install
  directory.
- Subscription quotas use the CLI's quota-only mode. Each tab shows the quotas of its own
  environment (Windows, WSL); the Computer tab keeps the freshest reading of each harness.
  Sign-ins (and the Claude plan) are read from the environment's own home directory: a
  Windows without a readable `~/.claude/.credentials.json` shows "quota non lu".
- Quota history is kept in the archive while the app runs; Codex history is also rebuilt
  from its session logs.
- Harnesses can be switched off in the settings: they are no longer scanned (`--agents`) and
  disappear from the totals, quotas and tray tooltip.
- Brand icons come from the Agent Burn macOS app (MIT).

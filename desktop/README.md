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

- WSL is optional. Without WSL, or with "Lire aussi WSL" unchecked, the app shows Windows
  only and never calls `wsl.exe`.
- WSL is never started by the app. Distributions are listed with `wsl -l -q` and
  `wsl --list --running --quiet`; only running ones are read, through
  `\wsl.localhost\<distro>`. A stopped distribution keeps its last report and is marked as
  stopped. OpenCode's SQLite database is copied locally first because WAL databases cannot
  be opened on that share.
- The archive (quota history, report cache, WSL user names) lives in
  `%LOCALAPPDATA%\dev.scarlabeboy.agent-burn-windows\archive`, apart from the install
  directory.
- Subscription quotas use the CLI's quota-only mode. Claude and Codex sign-ins are read
  from the source's own home directory, and identical readings from several sources are
  shown once.
- Quota history is recorded in the app's local storage while it is open.
- Brand icons come from the Agent Burn macOS app (MIT).

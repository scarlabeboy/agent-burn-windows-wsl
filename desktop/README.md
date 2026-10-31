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

- WSL sources are read through `\wsl.localhost\<distro>`. OpenCode's SQLite database is
  copied locally first because WAL databases cannot be opened on that share.
- Subscription quotas use the CLI's quota-only mode. Claude and Codex sign-ins are read
  from the source's own home directory, and identical readings from several sources are
  shown once.
- Quota history is recorded in the app's local storage while it is open.
- Brand icons come from the Agent Burn macOS app (MIT).

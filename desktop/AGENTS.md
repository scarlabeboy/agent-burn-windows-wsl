# AGENTS.md - Agent Burn Windows

Read `README.md` first for the build, release and runtime notes. This file adds agent rules
for changes under `desktop/`, the Windows desktop app of this fork. Everything outside
`desktop/` (and `.github/workflows/windows-release.yaml`) is Melvynx's upstream project: its
`AGENTS.md` files describe it, not this app.

## Layout

- `src/`: React + TypeScript UI. `App.tsx` holds the state, scans and settings; `views.tsx` the
  cards; `QuotaChart.tsx`, `UpdateDialog.tsx`, `StatusBar.tsx` their own parts. Pure logic lives
  in small modules (`quota.ts`, `aggregate.ts`, `periods.ts`, `releaseNotes.ts`…) with
  `*.test.ts` next to them.
- `src-tauri/`: Tauri v2 shell in Rust. `cli.rs` runs the bundled CLI, `sources.rs` lists WSL
  distributions, `archive.rs` stores history, `background.rs` the tray and autostart,
  `keepalive.rs` the "Maintenu allumé" WSL mode.
- The CLI is Melvynx's, built from `../rust` by `scripts/prepare-cli.ps1` and bundled as a
  sidecar. The app renders its JSON and never parses logs itself.

## Rules

- Never change the CLI's cost calculation. The only addition to the CLI is the Codex 5-hour
  window (`sessionWindow`); keep upstream files untouched otherwise, so upstream merges stay
  clean (disable upstream workflows through GitHub, never by editing them).
- WSL is never woken up: list distributions with `wsl -l -q` / `--list --running`, read only
  running ones, and call `%SystemRoot%\System32\wsl.exe`. Never run `wsl --shutdown`.
- The UI is in French. Code, comments and commit messages are in English.
- Use npm (not pnpm) in this folder.
- Tests must not touch the real profile: run them with `LOCALAPPDATA`, `TEMP` and `TMP` pointing
  at a scratch folder.
- The identifier `dev.scarlabeboy.agent-burn-windows` must not change: it locates the archive
  and the Windows startup entry.

## Validation

```powershell
npx tsc --noEmit
npm test                                    # node:test through esbuild
cargo test --manifest-path src-tauri/Cargo.toml
```

## Releases

Bump the version in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`,
write its section in `CHANGELOG.md` (French; `### Nouveautés`, `Améliorations`, `Corrections`,
`Retiré`), push, then run the "Windows release" workflow. It drafts the release; a person
reviews and publishes it. Never mark a release as a pre-release: the updater reads
`releases/latest`.

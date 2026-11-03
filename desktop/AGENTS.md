# AGENTS.md - Agent Burn Windows

Read `README.md` first for the build, release and runtime notes. This file adds agent rules
for changes under `desktop/`, the Windows desktop app of this fork. Everything outside
`desktop/` (and `.github/workflows/windows-release.yaml`) is Melvynx's upstream project: its
`AGENTS.md` files describe it, not this app.

## Layout

- `src/`: React + TypeScript UI. `App.tsx` holds the state, scans and settings; `views.tsx` the
  cards; `QuotaChart.tsx`, `UpdateDialog.tsx`, `StatusBar.tsx` their own parts. Pure logic lives
  in small modules (`quota.ts`, `aggregate.ts`, `periods.ts`, `dailyArchive.ts`,
  `releaseNotes.ts`…) with `*.test.ts` next to them. `i18n/` holds the French and English texts.
- `src-tauri/`: Tauri v2 shell in Rust. `cli.rs` runs the bundled CLI, `sources.rs` lists WSL
  distributions, `archive.rs` stores history, `backfill.rs` rebuilds Codex quota history from
  its session logs, `background.rs` the tray and autostart, `keepalive.rs` the "Kept running"
  WSL mode, `job.rs` the Windows job that ends every process the app starts with it.
- The CLI is Melvynx's, built from `../rust` by `scripts/prepare-cli.ps1` and bundled as a
  sidecar. The app renders its JSON and never parses logs itself.

## Rules

- Never change the CLI's cost calculation. The only addition to the CLI is the Codex 5-hour
  window (`sessionWindow`); keep upstream files untouched otherwise, so upstream merges stay
  clean (disable upstream workflows through GitHub, never by editing them).
- WSL is never woken up: list distributions with `wsl -l -q` / `--list --running`, read only
  running ones, and call `%SystemRoot%\System32\wsl.exe`. Never run `wsl --shutdown`.
- The UI is in French and English. Every text goes in `src/i18n/fr.ts` and `src/i18n/en.ts`
  (the English one is typed on the French one, so a missing text breaks the build), read with
  `t()`; numbers and dates use `locale()`. Code, comments and commit messages are in English.
- Use npm (not pnpm) in this folder.
- A change that adds or removes a limitation updates "Known limitations" in `README.md`.
- Info messages stay short: one or two sentences, no file paths or long explanations.
- Tests must not touch the real profile: run them with `LOCALAPPDATA`, `TEMP` and `TMP` pointing
  at a scratch folder. That is not enough for the app itself: WebView2 (and with it the
  settings in `localStorage`) finds its folder through Windows, not `LOCALAPPDATA`. Build the
  app to try with `npx tauri build --debug --no-bundle --config src-tauri/tauri.test.json`
  (its own identifier, so it also runs next to the installed app) and also set
  `WEBVIEW2_USER_DATA_FOLDER` to the scratch folder. Leave the startup switch alone in that
  build: the startup entry name is shared with the installed app.
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
write its section in `CHANGELOG.md` in both languages: an `#### English` block (`### New`,
`Improvements`, `Fixes`, `Removed`) then an `#### Français` block (`### Nouveautés`,
`Améliorations`, `Corrections`, `Retiré`); the app shows only the block of its language.
Push, then run the "Windows release" workflow. It drafts the release; a person reviews and
publishes it. Never mark a release as a pre-release: the updater reads
`releases/latest`.

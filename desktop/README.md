# Agent Burn for Windows

Tauri v2 + React/TypeScript desktop app that reads Agent Burn usage for native Windows,
for WSL (optional), and for both combined (Computer). It runs the Agent Burn CLI from
`../rust` as a sidecar and renders its JSON; usage and costs always come from it. The only
logs the app reads itself are Codex's session logs, for the quota history (`backfill.rs`).
The CLI is Melvynx's
code with three small additions: the Codex 5-hour window (`sessionWindow`) in the quota
reading, each model's reference rates (`pricing`) in `summary --json`, and
`AGENT_BURN_NO_RENEW`, which stops it from renewing the Claude sign-in. Cost calculation is
untouched.

## Build the installer

```powershell
powershell -File scripts/prepare-cli.ps1   # builds the CLI and stages the sidecar
npm install
npx tauri build                            # NSIS installer in src-tauri/target/release/bundle/nsis
```

For development run `npx tauri dev` after `prepare-cli.ps1`.

## Releases and updates

The app updates itself from the GitHub releases of this repository: it reads
`releases/latest/download/latest.json` at startup and every 6 hours (never in offline mode), and
only installs a file signed with the release key, whose public half is in `tauri.conf.json`.

To release: set the version (`tauri.conf.json`, `Cargo.toml`, `package.json`), write its section
in `CHANGELOG.md`, push, then run **Actions > Windows release > Run workflow**. The workflow
(`.github/workflows/windows-release.yaml`) builds on a GitHub Windows runner with the key and its
password from the repository secrets `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, runs the tests, and drafts the `v<version>` release with
the installer, its `.sig` and `latest.json`. Publishing the draft makes it the update.

The same release can be built locally:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\agent-burn-windows.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password>"
npx tauri build                              # installer and its .sig
& .\scripts\prepare-release.ps1             # release/v<version>: installer, .sig, latest.json, notes.md
```

The notes come from the version's section of `CHANGELOG.md`, written before the build. The
installer, its `.sig` and `latest.json` are the assets of the `v<version>` release, and
`notes.md` is its description. Releases are
not marked as pre-releases: `releases/latest` skips those, and the 0.x version already says the
app is not 1.0 yet.

## Notes

- WSL is optional. The settings only show a WSL card when a distribution exists. Its
  **WSL reading** switch turned off means Windows only: WSL is never queried and the side
  bar has no environment choice.
  While it is on, the **Reading mode** is **Automatic** (default: a distribution is read when
  it is already running and never woken up) or **Kept running** (the app runs
  `wsl.exe -d <distro> --exec sleep infinity` for each distribution while it runs; it never
  runs `wsl --shutdown`). The mode is kept while reading is off.
- Every process the app starts (each CLI run, the processes keeping WSL awake) lives in a
  Windows job that ends them with the app, so a CLI run still going never keeps
  `agent-burn.exe` locked when an update replaces it.
- Distributions are listed with `wsl -l -q` and `wsl --list --running --quiet`, which do not
  start anything; only running ones are read, through `\\wsl.localhost\<distro>`. A stopped
  distribution keeps its last report and is marked as stopped. Every `wsl.exe` call has a
  5 s limit. OpenCode's SQLite database is copied to a temporary folder for each scan that
  reads OpenCode (WAL databases cannot be opened on that share), and removed afterwards.
- The archive (quota history, report cache, daily totals, WSL user names) lives in
  `%LOCALAPPDATA%\dev.scarlabeboy.agent-burn-windows\archive`, apart from the install
  directory. The daily totals keep each day an online scan reported, so days whose logs a
  harness has since deleted still count. A file that cannot be read is left as it is and
  never written over; one that is not valid JSON is set aside as `<name>.broken-<time>`.
- Subscription quotas use the CLI's quota-only mode. Each tab shows the quotas of its own
  environment (Windows, WSL); the Computer view keeps the freshest reading of each harness.
  The environment is chosen in the sidebar, above the pages.
  Sign-ins (and the Claude plan) are read from the environment's own home directory: a
  Windows without a readable `~/.claude/.credentials.json` shows "quota not read".
- The app runs every CLI command with `AGENT_BURN_NO_RENEW=1`: the CLI never renews the
  Claude sign-in and never writes `~/.claude/.credentials.json`, so it cannot lose a rotated
  token. An expired sign-in is not sent; the Claude quota comes back once Claude Code has
  renewed it. The app itself only reads the plan from that file.
- Quota history is kept in the archive while the app runs; Codex history is also rebuilt
  from its session logs.
- Harnesses can be switched off in the settings: they are no longer scanned (`--agents`) and
  disappear from the totals, quotas and tray tooltip, cached reports included.
- Other settings: **Offline mode** (no network call: quotas and updates paused, costs from the
  CLI's built-in prices), **Quotas** (read online every minute, or not at all), **Language**
  (French or English; Windows' language until one is chosen) and **Restart after an
  unexpected stop** (Windows reopens the app in the notification area, with `--background`,
  after a crash, an update or an installer that closed it).
- Brand icons come from the Agent Burn macOS app (MIT).
- Some ideas come from [David's Windows fork](https://github.com/DavidSZD/agent-burn) of
  Agent Burn.

## Known limitations

Keep this list up to date when a change adds or removes one.

- Costs are API-equivalent values from the CLI's price table, not a bill.
- The same harness used with a subscription and with an API key cannot be told apart: the
  subscription value then also counts the sessions paid through the API.
- Quotas are read for Claude Code and Codex only. Cursor's usage and other harness
  subscriptions (OpenCode Go…) are not shown, even though the CLI reads Cursor's.
- "Since the reset day" counts the whole day of the reset, and applies only to subscriptions
  whose quota is read.
- Claude quota history only covers the time the app runs; Codex history is also rebuilt from
  its session logs.
- Per-model quotas and extra credits only show when the account's API returns them.
- The daily archive only keeps days an online scan saw: logs deleted before that are lost.
- A stopped WSL distribution keeps its last report; one never read has no data. An online WSL
  scan takes about 30 s.
- The remembered WSL user name of a distribution is never checked again.
- The installer is not code-signed, so Windows SmartScreen or an antivirus may warn about it.
  Updates are still checked against the release key.

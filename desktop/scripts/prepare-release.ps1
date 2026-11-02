# Gathers a built release in release/v<version>: the installer under a name without spaces, its
# updater signature, and latest.json, the file the installed apps read to find a new version.
# Build first with the signing key set, for example:
#   $env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\agent-burn-windows.key"
#   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<password>"
#   npx tauri build
# The notes are the version's section of CHANGELOG.md; they also go to notes.md for the release.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$repo = "scarlabeboy/agent-burn-windows-wsl"
$version = (Get-Content "$root/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version

# Read as UTF-8 explicitly: Windows PowerShell would otherwise read the accents as ANSI.
$changelog = [IO.File]::ReadAllText("$root/CHANGELOG.md", [Text.Encoding]::UTF8) -replace "`r", ""
$section = [regex]::Match($changelog, "(?ms)^## $([regex]::Escape($version))\s*$\n(.*?)(?=^## |\z)")
if (-not $section.Success) { throw "CHANGELOG.md has no section for $version." }
$Notes = $section.Groups[1].Value.Trim()

$bundle = "$root/src-tauri/target/release/bundle/nsis"
$built = Get-Item "$bundle/*_${version}_x64-setup.exe"
$signature = Get-Item "$($built.FullName).sig"
if ($signature.LastWriteTime -lt $built.LastWriteTime) { throw "The signature is older than the installer: build again." }

$out = "$root/release/v$version"
New-Item -ItemType Directory -Force $out | Out-Null
$name = "Agent-Burn-Windows_${version}_x64-setup.exe"
Copy-Item $built.FullName "$out/$name" -Force
Copy-Item $signature.FullName "$out/$name.sig" -Force

$latest = [ordered]@{
  version  = $version
  notes    = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = (Get-Content $signature.FullName -Raw).Trim()
      url       = "https://github.com/$repo/releases/download/v$version/$name"
    }
  }
}
# UTF-8 without a byte order mark: the updater parses the file as plain JSON.
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText("$out/latest.json", ($latest | ConvertTo-Json -Depth 4), $utf8)
[IO.File]::WriteAllText("$out/notes.md", $Notes, $utf8)
Get-ChildItem $out | Select-Object Name, Length

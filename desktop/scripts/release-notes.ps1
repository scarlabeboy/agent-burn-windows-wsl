# Prints the notes of the app's current version: its section of CHANGELOG.md, without the title.
# Used by prepare-release.ps1 and by the release workflow.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content "$root/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version

# Read as UTF-8 explicitly: Windows PowerShell would otherwise read the accents as ANSI.
$changelog = [IO.File]::ReadAllText("$root/CHANGELOG.md", [Text.Encoding]::UTF8) -replace "`r", ""
$section = [regex]::Match($changelog, "(?ms)^## $([regex]::Escape($version))\s*$\n(.*?)(?=^## |\z)")
if (-not $section.Success) { throw "CHANGELOG.md has no section for $version." }
# Every released version, hidden on GitHub: the app counts the updates a person skipped. It comes
# first, before "#### English": apps up to 0.5.8 skip any line before a language block, and would
# show it as a note anywhere else.
$versions = [regex]::Matches($changelog, "(?m)^## (\d+\.\d+\.\d+)\s*$") | ForEach-Object { $_.Groups[1].Value }
"<!-- releases: $($versions -join ' ') -->"
""
$section.Groups[1].Value.Trim()

# Prints the notes of the app's current version: its section of CHANGELOG.md, without the title.
# Used by prepare-release.ps1 and by the release workflow.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content "$root/src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version

# Read as UTF-8 explicitly: Windows PowerShell would otherwise read the accents as ANSI.
$changelog = [IO.File]::ReadAllText("$root/CHANGELOG.md", [Text.Encoding]::UTF8) -replace "`r", ""
$section = [regex]::Match($changelog, "(?ms)^## $([regex]::Escape($version))\s*$\n(.*?)(?=^## |\z)")
if (-not $section.Success) { throw "CHANGELOG.md has no section for $version." }
$section.Groups[1].Value.Trim()

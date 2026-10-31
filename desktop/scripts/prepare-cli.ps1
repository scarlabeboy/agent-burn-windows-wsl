# Builds the Agent Burn CLI in release mode and stages it as the Tauri sidecar.
# Run from anywhere: powershell -File desktop/scripts/prepare-cli.ps1
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location (Join-Path $root "rust")
try { cargo build --release -p agent-burn --bin agent-burn } finally { Pop-Location }
$target = Join-Path $root "desktop\src-tauri\binaries"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item (Join-Path $root "rust\target\release\agent-burn.exe") `
  (Join-Path $target "agent-burn-x86_64-pc-windows-msvc.exe") -Force
Write-Host "Sidecar ready in $target"

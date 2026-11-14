$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$localServer = Join-Path $repoRoot "tools\livekit-server.exe"

if (-not (Test-Path -LiteralPath $localServer)) {
  $nestedServer = Get-ChildItem -LiteralPath (Join-Path $repoRoot "tools") -Filter "livekit-server.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($nestedServer) {
    $localServer = $nestedServer.FullName
  }
}

if (Test-Path -LiteralPath $localServer) {
  & $localServer --dev --bind 127.0.0.1 --node-ip 127.0.0.1
  exit $LASTEXITCODE
}

$installedServer = Get-Command "livekit-server" -ErrorAction SilentlyContinue
if ($installedServer) {
    & $installedServer.Source --dev --bind 127.0.0.1 --node-ip 127.0.0.1
  exit $LASTEXITCODE
}

Write-Host "LiveKit Server executable was not found. Download the Windows archive from the official releases:"
Write-Host "https://github.com/livekit/livekit/releases/latest"
Write-Host "Extract livekit-server.exe into the project's tools folder, then run:"
Write-Host ".\scripts\start-livekit.ps1"
exit 1

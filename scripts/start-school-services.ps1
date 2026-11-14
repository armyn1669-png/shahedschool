$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logRoot = Join-Path $repoRoot 'logs'
$envFile = Join-Path $repoRoot '.env.local'
$livekitExe = Join-Path $repoRoot 'tools\livekit-server.exe'
$webRoot = Join-Path $repoRoot 'apps\web'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null

function Write-StartupLog([string]$message) {
  Add-Content -LiteralPath (Join-Path $logRoot 'startup.log') -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message" -Encoding UTF8
}
function Read-LocalSetting([string]$name) {
  if (-not (Test-Path -LiteralPath $envFile)) { return $null }
  $line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  $value = ($line -split '=', 2)[1].Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) { $value = $value.Substring(1, $value.Length - 2) }
  return $value
}
function Test-LocalPort([int]$port) {
  try { return [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -First 1) }
  catch { return $false }
}

if (-not $env:LIVEKIT_URL) { $env:LIVEKIT_URL = Read-LocalSetting 'LIVEKIT_URL' }
if (-not $env:LIVEKIT_API_KEY) { $env:LIVEKIT_API_KEY = Read-LocalSetting 'LIVEKIT_API_KEY' }
if (-not $env:LIVEKIT_API_SECRET) { $env:LIVEKIT_API_SECRET = Read-LocalSetting 'LIVEKIT_API_SECRET' }
if (-not $env:LIVEKIT_URL) { $env:LIVEKIT_URL = 'ws://127.0.0.1:7880' }
if (-not $env:LIVEKIT_API_KEY) { $env:LIVEKIT_API_KEY = 'devkey' }
if (-not $env:LIVEKIT_API_SECRET) { $env:LIVEKIT_API_SECRET = 'secret' }

if (-not (Test-LocalPort 7880)) {
  if (-not (Test-Path -LiteralPath $livekitExe)) { Write-StartupLog 'LiveKit executable is missing.'; exit 1 }
  $oldKeys = $env:LIVEKIT_KEYS
  $env:LIVEKIT_KEYS = "$($env:LIVEKIT_API_KEY): $($env:LIVEKIT_API_SECRET)"
  try {
    Start-Process -FilePath $livekitExe -ArgumentList @('--dev', '--bind', '127.0.0.1', '--node-ip', '127.0.0.1') -WorkingDirectory (Split-Path $livekitExe) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'livekit.log') -RedirectStandardError (Join-Path $logRoot 'livekit-error.log') | Out-Null
  } finally { $env:LIVEKIT_KEYS = $oldKeys }
  Write-StartupLog 'Started local LiveKit.'
} else { Write-StartupLog 'LiveKit is already listening on port 7880.' }

if (-not (Test-LocalPort 3000)) {
  $command = '/d /c "npm.cmd run dev -- --hostname 127.0.0.1"'
  Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\cmd.exe') -ArgumentList $command -WorkingDirectory $webRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'website.log') -RedirectStandardError (Join-Path $logRoot 'website-error.log') | Out-Null
  Write-StartupLog 'Started local website.'
} else { Write-StartupLog 'Website is already listening on port 3000.' }

for ($attempt = 0; $attempt -lt 60 -and -not (Test-LocalPort 3000); $attempt++) { Start-Sleep -Milliseconds 500 }
if (Test-LocalPort 3000) { Start-Process 'http://localhost:3000' | Out-Null; Write-StartupLog 'Opened the school website in the browser.' }
else { Write-StartupLog 'Website did not start on port 3000; see website-error.log.' }

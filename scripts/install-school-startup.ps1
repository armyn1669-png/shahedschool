$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$startScript = Join-Path $repoRoot 'scripts\start-school-services.ps1'
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$taskName = 'School Shahed Local Services'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Starts the local school website and LiveKit when this Windows account signs in.' -Force | Out-Null
Write-Output 'Startup task installed. The site and online class service will start automatically when you sign in to Windows.'

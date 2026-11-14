$taskName = 'School Shahed Local Services'
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Output 'Automatic startup has been removed.'

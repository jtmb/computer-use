param(
  [Parameter(Mandatory = $true)][string]$StateRoot,
  [switch]$Start
)
$ErrorActionPreference = 'Stop'
if ($StateRoot -notmatch '^/[A-Za-z0-9_./-]+$' -or $StateRoot.Split('/') -contains '..') {
  throw 'Use the declared absolute Linux runtime path without whitespace or traversal.'
}
$accessTaskName = 'Ingenium Production Access'
$accessPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$accessWsl = Join-Path $env:SystemRoot 'System32\wsl.exe'
$accessCommand = '& ' + $accessWsl + ' -d Ubuntu -u brajam --cd /home/brajam --exec /usr/bin/python3 -B /mnt/c/Users/james/.codex/skills/ingenium-kubernetes-deploy/scripts/production_forward.py --state-root ' + $StateRoot
$accessLegacyArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $accessCommand + '"'
$accessPython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\pythonw.exe'
$accessHostScript = Join-Path $PSScriptRoot 'production_access_host.py'
if (-not (Test-Path -LiteralPath $accessPython -PathType Leaf) -or -not (Test-Path -LiteralPath $accessHostScript -PathType Leaf)) {
  throw 'The existing Windows Python background runtime or access host is missing.'
}
$accessArguments = '-B "' + $accessHostScript + '" --state-root "' + $StateRoot + '"'
$accessAction = New-ScheduledTaskAction -Execute $accessPython -Argument $accessArguments
$accessSettings = New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$accessUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$accessExisting = Get-ScheduledTask -TaskName $accessTaskName -ErrorAction SilentlyContinue
if ($accessExisting) {
  $accessLegacyOwned = @($accessExisting.Actions).Count -eq 1 -and $accessExisting.Actions[0].Execute -eq $accessPowerShell -and $accessExisting.Actions[0].Arguments -eq $accessLegacyArguments
  $accessCurrentOwned = @($accessExisting.Actions).Count -eq 1 -and $accessExisting.Actions[0].Execute -eq $accessPython -and $accessExisting.Actions[0].Arguments -eq $accessArguments
  if (-not $accessLegacyOwned -and -not $accessCurrentOwned) {
    throw 'A different task already owns Ingenium Production Access; inspect it without overwriting.'
  }
  if ($accessLegacyOwned -and $accessExisting.State -eq 'Running') {
    Stop-ScheduledTask -TaskName $accessTaskName
  }
  Set-ScheduledTask -TaskName $accessTaskName -Action $accessAction -Settings $accessSettings | Out-Null
} else {
  $accessTrigger = New-ScheduledTaskTrigger -AtLogOn -User $accessUser
  $accessPrincipal = New-ScheduledTaskPrincipal -UserId $accessUser -LogonType Interactive -RunLevel Limited
  Register-ScheduledTask -TaskName $accessTaskName -Action $accessAction -Trigger $accessTrigger -Principal $accessPrincipal -Settings $accessSettings | Out-Null
}
if ($Start) { Start-ScheduledTask -TaskName $accessTaskName }
Get-ScheduledTask -TaskName $accessTaskName | Select-Object TaskName,State

#Requires -Version 3.0
<#
    HammerByte Agent

    Install (elevated):   powershell -ExecutionPolicy Bypass -File agent.ps1 -Install
    Status:               powershell -ExecutionPolicy Bypass -File agent.ps1 -Status
    Uninstall (elevated): powershell -ExecutionPolicy Bypass -File agent.ps1 -Uninstall

    Without switches it runs the supervisor loop (started by the HammerByteAgent scheduled task as SYSTEM):
    every 10 seconds it polls HammerByte for the desired state and starts / stops / restarts
    service scripts (monitor, drivesync, ...) as child processes.
#>
[CmdletBinding()]
param(
    [switch]$Install,
    [switch]$Uninstall,
    [switch]$Status,
    [switch]$RunUpdater
)

$ErrorActionPreference = 'Stop'
$script:AgentVersion = '__HB_VERSION__'

# >>> HB-COMMON
# <<< HB-COMMON

$script:TaskName = 'HammerByteAgent'
$script:UpdaterTaskName = 'HammerByteAgentUpdater'
$script:LegacyTaskNames = @('HammerByteServerMonitor', 'HammerByteDriveSync')
$script:AgentDir = Join-Path $script:HbRoot 'agent'
$script:AgentFile = Join-Path $script:AgentDir 'agent.ps1'
$script:AgentPrevFile = Join-Path $script:AgentDir 'agent.prev.ps1'
$script:AgentNewFile = Join-Path $script:AgentDir 'agent.new.ps1'
$script:UpdaterFile = Join-Path $script:AgentDir 'hb-updater.ps1'
$script:UpdateStateFile = Join-Path $script:AgentDir 'update.json'
$script:HealthyFile = Join-Path $script:AgentDir 'healthy.txt'
$script:ServicesDir = Join-Path $script:HbRoot 'services'
$script:CacheDir = Join-Path $script:HbRoot 'cache'
$script:CacheFile = Join-Path $script:CacheDir 'state.bin'
$script:PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$script:PollSeconds = 10
$script:BackoffSeconds = @(10, 30, 60, 120, 300)
$script:BackoffResetMinutes = 10
$script:UpdateRetryMinutes = 60
$script:UpdateHealthTimeoutSeconds = 180

$script:Tag = $null
$script:Platform = $null
$script:Desired = $null
$script:Etag = $null
$script:Children = @{}
$script:PollFailures = 0
$script:ExitRequested = $false
$script:LastAliveLogUtc = [DateTime]::MinValue
$script:LastUpdateSkipLog = ''

# ================================================================ shared helpers

function Write-HbConsole {
    param([string]$Message, [string]$Level = 'INFO')
    Write-Host ('[' + $Level + '] ' + $Message)
    Write-HbLog $Message $Level
}

function Test-HbAdmin {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-HbSchtasks {
    param([string[]]$Arguments)
    $output = & schtasks.exe @Arguments 2>&1
    return @{ code = $LASTEXITCODE; output = (($output | ForEach-Object { [string]$_ }) -join ' ') }
}

function Get-HbHammerByteProcesses {
    # PowerShell processes running any HammerByte script (agent, updater, services, legacy tools).
    param([string]$Like)
    $result = @()
    try {
        foreach ($process in @(Get-WmiObject -Class Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop)) {
            $commandLine = [string]$process.CommandLine
            if ($commandLine -like $Like -and [int]$process.ProcessId -ne $PID) {
                $result += [int]$process.ProcessId
            }
        }
    } catch {}
    return ,$result
}

function New-HbTaskXml {
    param([string]$Arguments, [bool]$WithTriggers, [string]$Description)
    $command = [Security.SecurityElement]::Escape($script:PowerShellExe)
    $escapedArgs = [Security.SecurityElement]::Escape($Arguments)
    $escapedDescription = [Security.SecurityElement]::Escape($Description)
    $triggers = ''
    if ($WithTriggers) {
        $start = (Get-Date).AddMinutes(2).ToString('yyyy-MM-ddTHH:mm:ss', $script:HbInvariant)
        $triggers = @"
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT30S</Delay>
    </BootTrigger>
    <TimeTrigger>
      <Repetition>
        <Interval>PT5M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
      <StartBoundary>$start</StartBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
"@
    }
    return @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>$escapedDescription</Description>
  </RegistrationInfo>
  <Triggers>
$triggers  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>6</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>$command</Command>
      <Arguments>$escapedArgs</Arguments>
    </Exec>
  </Actions>
</Task>
"@
}

function Register-HbTask {
    param([string]$Name, [string]$Arguments, [bool]$WithTriggers, [string]$Description)
    $xmlPath = Join-Path $env:TEMP ('hammerbyte-' + $Name + '.xml')
    [IO.File]::WriteAllText($xmlPath, (New-HbTaskXml -Arguments $Arguments -WithTriggers $WithTriggers -Description $Description), [Text.Encoding]::Unicode)
    try {
        $result = Invoke-HbSchtasks -Arguments @('/Create', '/TN', $Name, '/XML', $xmlPath, '/F')
        if ($result.code -ne 0) {
            throw ('schtasks /Create ' + $Name + ' failed (' + $result.code + '): ' + $result.output)
        }
    } finally {
        Remove-Item -LiteralPath $xmlPath -Force -ErrorAction SilentlyContinue
    }
}

function Read-HbUpdateState {
    $state = Read-HbJsonFile -Path $script:UpdateStateFile
    if ($null -eq $state) {
        return @{}
    }
    return (ConvertTo-HbPlain -Value $state)
}

# ================================================================ install / uninstall / status

function Set-HbFolderAcl {
    # Only SYSTEM and Administrators: the config cache and drive-sync credentials live here.
    $null = & icacls.exe $script:HbRoot /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' /C /Q 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-HbConsole ('icacls on ' + $script:HbRoot + ' returned ' + $LASTEXITCODE) 'WARN'
    }
    $null = & icacls.exe (Join-Path $script:HbRoot '*') /reset /T /C /Q 2>&1
}

function Add-HbDefenderExclusion {
    $done = $false
    if (Get-Command -Name Add-MpPreference -ErrorAction SilentlyContinue) {
        try {
            Add-MpPreference -ExclusionPath $script:HbRoot -ErrorAction Stop
            $done = $true
            Write-HbConsole ('Defender exclusion added for ' + $script:HbRoot)
        } catch {
            Write-HbConsole ('Add-MpPreference failed: ' + (Get-HbErrorText $_)) 'WARN'
        }
    }
    if (-not $done) {
        $key = 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths'
        try {
            if (Test-Path -LiteralPath $key) {
                New-ItemProperty -LiteralPath $key -Name $script:HbRoot -Value 0 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
                Write-HbConsole 'Defender exclusion written to registry'
            } else {
                Write-HbConsole 'Windows Defender not present; no exclusion needed'
            }
        } catch {
            Write-HbConsole ('Defender registry exclusion failed (tamper protection?): ' + (Get-HbErrorText $_)) 'WARN'
        }
    }
}

function Stop-HbExistingInstall {
    # Ends the agent task and kills every HammerByte PowerShell process (new layout and legacy tools).
    $null = Invoke-HbSchtasks -Arguments @('/End', '/TN', $script:TaskName)
    $null = Invoke-HbSchtasks -Arguments @('/End', '/TN', $script:UpdaterTaskName)
    foreach ($legacy in $script:LegacyTaskNames) {
        $null = Invoke-HbSchtasks -Arguments @('/End', '/TN', $legacy)
        $deleted = Invoke-HbSchtasks -Arguments @('/Delete', '/TN', $legacy, '/F')
        if ($deleted.code -eq 0) {
            Write-HbConsole ('removed legacy task ' + $legacy)
        }
    }
    foreach ($processId in (Get-HbHammerByteProcesses -Like '*\HammerByte\*')) {
        Stop-HbProcessTree -Id $processId
        Write-HbConsole ('stopped HammerByte process ' + $processId)
    }
}

function Resolve-HbInstallTag {
    $candidates = @(
        $script:HbTagFile,
        (Join-Path $script:HbRoot 'ServerMonitor\.server-tag'),
        (Join-Path $script:HbRoot 'DriveSync\.server-tag')
    )
    foreach ($candidate in $candidates) {
        try {
            if ([IO.File]::Exists($candidate)) {
                $tag = ([IO.File]::ReadAllText($candidate)).Trim()
                if ($tag -match '^[A-Za-z0-9._-]{6,64}$') {
                    Write-HbConsole ('reusing server tag from ' + $candidate)
                    return $tag
                }
            }
        } catch {}
    }
    Write-HbConsole 'no existing server tag; generating a new one'
    return [Guid]::NewGuid().ToString()
}

function Remove-HbLegacyFolders {
    foreach ($name in @('ServerMonitor', 'DriveSync')) {
        $path = Join-Path $script:HbRoot $name
        if (Test-Path -LiteralPath $path) {
            try {
                Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
                Write-HbConsole ('removed legacy folder ' + $path)
            } catch {
                Write-HbConsole ('could not remove ' + $path + ': ' + (Get-HbErrorText $_)) 'WARN'
            }
        }
    }
}

function Register-HbAgentWithServer {
    param([string]$Tag)
    try {
        $response = Invoke-HbHttp -Method 'POST' -Path '/api/agent/register' -Body @{
            tag = $Tag
            agent_version = $script:AgentVersion
            platform = $script:Platform
        } -TimeoutSec 30
        if ($response.status -ne 200) {
            Write-HbConsole ('register returned HTTP ' + $response.status + ': ' + $response.text) 'WARN'
            return $null
        }
        $data = ConvertFrom-HbJson -Text $response.text
        return [string](Get-HbValue -Map $data -Key 'approval_status' -Default '')
    } catch {
        Write-HbConsole ('register failed (agent will retry on poll): ' + (Get-HbErrorText $_)) 'WARN'
        return $null
    }
}

function Install-HbAgent {
    $script:HbLogName = 'agent'
    if (-not (Test-HbAdmin)) {
        Write-Host '[ERROR] Run install-agent.cmd as Administrator.'
        exit 1
    }
    Write-HbConsole ('installing HammerByte Agent v' + $script:AgentVersion)

    foreach ($dir in @($script:HbRoot, $script:AgentDir, $script:ServicesDir, $script:HbRunDir, $script:CacheDir, $script:HbLogDir)) {
        if (-not [IO.Directory]::Exists($dir)) {
            [void][IO.Directory]::CreateDirectory($dir)
        }
    }
    # Exclusion before any other work so AMSI/Defender will allow this script and later service downloads.
    Add-HbDefenderExclusion
    Set-HbFolderAcl

    $script:Platform = Get-HbPlatform
    Write-HbConsole ('platform: ' + $script:Platform.os_caption + ' build ' + $script:Platform.os_build + ' (' + $script:Platform.family + '), PowerShell ' + $script:Platform.ps_version)

    $tag = Resolve-HbInstallTag
    Stop-HbExistingInstall

    Write-HbTextFile -Path $script:HbTagFile -Text $tag
    Remove-HbLegacyFolders

    $source = $PSCommandPath
    if (-not $source -or -not [IO.File]::Exists($source)) {
        throw 'cannot locate the running agent.ps1 to install'
    }
    if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($script:AgentFile)) {
        Copy-Item -LiteralPath $source -Destination $script:AgentFile -Force
    }
    try {
        Unblock-File -LiteralPath $script:AgentFile -ErrorAction Stop
    } catch {}
    foreach ($stale in @($script:AgentNewFile, $script:UpdateStateFile, $script:HealthyFile, $script:CacheFile)) {
        Remove-Item -LiteralPath $stale -Force -ErrorAction SilentlyContinue
    }
    foreach ($runFile in @(Get-ChildItem -LiteralPath $script:HbRunDir -ErrorAction SilentlyContinue)) {
        Remove-Item -LiteralPath $runFile.FullName -Force -ErrorAction SilentlyContinue
    }

    $approval = Register-HbAgentWithServer -Tag $tag

    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script:AgentFile + '"'
    Register-HbTask -Name $script:TaskName -Arguments $arguments -WithTriggers $true -Description 'HammerByte Agent supervisor (runs monitoring / drive sync services).'
    Write-HbConsole ('scheduled task ' + $script:TaskName + ' registered (boot + 5 minute watchdog, SYSTEM)')

    $run = Invoke-HbSchtasks -Arguments @('/Run', '/TN', $script:TaskName)
    if ($run.code -ne 0) {
        Write-HbConsole ('could not start task now: ' + $run.output + ' - it will start at next boot or within 5 minutes') 'WARN'
    } else {
        Write-HbConsole 'agent started'
    }

    Write-Host ''
    Write-Host '=================================================================='
    Write-Host (' HammerByte Agent v' + $script:AgentVersion + ' installed')
    Write-Host (' Server tag : ' + $tag)
    if ($approval) {
        Write-Host (' Approval   : ' + $approval)
    }
    Write-Host (' Folder     : ' + $script:HbRoot)
    Write-Host (' Logs       : ' + $script:HbLogDir)
    Write-Host ''
    if ($approval -ne 'approved') {
        Write-Host ' Next: approve this machine on HammerByte > Servers, then enable services.'
    }
    Write-Host '=================================================================='
}

function Uninstall-HbAgent {
    $script:HbLogName = 'agent'
    if (-not (Test-HbAdmin)) {
        Write-Host '[ERROR] Run as Administrator.'
        exit 1
    }
    Stop-HbExistingInstall
    foreach ($name in @($script:TaskName, $script:UpdaterTaskName)) {
        $null = Invoke-HbSchtasks -Arguments @('/Delete', '/TN', $name, '/F')
    }
    foreach ($dir in @($script:AgentDir, $script:ServicesDir, $script:HbRunDir, $script:CacheDir)) {
        Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Get-Command -Name Remove-MpPreference -ErrorAction SilentlyContinue) {
        try {
            Remove-MpPreference -ExclusionPath $script:HbRoot -ErrorAction Stop
        } catch {}
    }
    Write-HbConsole ('HammerByte Agent removed. Kept ' + $script:HbTagFile + ' and logs so a reinstall keeps the same server identity.')
}

function Show-HbStatus {
    $tag = Get-HbTag
    Write-Host ('Server tag : ' + $tag)
    $query = Invoke-HbSchtasks -Arguments @('/Query', '/TN', $script:TaskName, '/FO', 'LIST')
    Write-Host ('Task       : ' + $query.output)
    $healthy = ''
    if ([IO.File]::Exists($script:HealthyFile)) {
        $healthy = [IO.File]::ReadAllText($script:HealthyFile)
    }
    Write-Host ('Healthy    : ' + $healthy)
    $update = Read-HbUpdateState
    Write-Host ('Update     : ' + (ConvertTo-HbJson -Value $update))
    foreach ($runFile in @(Get-ChildItem -LiteralPath $script:HbRunDir -Filter '*.json' -ErrorAction SilentlyContinue)) {
        if ($runFile.Name -like '*.config.json') {
            continue
        }
        Write-Host ('Run        : ' + $runFile.Name + ' ' + [IO.File]::ReadAllText($runFile.FullName))
    }
    $today = Join-Path $script:HbLogDir ('agent-' + (Get-HbIstNow).ToString('yyyy-MM-dd', $script:HbInvariant) + '.log')
    if ([IO.File]::Exists($today)) {
        Write-Host ''
        Write-Host ('Last lines of ' + $today + ':')
        Get-Content -LiteralPath $today -Tail 25
    }
}

# ================================================================ desired state (poll + cache)

function Save-HbCache {
    param($State)
    try {
        Add-Type -AssemblyName System.Security
        $bytes = $script:HbUtf8NoBom.GetBytes((ConvertTo-HbJson -Value $State))
        $protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
        if (-not [IO.Directory]::Exists($script:CacheDir)) {
            [void][IO.Directory]::CreateDirectory($script:CacheDir)
        }
        $temp = $script:CacheFile + '.tmp'
        [IO.File]::WriteAllBytes($temp, $protected)
        if ([IO.File]::Exists($script:CacheFile)) {
            [IO.File]::Delete($script:CacheFile)
        }
        [IO.File]::Move($temp, $script:CacheFile)
    } catch {
        Write-HbLog ('cache write failed: ' + (Get-HbErrorText $_)) 'WARN'
    }
}

function Read-HbCache {
    try {
        if (-not [IO.File]::Exists($script:CacheFile)) {
            return $null
        }
        Add-Type -AssemblyName System.Security
        $protected = [IO.File]::ReadAllBytes($script:CacheFile)
        $bytes = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
        $state = ConvertFrom-HbJson -Text ($script:HbUtf8NoBom.GetString($bytes))
        return ,$state
    } catch {
        Write-HbLog ('cache read failed: ' + (Get-HbErrorText $_)) 'WARN'
        return $null
    }
}

function Get-HbServiceReport {
    $report = @{}
    foreach ($id in @($script:Children.Keys)) {
        $child = $script:Children[$id]
        $childPid = $null
        if (Test-HbChildRunning -Child $child) {
            $childPid = $child.pid
        }
        $report[$id] = @{
            state = $child.state
            pid = $childPid
            script_version = $child.script_version
            config_version = $child.config_version
            restarts = $child.restarts
            last_error = $child.last_error
        }
    }
    return $report
}

function Get-HbUpdateReport {
    $state = Read-HbUpdateState
    return @{
        status = Get-HbValue -Map $state -Key 'state' -Default $null
        error = Get-HbValue -Map $state -Key 'error' -Default $null
    }
}

function Write-HbDesiredSummary {
    param($State)
    $parts = @()
    $parts += ('approved=' + (Get-HbBool -Map $State -Key 'approved'))
    $parts += ('agent_active=' + (Get-HbBool -Map $State -Key 'agent_active'))
    $services = Get-HbValue -Map $State -Key 'services' -Default @{}
    if ($services -is [System.Collections.IDictionary]) {
        foreach ($id in @($services.Keys)) {
            $spec = $services[$id]
            if (Get-HbBool -Map $spec -Key 'enabled') {
                $scriptSpec = Get-HbValue -Map $spec -Key 'script' -Default @{}
                $parts += ($id + '=on(v' + (Get-HbValue -Map $scriptSpec -Key 'version' -Default '?') + ', config v' + (Get-HbValue -Map $spec -Key 'config_version' -Default '?') + ')')
            } else {
                $parts += ($id + '=off')
            }
        }
    }
    Write-HbLog ('desired state changed: ' + ($parts -join ', '))
}

function Get-HbDesiredState {
    $body = @{
        agent_version = $script:AgentVersion
        etag = $script:Etag
        platform = $script:Platform
        services = (Get-HbServiceReport)
        update = (Get-HbUpdateReport)
    }
    try {
        $response = Invoke-HbHttp -Method 'POST' -Path '/api/agent/poll' -Body $body -Headers @{ 'X-Server-Tag' = $script:Tag } -TimeoutSec 20
        if ($response.status -ne 200) {
            $snippet = [string]$response.text
            if ($snippet.Length -gt 200) {
                $snippet = $snippet.Substring(0, 200)
            }
            throw ('poll HTTP ' + $response.status + ' ' + $snippet)
        }
        $data = ConvertFrom-HbJson -Text $response.text
        if (-not ($data -is [System.Collections.IDictionary])) {
            throw 'poll response is not a JSON object'
        }
        if ($script:PollFailures -gt 0) {
            Write-HbLog ('poll recovered after ' + $script:PollFailures + ' failure(s)')
        }
        $script:PollFailures = 0
        if (Get-HbBool -Map $data -Key 'unchanged') {
            if ($null -ne $script:Desired) {
                return ,$script:Desired
            }
            # Server thinks we have a state we lost; ask for the full state next time.
            $script:Etag = $null
            return $null
        }
        $script:Desired = $data
        $script:Etag = [string](Get-HbValue -Map $data -Key 'etag' -Default '')
        Write-HbDesiredSummary -State $data
        Save-HbCache -State $data
        return ,$data
    } catch {
        $script:PollFailures++
        if ($script:PollFailures -eq 1 -or ($script:PollFailures % 30) -eq 0) {
            Write-HbLog ('poll failed (' + $script:PollFailures + ' in a row), using last known state: ' + (Get-HbErrorText $_)) 'WARN'
        }
        return ,$script:Desired
    }
}

# ================================================================ child service processes

function Get-HbChild {
    param([string]$Id)
    if (-not $script:Children.ContainsKey($Id)) {
        $script:Children[$Id] = @{
            id = $Id
            process = $null
            pid = $null
            start_utc = $null
            fingerprint = $null
            script_version = $null
            config_version = $null
            restarts = 0
            backoff_level = 0
            next_start_utc = [DateTime]::MinValue
            last_error = $null
            state = 'stopped'
        }
    }
    return $script:Children[$Id]
}

function Test-HbChildRunning {
    param($Child)
    if ($null -eq $Child.process) {
        return $false
    }
    try {
        return -not $Child.process.HasExited
    } catch {
        return $false
    }
}

function Get-HbRunFile {
    param([string]$Id)
    return Join-Path $script:HbRunDir ($Id + '.json')
}

function Stop-HbService {
    param([string]$Id, [string]$Reason)
    $child = Get-HbChild -Id $Id
    if (Test-HbChildRunning -Child $child) {
        Write-HbLog ('stopping ' + $Id + ' pid ' + $child.pid + ': ' + $Reason)
        Stop-HbProcessTree -Id $child.pid
        try {
            [void]$child.process.WaitForExit(15000)
        } catch {}
    }
    $child.process = $null
    $child.pid = $null
    $child.fingerprint = $null
    $child.state = 'stopped'
    Remove-Item -LiteralPath (Get-HbRunFile -Id $Id) -Force -ErrorAction SilentlyContinue
}

function Stop-HbAllServices {
    param([string]$Reason)
    foreach ($id in @($script:Children.Keys)) {
        $child = $script:Children[$id]
        if (Test-HbChildRunning -Child $child) {
            Stop-HbService -Id $id -Reason $Reason
        }
        $child.state = 'stopped'
        $child.backoff_level = 0
        $child.next_start_utc = [DateTime]::MinValue
    }
}

function Set-HbBackoff {
    param($Child, [string]$ErrorText)
    $level = [Math]::Min($Child.backoff_level, $script:BackoffSeconds.Count - 1)
    $delay = $script:BackoffSeconds[$level]
    $Child.backoff_level = $Child.backoff_level + 1
    $Child.restarts = $Child.restarts + 1
    $Child.next_start_utc = [DateTime]::UtcNow.AddSeconds($delay)
    $Child.last_error = $ErrorText
    $Child.state = 'backoff'
    Write-HbLog ($Child.id + ': ' + $ErrorText + '; retry in ' + $delay + 's') 'WARN'
}

function Update-HbChildStates {
    # Detects services that exited on their own and schedules a restart with backoff.
    foreach ($id in @($script:Children.Keys)) {
        $child = $script:Children[$id]
        if ($null -eq $child.process -or (Test-HbChildRunning -Child $child)) {
            continue
        }
        $exitCode = $null
        try {
            $exitCode = $child.process.ExitCode
        } catch {}
        $ranSeconds = 0
        if ($null -ne $child.start_utc) {
            $ranSeconds = [int]([DateTime]::UtcNow - $child.start_utc).TotalSeconds
        }
        if ($ranSeconds -ge ($script:BackoffResetMinutes * 60)) {
            $child.backoff_level = 0
        }
        $child.process = $null
        $child.pid = $null
        $child.fingerprint = $null
        Remove-Item -LiteralPath (Get-HbRunFile -Id $id) -Force -ErrorAction SilentlyContinue
        Set-HbBackoff -Child $child -ErrorText ('exited with code ' + $exitCode + ' after ' + $ranSeconds + 's')
    }
}

function Remove-HbOldServiceVersions {
    param([string]$Id, [string[]]$Keep)
    $root = Join-Path $script:ServicesDir $Id
    foreach ($dir in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | Where-Object { $_.PSIsContainer })) {
        if ($Keep -notcontains $dir.Name) {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Get-HbServiceScript {
    param([string]$Id, $ScriptSpec, [string]$KeepVersion)
    $version = [string](Get-HbValue -Map $ScriptSpec -Key 'version' -Default '')
    $sha256 = ([string](Get-HbValue -Map $ScriptSpec -Key 'sha256' -Default '')).ToLowerInvariant()
    $url = [string](Get-HbValue -Map $ScriptSpec -Key 'url' -Default '')
    if ($version -notmatch '^[0-9A-Za-z._-]{1,32}$' -or $sha256 -notmatch '^[0-9a-f]{64}$' -or -not $url) {
        throw ('invalid script descriptor for ' + $Id)
    }
    $path = Join-Path (Join-Path (Join-Path $script:ServicesDir $Id) $version) ($Id + '.ps1')
    if ([IO.File]::Exists($path) -and (Get-HbSha256 -Path $path) -eq $sha256) {
        return $path
    }
    Write-HbLog ('downloading ' + $Id + ' v' + $version)
    Save-HbFile -Path $url -Destination $path -Sha256 $sha256
    Remove-HbOldServiceVersions -Id $Id -Keep @($version, $KeepVersion)
    return $path
}

function Start-HbService {
    param([string]$Id, $Spec, [string]$Fingerprint)
    $child = Get-HbChild -Id $Id
    $scriptSpec = Get-HbValue -Map $Spec -Key 'script' -Default @{}
    $scriptVersion = [string](Get-HbValue -Map $scriptSpec -Key 'version' -Default '')
    $configVersion = [int](Get-HbValue -Map $Spec -Key 'config_version' -Default 0)
    $child.state = 'starting'
    try {
        $scriptPath = Get-HbServiceScript -Id $Id -ScriptSpec $scriptSpec -KeepVersion ([string]$child.script_version)
        $configPath = Join-Path $script:HbRunDir ($Id + '.config.json')
        Write-HbJsonFile -Path $configPath -Value @{
            service = $Id
            tag = $script:Tag
            script_version = $scriptVersion
            config_version = $configVersion
            config = (Get-HbValue -Map $Spec -Key 'config' -Default @{})
            written_at_ist = (Get-HbIstStamp)
        }

        $startInfo = New-Object Diagnostics.ProcessStartInfo
        $startInfo.FileName = $script:PowerShellExe
        $startInfo.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $scriptPath + '" -ConfigFile "' + $configPath + '" -ParentPid ' + $PID
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.WorkingDirectory = [IO.Path]::GetDirectoryName($scriptPath)
        $process = [Diagnostics.Process]::Start($startInfo)

        $child.process = $process
        $child.pid = $process.Id
        $child.start_utc = $process.StartTime.ToUniversalTime()
        $child.fingerprint = $Fingerprint
        $child.script_version = $scriptVersion
        $child.config_version = $configVersion
        $child.state = 'running'
        $child.last_error = $null
        Write-HbJsonFile -Path (Get-HbRunFile -Id $Id) -Value @{
            pid = $process.Id
            process_start_utc = $child.start_utc.ToString('o', $script:HbInvariant)
            script_version = $scriptVersion
            config_version = $configVersion
            started_at_ist = (Get-HbIstStamp)
            restarts = $child.restarts
        }
        Write-HbLog ('started ' + $Id + ' v' + $scriptVersion + ' config v' + $configVersion + ' pid ' + $process.Id)
    } catch {
        $child.process = $null
        $child.pid = $null
        $child.fingerprint = $null
        Set-HbBackoff -Child $child -ErrorText ('start failed: ' + (Get-HbErrorText $_))
        $child.state = 'error'
    }
}

function Sync-HbService {
    param([string]$Id, $Spec)
    $child = Get-HbChild -Id $Id
    if (-not (Get-HbBool -Map $Spec -Key 'enabled')) {
        if (Test-HbChildRunning -Child $child) {
            Stop-HbService -Id $Id -Reason 'disabled on HammerByte'
        }
        $child.state = 'disabled'
        $child.backoff_level = 0
        $child.next_start_utc = [DateTime]::MinValue
        $child.last_error = $null
        return
    }

    $scriptSpec = Get-HbValue -Map $Spec -Key 'script' -Default @{}
    $fingerprint = [string](Get-HbValue -Map $scriptSpec -Key 'version' -Default '') + '|' + [string](Get-HbValue -Map $Spec -Key 'config_version' -Default '')

    if (Test-HbChildRunning -Child $child) {
        if ($child.fingerprint -eq $fingerprint) {
            if ($child.backoff_level -gt 0 -and ([DateTime]::UtcNow - $child.start_utc).TotalMinutes -ge $script:BackoffResetMinutes) {
                $child.backoff_level = 0
            }
            $child.state = 'running'
            return
        }
        Stop-HbService -Id $Id -Reason ('desired version changed ' + $child.fingerprint + ' -> ' + $fingerprint)
        $child.backoff_level = 0
        $child.next_start_utc = [DateTime]::MinValue
    }

    if ([DateTime]::UtcNow -lt $child.next_start_utc) {
        $child.state = 'backoff'
        return
    }
    Start-HbService -Id $Id -Spec $Spec -Fingerprint $fingerprint
}

function Sync-HbServices {
    param($Services)
    $ids = @()
    if ($Services -is [System.Collections.IDictionary]) {
        $ids = @($Services.Keys | Where-Object { [string]$_ -match '^[a-z0-9_-]{1,32}$' })
    }
    foreach ($id in @($script:Children.Keys)) {
        if ($ids -notcontains $id) {
            Stop-HbService -Id $id -Reason 'no longer offered by HammerByte'
            $script:Children.Remove($id)
        }
    }
    foreach ($id in $ids) {
        try {
            Sync-HbService -Id $id -Spec $Services[$id]
        } catch {
            $child = Get-HbChild -Id $id
            $child.last_error = Get-HbErrorText $_
            Write-HbLog ('sync ' + $id + ' failed: ' + $child.last_error) 'ERROR'
        }
    }
}

function Clear-HbOrphans {
    # Services from a previous agent run exit on their own once they notice the parent is gone;
    # killing them here makes the handover immediate.
    foreach ($processId in (Get-HbHammerByteProcesses -Like '*\HammerByte\services\*')) {
        Write-HbLog ('killing orphaned service process ' + $processId)
        Stop-HbProcessTree -Id $processId
    }
    foreach ($runFile in @(Get-ChildItem -LiteralPath $script:HbRunDir -Filter '*.json' -ErrorAction SilentlyContinue)) {
        if ($runFile.Name -notlike '*.config.json') {
            Remove-Item -LiteralPath $runFile.FullName -Force -ErrorAction SilentlyContinue
        }
    }
}

# ================================================================ self-update

function Test-HbScriptFile {
    param([string]$Path, [string]$ExpectedVersion)
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
    if ($null -ne $errors -and $errors.Count -gt 0) {
        throw ('downloaded agent does not parse: ' + $errors[0].Message + ' at line ' + $errors[0].Extent.StartLineNumber)
    }
    $text = [IO.File]::ReadAllText($Path)
    if ($text.IndexOf("`$script:AgentVersion = '" + $ExpectedVersion + "'") -lt 0) {
        throw ('downloaded agent does not declare version ' + $ExpectedVersion)
    }
}

function Invoke-HbSelfUpdateCheck {
    param($AgentSpec)
    if ($null -eq $AgentSpec) {
        return
    }
    $latest = [string](Get-HbValue -Map $AgentSpec -Key 'latest_version' -Default '')
    if (-not $latest -or $latest -eq $script:AgentVersion) {
        return
    }
    $state = Read-HbUpdateState
    $stateName = [string](Get-HbValue -Map $state -Key 'state' -Default '')
    if ($stateName -eq 'rolled_back' -and [string](Get-HbValue -Map $state -Key 'failed_version' -Default '') -eq $latest) {
        if ($script:LastUpdateSkipLog -ne $latest) {
            $script:LastUpdateSkipLog = $latest
            Write-HbLog ('agent v' + $latest + ' was rolled back earlier; not retrying that version') 'WARN'
        }
        return
    }
    if ($stateName -eq 'failed' -and [string](Get-HbValue -Map $state -Key 'to_version' -Default '') -eq $latest) {
        $lastAttempt = [DateTime]::MinValue
        $parsed = [DateTime]::MinValue
        if ([DateTime]::TryParse([string](Get-HbValue -Map $state -Key 'last_attempt_utc' -Default ''), $script:HbInvariant, [Globalization.DateTimeStyles]::AdjustToUniversal, [ref]$parsed)) {
            $lastAttempt = $parsed
        }
        if (([DateTime]::UtcNow - $lastAttempt).TotalMinutes -lt $script:UpdateRetryMinutes) {
            return
        }
    }

    $attemptUtc = [DateTime]::UtcNow.ToString('o', $script:HbInvariant)
    try {
        Write-HbLog ('updating agent v' + $script:AgentVersion + ' -> v' + $latest)
        Save-HbFile -Path ([string](Get-HbValue -Map $AgentSpec -Key 'url' -Default '')) -Destination $script:AgentNewFile -Sha256 ([string](Get-HbValue -Map $AgentSpec -Key 'sha256' -Default ''))
        Test-HbScriptFile -Path $script:AgentNewFile -ExpectedVersion $latest

        Write-HbJsonFile -Path $script:UpdateStateFile -Value @{
            state = 'swapping'
            from_version = $script:AgentVersion
            to_version = $latest
            agent_pid = $PID
            last_attempt_utc = $attemptUtc
            error = $null
        }
        Copy-Item -LiteralPath $script:AgentFile -Destination $script:UpdaterFile -Force
        $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $script:UpdaterFile + '" -RunUpdater'
        Register-HbTask -Name $script:UpdaterTaskName -Arguments $arguments -WithTriggers $false -Description 'HammerByte Agent one-shot updater.'
        $run = Invoke-HbSchtasks -Arguments @('/Run', '/TN', $script:UpdaterTaskName)
        if ($run.code -ne 0) {
            throw ('could not start updater task: ' + $run.output)
        }
        Write-HbLog 'updater started; stopping services and exiting so it can swap files'
        Stop-HbAllServices -Reason 'agent update'
        $script:ExitRequested = $true
    } catch {
        $message = Get-HbErrorText $_
        Write-HbLog ('agent update to v' + $latest + ' failed: ' + $message) 'ERROR'
        Remove-Item -LiteralPath $script:AgentNewFile -Force -ErrorAction SilentlyContinue
        try {
            Write-HbJsonFile -Path $script:UpdateStateFile -Value @{
                state = 'failed'
                from_version = $script:AgentVersion
                to_version = $latest
                last_attempt_utc = $attemptUtc
                error = $message
            }
        } catch {}
    }
}

function Invoke-HbUpdater {
    # Runs from a copy of the old agent (hb-updater.ps1) inside its own scheduled task.
    $script:HbLogName = 'agent'
    $state = Read-HbUpdateState
    $toVersion = [string](Get-HbValue -Map $state -Key 'to_version' -Default '')
    $fromVersion = [string](Get-HbValue -Map $state -Key 'from_version' -Default '')
    $agentPid = [int](Get-HbValue -Map $state -Key 'agent_pid' -Default 0)
    Write-HbLog ('updater: swapping agent v' + $fromVersion + ' -> v' + $toVersion)

    if (-not [IO.File]::Exists($script:AgentNewFile)) {
        Write-HbLog 'updater: agent.new.ps1 missing; aborting' 'ERROR'
        $state['state'] = 'failed'
        $state['error'] = 'agent.new.ps1 missing'
        Write-HbJsonFile -Path $script:UpdateStateFile -Value $state
        $null = Invoke-HbSchtasks -Arguments @('/Run', '/TN', $script:TaskName)
        return
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ($agentPid -gt 0 -and $null -ne (Get-HbProcessStartUtc -Id $agentPid) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 1
    }
    $null = Invoke-HbSchtasks -Arguments @('/End', '/TN', $script:TaskName)
    if ($agentPid -gt 0 -and $null -ne (Get-HbProcessStartUtc -Id $agentPid)) {
        Write-HbLog ('updater: old agent ' + $agentPid + ' did not exit; killing it') 'WARN'
        Stop-HbProcessTree -Id $agentPid
        Start-Sleep -Seconds 2
    }

    try {
        Copy-Item -LiteralPath $script:AgentFile -Destination $script:AgentPrevFile -Force
        Copy-Item -LiteralPath $script:AgentNewFile -Destination $script:AgentFile -Force
        Remove-Item -LiteralPath $script:AgentNewFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $script:HealthyFile -Force -ErrorAction SilentlyContinue
    } catch {
        Write-HbLog ('updater: file swap failed: ' + (Get-HbErrorText $_)) 'ERROR'
        if ([IO.File]::Exists($script:AgentPrevFile)) {
            Copy-Item -LiteralPath $script:AgentPrevFile -Destination $script:AgentFile -Force -ErrorAction SilentlyContinue
        }
        $state['state'] = 'failed'
        $state['error'] = 'file swap failed'
        Write-HbJsonFile -Path $script:UpdateStateFile -Value $state
        $null = Invoke-HbSchtasks -Arguments @('/Run', '/TN', $script:TaskName)
        return
    }

    $null = Invoke-HbSchtasks -Arguments @('/Run', '/TN', $script:TaskName)
    $deadline = [DateTime]::UtcNow.AddSeconds($script:UpdateHealthTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 5
        try {
            if ([IO.File]::Exists($script:HealthyFile)) {
                $healthy = [IO.File]::ReadAllText($script:HealthyFile)
                if ($healthy.StartsWith($toVersion + '|')) {
                    $state['state'] = 'ok'
                    $state['error'] = $null
                    Write-HbJsonFile -Path $script:UpdateStateFile -Value $state
                    Write-HbLog ('updater: agent v' + $toVersion + ' is healthy')
                    return
                }
            }
        } catch {}
    }

    Write-HbLog ('updater: agent v' + $toVersion + ' not healthy within ' + $script:UpdateHealthTimeoutSeconds + 's; rolling back to v' + $fromVersion) 'ERROR'
    $null = Invoke-HbSchtasks -Arguments @('/End', '/TN', $script:TaskName)
    foreach ($processId in (Get-HbHammerByteProcesses -Like '*\HammerByte\agent\agent.ps1*')) {
        Stop-HbProcessTree -Id $processId
    }
    foreach ($processId in (Get-HbHammerByteProcesses -Like '*\HammerByte\services\*')) {
        Stop-HbProcessTree -Id $processId
    }
    Start-Sleep -Seconds 2
    Copy-Item -LiteralPath $script:AgentPrevFile -Destination $script:AgentFile -Force
    $state['state'] = 'rolled_back'
    $state['failed_version'] = $toVersion
    $state['error'] = ('v' + $toVersion + ' did not report healthy within ' + $script:UpdateHealthTimeoutSeconds + 's')
    Write-HbJsonFile -Path $script:UpdateStateFile -Value $state
    $null = Invoke-HbSchtasks -Arguments @('/Run', '/TN', $script:TaskName)
}

function Repair-HbStaleUpdateState {
    # A reboot during an update can leave state 'swapping' with no updater running.
    $state = Read-HbUpdateState
    if ([string](Get-HbValue -Map $state -Key 'state' -Default '') -ne 'swapping') {
        return
    }
    $parsed = [DateTime]::MinValue
    [void][DateTime]::TryParse([string](Get-HbValue -Map $state -Key 'last_attempt_utc' -Default ''), $script:HbInvariant, [Globalization.DateTimeStyles]::AdjustToUniversal, [ref]$parsed)
    if (([DateTime]::UtcNow - $parsed).TotalSeconds -lt ($script:UpdateHealthTimeoutSeconds + 120)) {
        return
    }
    if ([string](Get-HbValue -Map $state -Key 'to_version' -Default '') -eq $script:AgentVersion) {
        $state['state'] = 'ok'
        $state['error'] = $null
    } else {
        $state['state'] = 'failed'
        $state['error'] = 'update interrupted'
    }
    Write-HbJsonFile -Path $script:UpdateStateFile -Value $state
}

# ================================================================ main loop

function Invoke-HbAgentTick {
    Update-HbChildStates
    $desired = Get-HbDesiredState
    if ($null -eq $desired) {
        return
    }
    if (-not (Get-HbBool -Map $desired -Key 'approved') -or -not (Get-HbBool -Map $desired -Key 'agent_active')) {
        foreach ($id in @($script:Children.Keys)) {
            if (Test-HbChildRunning -Child $script:Children[$id]) {
                Stop-HbAllServices -Reason 'machine not approved or agent paused'
                break
            }
        }
        foreach ($id in @($script:Children.Keys)) {
            $script:Children[$id].state = 'stopped'
        }
        return
    }
    Invoke-HbSelfUpdateCheck -AgentSpec (Get-HbValue -Map $desired -Key 'agent' -Default $null)
    if ($script:ExitRequested) {
        return
    }
    Sync-HbServices -Services (Get-HbValue -Map $desired -Key 'services' -Default @{})
}

function Write-HbAliveLog {
    if (([DateTime]::UtcNow - $script:LastAliveLogUtc).TotalMinutes -lt 60) {
        return
    }
    $script:LastAliveLogUtc = [DateTime]::UtcNow
    $parts = @()
    foreach ($id in @($script:Children.Keys)) {
        $child = $script:Children[$id]
        $parts += ($id + '=' + $child.state + '(restarts ' + $child.restarts + ')')
    }
    $approved = 'unknown'
    if ($null -ne $script:Desired) {
        $approved = [string](Get-HbValue -Map $script:Desired -Key 'approval_status' -Default 'unknown')
    }
    Write-HbLog ('alive: v' + $script:AgentVersion + ', approval ' + $approved + ', poll failures ' + $script:PollFailures + ', services: ' + ($parts -join ', '))
}

function Start-HbAgentLoop {
    $script:HbLogName = 'agent'
    $mutex = New-Object Threading.Mutex($false, 'Global\HammerByteAgent')
    $owned = $false
    try {
        $owned = $mutex.WaitOne(0)
    } catch {
        if ($null -ne (Get-HbInnerException -Exception $_.Exception -Type ([Threading.AbandonedMutexException]))) {
            $owned = $true
        }
    }
    if (-not $owned) {
        Write-HbLog 'another agent instance is already running; exiting'
        return
    }

    try {
        foreach ($dir in @($script:AgentDir, $script:ServicesDir, $script:HbRunDir, $script:CacheDir, $script:HbLogDir)) {
            if (-not [IO.Directory]::Exists($dir)) {
                [void][IO.Directory]::CreateDirectory($dir)
            }
        }
        $script:Platform = Get-HbPlatform
        Write-HbLog ('agent v' + $script:AgentVersion + ' starting on ' + $script:Platform.os_caption + ' build ' + $script:Platform.os_build + ' (' + $script:Platform.family + '), PowerShell ' + $script:Platform.ps_version)

        $script:Tag = Get-HbTag
        if (-not $script:Tag) {
            $script:Tag = [Guid]::NewGuid().ToString()
            Write-HbTextFile -Path $script:HbTagFile -Text $script:Tag
            Write-HbLog ('no server tag found; generated ' + $script:Tag) 'WARN'
        }
        Write-HbLog ('server tag ' + $script:Tag)

        Repair-HbStaleUpdateState
        Clear-HbOrphans
        Write-HbJsonFile -Path (Join-Path $script:HbRunDir 'agent.json') -Value @{
            pid = $PID
            version = $script:AgentVersion
            started_at_ist = (Get-HbIstStamp)
        }

        $cached = Read-HbCache
        if ($null -ne $cached) {
            $script:Desired = $cached
            $script:Etag = [string](Get-HbValue -Map $cached -Key 'etag' -Default '')
            Write-HbLog 'loaded cached desired state'
        }

        while (-not $script:ExitRequested) {
            $tickStart = [DateTime]::UtcNow
            try {
                Invoke-HbAgentTick
            } catch {
                Write-HbLog ('tick failed: ' + (Get-HbErrorText $_)) 'ERROR'
            }
            try {
                Write-HbTextFile -Path $script:HealthyFile -Text ($script:AgentVersion + '|' + [DateTime]::UtcNow.ToString('o', $script:HbInvariant))
            } catch {}
            try {
                Write-HbAliveLog
            } catch {}
            if ($script:ExitRequested) {
                break
            }
            $elapsed = ([DateTime]::UtcNow - $tickStart).TotalSeconds
            $sleep = [Math]::Max(1, $script:PollSeconds - $elapsed)
            Start-Sleep -Milliseconds ([int]($sleep * 1000))
        }
        Write-HbLog 'agent loop exiting for update'
    } finally {
        try {
            $mutex.ReleaseMutex()
        } catch {}
        $mutex.Dispose()
    }
}

# ================================================================ entry point

try {
    if ($Install) {
        Install-HbAgent
    } elseif ($Uninstall) {
        Uninstall-HbAgent
    } elseif ($Status) {
        Show-HbStatus
    } elseif ($RunUpdater) {
        Invoke-HbUpdater
    } else {
        Start-HbAgentLoop
    }
    exit 0
} catch {
    $message = Get-HbErrorText $_
    try {
        Write-HbLog ('fatal: ' + $message) 'ERROR'
    } catch {}
    if ($Install -or $Uninstall -or $Status) {
        Write-Host ('[ERROR] ' + $message)
    }
    exit 1
}

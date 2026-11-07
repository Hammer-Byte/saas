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
$InstallDir = Join-Path $env:ProgramData "HammerByte\ServerMonitor"
$TagFile = Join-Path $InstallDir ".server-tag"
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
    if (Test-Path $TagFile) {
        $existing = (Get-Content -Path $TagFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($existing) { return $existing.Trim() }
    }
    $tag = [guid]::NewGuid().ToString()
    Set-Content -Path $TagFile -Value $tag -Encoding ASCII
    Write-SuperLog ("generated tag {0}" -f $tag)
    return $tag
}

function Install-Self {
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

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
        Set-Tls12
        $tmp = "$AgentFile.new"
        $webClient = New-Object System.Net.WebClient
        try {
            $webClient.DownloadFile($AgentUrl, $tmp)
        } finally {
            $webClient.Dispose()
        }
        if (-not (Test-Path $tmp) -or (Get-Item $tmp).Length -le 0) { throw "empty agent download" }
        Move-Item -Path $tmp -Destination $AgentFile -Force
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
    # Do NOT capture output into a variable — that buffers until the agent exits
    # (~15–30 min for two sends with 900s wait) and looks "stuck".
    Write-SuperLog "starting agent (2 health checks, ~15 min apart; live logs below / agent.log)"
    $agentOut = Join-Path $InstallDir "agent-console.log"
    $agentErr = Join-Path $InstallDir "agent-console.err.log"
    try { if (Test-Path $agentOut) { Remove-Item $agentOut -Force } } catch {}
    try { if (Test-Path $agentErr) { Remove-Item $agentErr -Force } } catch {}

    $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $AgentFile, "-Tag", $Tag
    ) -WorkingDirectory $InstallDir -PassThru -WindowStyle Hidden `
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

    # Flush any remaining lines after exit.
    Start-Sleep -Milliseconds 500
    foreach ($path in @($agentOut, $agentErr)) {
        if (-not (Test-Path $path)) { continue }
        try {
            Get-Content -Path $path -ErrorAction SilentlyContinue | ForEach-Object {
                if (-not $_) { return }
                Write-Host $_
                try { Add-Content -Path $LogFile -Value $_ -Encoding UTF8 } catch {}
            }
        } catch {}
    }

    Write-SuperLog ("agent exited (code {0}); refreshing agent then looping" -f $proc.ExitCode)
}

Write-Host ""
Write-Host "  ============================================"
Write-Host "   HammerByte  ·  Server Supervisor"
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

while ($true) {
    try {
        Ensure-Agent
        Start-AgentOnce -Tag $tag
        Update-Agent | Out-Null
    } catch {
        Write-SuperLog ("error: {0}" -f $_.Exception.Message)
        Write-SuperLog "retrying in 30s"
        Start-Sleep -Seconds 30
    }
}

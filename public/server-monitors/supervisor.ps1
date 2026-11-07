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
    if ($sourceScript -and (Test-Path $sourceScript)) {
        Copy-Item -Path $sourceScript -Destination $SupervisorFile -Force
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

function Update-Agent {
    Write-SuperLog "updating agent"
    try {
        $tmp = "$AgentFile.new"
        Invoke-WebRequest -Uri $AgentUrl -OutFile $tmp -UseBasicParsing
        if ((Get-Item $tmp).Length -le 0) { throw "empty agent download" }
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
    Write-SuperLog "starting agent"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AgentFile -Tag $Tag
    Write-SuperLog ("agent exited (code {0}); restarting after refresh" -f $LASTEXITCODE)
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

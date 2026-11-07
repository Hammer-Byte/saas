#Requires -Version 3.0
<#
.SYNOPSIS
  HammerByte Drive Sync (Windows Server 2012+ PowerShell)
  Child pulls from source UNC shares onto local paths every N seconds.
#>
param(
    [switch]$Setup
)

$ErrorActionPreference = "Continue"
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Enum]::ToObject([Net.SecurityProtocolType], 3072)
}

$HostUrl = "https://hammerbyte.co.in"
$MetricsUrl = "$HostUrl/api/servers/metrics"
$TaskName = "HammerByteDriveSync"
$InstallDir = Join-Path $env:ProgramData "HammerByte\DriveSync"
$ConfigFile = Join-Path $InstallDir "config.json"
$LogFile = Join-Path $InstallDir "drive-sync.log"
$TagFile = Join-Path $InstallDir ".server-tag"
$MonitorTagFile = Join-Path $env:ProgramData "HammerByte\ServerMonitor\.server-tag"
$ScriptFile = Join-Path $InstallDir "drive-sync.ps1"
$AgentVersion = "0.1.0-ps"
$DefaultInterval = 300
$script:CycleEvents = New-Object System.Collections.ArrayList

function Write-SyncLog {
    param(
        [string]$Message,
        [string]$Level = "info",
        [switch]$Event
    )
    $stamp = (Get-Date).ToUniversalTime().ToString("o")
    $line = "[drive-sync $stamp] $Message"
    Write-Host $line
    if ($Event) {
        [void]$script:CycleEvents.Add(@{ at = $stamp; level = $Level; message = $Message })
    }
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
    if (Test-Path $MonitorTagFile) {
        $existing = (Get-Content -Path $MonitorTagFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($existing) {
            Write-SyncLog ("using ServerMonitor tag {0}" -f $existing.Trim())
            Set-Content -Path $TagFile -Value $existing.Trim() -Encoding ASCII
            return $existing.Trim()
        }
    }
    if (Test-Path $TagFile) {
        $existing = (Get-Content -Path $TagFile -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($existing) { return $existing.Trim() }
    }
    $tag = [guid]::NewGuid().ToString()
    Set-Content -Path $TagFile -Value $tag -Encoding ASCII
    Write-SyncLog ("generated tag {0}" -f $tag)
    return $tag
}

function ConvertTo-Unc {
    param([string]$SourceHost, [string]$ShareOrUnc)
    $raw = ($ShareOrUnc -replace "/", "\").Trim()
    if ($raw.StartsWith("\\")) { return $raw.TrimEnd("\") }
    $share = $raw.TrimStart("\").TrimEnd("\")
    return ("\\{0}\{1}" -f $SourceHost, $share)
}

function Normalize-LocalPath {
    param([string]$PathValue)
    $value = ($PathValue -replace "/", "\").Trim()
    if ($value -match "^[A-Za-z]:$") { $value = "$value\" }
    return $value
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
        $dstFull = [System.IO.Path]::GetFullPath($ScriptFile)
        if ($srcFull.ToLowerInvariant() -ne $dstFull.ToLowerInvariant()) {
            Copy-Item -Path $sourceScript -Destination $ScriptFile -Force
        }
    }
    $tr = ("powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $ScriptFile)
    & schtasks.exe /Create /TN $TaskName /SC ONSTART /RL HIGHEST /RU SYSTEM /F /TR $tr | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-SyncLog "task scheduler registered (ONSTART, SYSTEM)"
    } else {
        Write-SyncLog ("task scheduler registration failed (exit {0})" -f $LASTEXITCODE) -Level "error" -Event
    }
}

function Read-Config {
    if (-not (Test-Path $ConfigFile)) { return $null }
    try {
        $config = Get-Content -Path $ConfigFile -Raw | ConvertFrom-Json
        # PS 3 ConvertFrom-Json: single pair becomes one object, not an array.
        if ($config.pairs -and $config.pairs -isnot [System.Array]) {
            $config.pairs = @($config.pairs)
        } elseif (-not $config.pairs) {
            $config.pairs = @()
        } else {
            $config.pairs = @($config.pairs)
        }
        return $config
    } catch {
        Write-SyncLog ("config parse failed: {0}" -f $_.Exception.Message) -Level "error" -Event
        return $null
    }
}

function Save-Config {
    param($Config)
    ($Config | ConvertTo-Json -Depth 6) | Set-Content -Path $ConfigFile -Encoding UTF8
    try {
        & icacls.exe $ConfigFile /inheritance:r /grant:r Administrators:F /grant:r SYSTEM:F | Out-Null
    } catch {}
    Write-SyncLog ("config saved ({0} pair(s), interval {1}s)" -f $Config.pairs.Count, $Config.interval_seconds)
}

function Invoke-Setup {
    Write-Host ""
    Write-Host "=== Setup (saved for future runs) ==="
    Write-Host ""

    $sourceHost = Read-Host "Source host IP or name"
    if (-not $sourceHost) { throw "source host is required" }

    $username = Read-Host "Windows username for the share (DOMAIN\user or .\user)"
    if (-not $username) { throw "username is required" }

    $secure = Read-Host "Password" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if (-not $password) { throw "password is required" }

    $pairCountRaw = Read-Host "How many drive pairs to sync? [1]"
    if (-not $pairCountRaw) { $pairCountRaw = "1" }
    $pairCount = [math]::Max(1, [int]$pairCountRaw)
    $pairs = @()

    for ($i = 1; $i -le $pairCount; $i++) {
        Write-Host ""
        Write-Host ("--- Pair {0} ---" -f $i)
        $share = Read-Host "Source share name or UNC (e.g. g  or  \\192.168.1.1\g)"
        $defaultLocal = ""
        if ($share -match "^[A-Za-z0-9._-]+$") { $defaultLocal = ($share.ToUpper() + ":\") }
        $localPrompt = if ($defaultLocal) { "Local destination path on this machine [$defaultLocal]" } else { "Local destination path on this machine" }
        $local = Read-Host $localPrompt
        if (-not $local -and $defaultLocal) { $local = $defaultLocal }
        if (-not $share -or -not $local) { throw ("pair {0} requires source and local path" -f $i) }
        $pairs += @{
            source_unc = ConvertTo-Unc -SourceHost $sourceHost -ShareOrUnc $share
            local_path = Normalize-LocalPath -PathValue $local
        }
    }

    $intervalRaw = Read-Host ("Check interval in seconds [{0}]" -f $DefaultInterval)
    if (-not $intervalRaw) { $intervalRaw = "$DefaultInterval" }
    $interval = [math]::Max(60, [int]$intervalRaw)

    $config = @{
        source_host = $sourceHost
        username = $username
        password = $password
        pairs = $pairs
        interval_seconds = $interval
        updated_at = (Get-Date).ToUniversalTime().ToString("o")
    }
    Save-Config -Config $config

    Write-Host ""
    Write-Host "Saved config:"
    Write-Host ("  source: {0}" -f $sourceHost)
    foreach ($pair in $pairs) {
        Write-Host ("  {0}  ->  {1}" -f $pair.source_unc, $pair.local_path)
    }
    Write-Host ("  interval: {0}s" -f $interval)
    Write-Host ""
    return $config
}

function Connect-Share {
    param([string]$Unc, [string]$Username, [string]$Password)
    & net.exe use $Unc /delete /y 2>$null | Out-Null
    $output = & net.exe use $Unc $Password /user:$Username /persistent:no 2>&1
    if ($LASTEXITCODE -ne 0) {
        return @{ ok = $false; error = ($output | Out-String).Trim() }
    }
    return @{ ok = $true }
}

function Disconnect-Share {
    param([string]$Unc)
    & net.exe use $Unc /delete /y 2>$null | Out-Null
}

function Parse-RobocopyStats {
    param([string]$Text)
    $stats = @{
        files_copied = $null
        files_skipped = $null
        files_failed = $null
        extras_deleted = $null
    }
    $failedPaths = New-Object System.Collections.ArrayList
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match "^\s*Files\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)") {
            $stats.files_copied = [int]$Matches[2]
            $stats.files_skipped = [int]$Matches[3]
            $stats.files_failed = [int]$Matches[5]
            $stats.extras_deleted = [int]$Matches[6]
        }
        if ($line -match "ERROR\s+\d+\s*\(" -or $line -match "\s+FAILED\s+") {
            [void]$failedPaths.Add($line.Trim())
        }
    }
    return @{ stats = $stats; failedPaths = @($failedPaths | Select-Object -First 50) }
}

function Invoke-MirrorPair {
    param($Pair, [string]$Username, [string]$Password)

    $started = Get-Date
    $result = @{
        source_unc = $Pair.source_unc
        local_path = $Pair.local_path
        status = "error"
        source_alive = $false
        local_alive = $false
        copied = $null
        deleted = $null
        skipped = $null
        failed = $null
        duration_ms = 0
        robocopy_exit_code = $null
        errors = New-Object System.Collections.ArrayList
        events = New-Object System.Collections.ArrayList
    }

    if (-not (Test-Path -LiteralPath $Pair.local_path)) {
        $msg = "local destination not accessible: $($Pair.local_path)"
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }
    $result.local_alive = $true

    Write-SyncLog ("connecting share {0} as {1}" -f $Pair.source_unc, $Username) -Event
    $connected = Connect-Share -Unc $Pair.source_unc -Username $Username -Password $Password
    if (-not $connected.ok) {
        $msg = "share auth/connect failed for $($Pair.source_unc): $($connected.error)"
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }

    if (-not (Test-Path -LiteralPath $Pair.source_unc)) {
        $msg = "source path not found/accessible: $($Pair.source_unc)"
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        Disconnect-Share -Unc $Pair.source_unc
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }
    $result.source_alive = $true

    Write-SyncLog ("starting robocopy /MIR {0} -> {1}" -f $Pair.source_unc, $Pair.local_path) -Event
    # Same flags as Bun utility: mirror, low retries (skip locked), restartable copy.
    $roboOutput = & robocopy.exe $Pair.source_unc $Pair.local_path /MIR /R:1 /W:1 /XJ /FFT /Z /NP /BYTES 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    $result.robocopy_exit_code = $exitCode
    $parsed = Parse-RobocopyStats -Text $roboOutput
    $result.copied = $parsed.stats.files_copied
    $result.deleted = $parsed.stats.extras_deleted
    $result.skipped = $parsed.stats.files_skipped
    $result.failed = $parsed.stats.files_failed

    foreach ($failedLine in $parsed.failedPaths) {
        [void]$result.errors.Add($failedLine)
        Write-SyncLog ("copy issue: {0}" -f $failedLine) -Level "warning" -Event
    }

    # robocopy 0–7 = success / extras / mismatches; >=8 = failure (same as Bun).
    if ($exitCode -ge 0 -and $exitCode -le 7) {
        if (($result.failed -as [int]) -gt 0) { $result.status = "partial" } else { $result.status = "ok" }
        Write-SyncLog ("pair done exit={0} copied={1} deleted={2} skipped={3} failed={4}" -f `
            $exitCode, $result.copied, $result.deleted, $result.skipped, $result.failed) `
            -Level $(if ($result.status -eq "ok") { "info" } else { "warning" }) -Event
    } else {
        $detail = ""
        if ($roboOutput) {
            $trim = $roboOutput.Trim()
            if ($trim.Length -gt 1000) { $detail = $trim.Substring($trim.Length - 1000) } else { $detail = $trim }
        }
        $msg = "robocopy failed exit=$exitCode"
        if ($detail) { $msg = "$msg : $detail" }
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        $result.status = "error"
    }

    Disconnect-Share -Unc $Pair.source_unc
    $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
    return $result
}

function Send-Status {
    param([string]$Tag, $Payload)
    try {
        $json = $Payload | ConvertTo-Json -Compress -Depth 8
        $webClient = New-Object System.Net.WebClient
        try {
            $webClient.Headers["Content-Type"] = "application/json"
            $webClient.Headers["X-Server-Tag"] = $Tag
            $null = $webClient.UploadString($MetricsUrl, "POST", $json)
        } finally {
            $webClient.Dispose()
        }
        Write-SyncLog "posted status to hammerbyte.co.in"
        return $true
    } catch {
        Write-SyncLog ("failed to post status: {0}" -f $_.Exception.Message) -Level "error" -Event
        return $false
    }
}

function Invoke-SyncCycle {
    param($Config, [string]$Tag)
    $script:CycleEvents = New-Object System.Collections.ArrayList
    $startedAt = (Get-Date).ToUniversalTime().ToString("o")
    Write-SyncLog ("==== sync cycle start ==== source={0}" -f $Config.source_host)

    $pairResults = @()
    foreach ($pair in @($Config.pairs)) {
        try {
            $pairResults += ,(Invoke-MirrorPair -Pair $pair -Username $Config.username -Password $Config.password)
        } catch {
            $message = "pair crashed $($pair.source_unc): $($_.Exception.Message)"
            Write-SyncLog $message -Level "error" -Event
            $pairResults += ,(@{
                source_unc = $pair.source_unc
                local_path = $pair.local_path
                status = "error"
                source_alive = $false
                local_alive = $false
                copied = $null
                deleted = $null
                skipped = $null
                failed = $null
                duration_ms = 0
                robocopy_exit_code = $null
                errors = @($message)
            })
        }
    }

    $statuses = @($pairResults | ForEach-Object { $_.status })
    $status = "error"
    if ($statuses.Count -gt 0) {
        if (@($statuses | Where-Object { $_ -ne "ok" }).Count -eq 0) { $status = "ok" }
        elseif (@($statuses | Where-Object { $_ -ne "error" }).Count -eq 0) { $status = "error" }
        else { $status = "partial" }
    }

    $totals = @{
        copied = 0
        deleted = 0
        skipped = 0
        failed = 0
    }
    foreach ($pair in $pairResults) {
        if ($pair.copied) { $totals.copied += [int]$pair.copied }
        if ($pair.deleted) { $totals.deleted += [int]$pair.deleted }
        if ($pair.skipped) { $totals.skipped += [int]$pair.skipped }
        if ($pair.failed) { $totals.failed += [int]$pair.failed }
    }

    $finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    Write-SyncLog ("==== sync cycle end ==== status={0} copied={1} deleted={2} skipped={3} failed={4}" -f `
        $status, $totals.copied, $totals.deleted, $totals.skipped, $totals.failed)

    $errors = @()
    foreach ($pair in $pairResults) {
        foreach ($err in @($pair.errors)) { $errors += $err }
    }

    $payload = @{
        type = "drive_sync"
        agent_version = $AgentVersion
        hostname = $env:COMPUTERNAME
        source_host = $Config.source_host
        status = $status
        started_at = $startedAt
        finished_at = $finishedAt
        interval_seconds = $Config.interval_seconds
        totals = $totals
        pairs = @($pairResults | ForEach-Object {
            @{
                source_unc = $_.source_unc
                local_path = $_.local_path
                status = $_.status
                source_alive = $_.source_alive
                local_alive = $_.local_alive
                copied = $_.copied
                deleted = $_.deleted
                skipped = $_.skipped
                failed = $_.failed
                duration_ms = $_.duration_ms
                robocopy_exit_code = $_.robocopy_exit_code
                errors = @($_.errors)
            }
        })
        events = @($script:CycleEvents | Select-Object -Last 200)
        errors = @($errors | Select-Object -First 100)
        collected_at = $finishedAt
    }

    Send-Status -Tag $Tag -Payload $payload | Out-Null
}

Write-Host ""
Write-Host "  ============================================"
Write-Host "   HammerByte  ·  Drive Sync"
Write-Host "   Windows Server 2012+ PowerShell"
Write-Host "  ============================================"
Write-Host ""

if (-not (Test-IsElevated)) {
    Write-Host "Administrator required. Re-launching elevated..."
    $scriptPath = $MyInvocation.PSCommandPath
    if (-not $scriptPath) { $scriptPath = $PSCommandPath }
    $argsList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`"")
    if ($Setup) { $argsList += "-Setup" }
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argsList
    exit 0
}

Install-Self
$tag = Get-OrCreateTag
Write-SyncLog ("tag {0}" -f $tag)
Write-SyncLog ("host {0}" -f $HostUrl)

$config = Read-Config
if ($Setup -or -not $config) {
    $config = Invoke-Setup
}

while ($true) {
    try {
        $config = Read-Config
        if (-not $config) { $config = Invoke-Setup }
        Invoke-SyncCycle -Config $config -Tag $tag
    } catch {
        Write-SyncLog ("cycle failed: {0}" -f $_.Exception.Message) -Level "error" -Event
        try {
            Send-Status -Tag $tag -Payload @{
                type = "drive_sync"
                agent_version = $AgentVersion
                hostname = $env:COMPUTERNAME
                source_host = $(if ($config) { $config.source_host } else { $null })
                status = "error"
                errors = @($_.Exception.Message)
                events = @($script:CycleEvents | Select-Object -Last 50)
                collected_at = (Get-Date).ToUniversalTime().ToString("o")
            } | Out-Null
        } catch {}
    }

    $sleepSeconds = $DefaultInterval
    if ($config -and $config.interval_seconds) {
        $sleepSeconds = [math]::Max(60, [int]$config.interval_seconds)
    }
    Write-SyncLog ("sleeping {0}s" -f $sleepSeconds)
    Start-Sleep -Seconds $sleepSeconds
}

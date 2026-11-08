#Requires -Version 3.0
<#
.SYNOPSIS
  HammerByte Drive Sync - Windows Server 2012+ (PowerShell 3/4 safe)
  Child pulls from source UNC shares onto local paths on an interval.
  Version: 0.2.3-ps-stable

.NOTES
  SOURCE SAFETY (live production):
  - Direction is ALWAYS source UNC -> local path on THIS machine.
  - Robocopy source is first arg; destination second. Source is never written.
  - /MIR (/E+/PURGE) only deletes extras on the LOCAL destination.
  - No Remove-Item / Copy-Item / Set-Content / icacls against UNC source.
  - Prefer a READ-ONLY share account on the production server.
  - Incremental: robocopy skips identical files; only new/changed transfer.
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
$HammerByteRoot = Join-Path $env:ProgramData "HammerByte"
$InstallDir = Join-Path $HammerByteRoot "DriveSync"
$ConfigFile = Join-Path $InstallDir "config.json"
$LogFile = Join-Path $InstallDir "drive-sync.log"
$SharedTagFile = Join-Path $HammerByteRoot ".server-tag"
$LegacyMonitorTagFile = Join-Path $HammerByteRoot "ServerMonitor\.server-tag"
$LegacyDriveSyncTagFile = Join-Path $InstallDir ".server-tag"
$ScriptFile = Join-Path $InstallDir "drive-sync.ps1"
$AgentVersion = "0.2.3-ps-stable"
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

function Get-ThisScriptPath {
    # Prefer $PSCommandPath (PS 3+). $MyInvocation inside functions is unreliable on PS 3/4.
    if ($PSCommandPath) { return $PSCommandPath }
    if ($script:MyInvocation -and $script:MyInvocation.MyCommand -and $script:MyInvocation.MyCommand.Path) {
        return $script:MyInvocation.MyCommand.Path
    }
    return $null
}

function Assert-ScriptParses {
    $path = Get-ThisScriptPath
    if (-not $path) { return }
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
    if ($errors -and $errors.Count -gt 0) {
        foreach ($err in $errors) {
            Write-Host ("PARSE ERROR: {0}" -f $err.ToString()) -ForegroundColor Red
        }
        throw "drive-sync.ps1 failed parse check - redeploy this script file"
    }
}

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-OrCreateTag {
    # Single machine identity shared by monitor + drive-sync.
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
            Write-SyncLog ("migrated legacy tag to shared path {0}" -f $tag)
            return $tag
        }
    }
    $tag = [guid]::NewGuid().ToString()
    Set-Content -Path $SharedTagFile -Value $tag -Encoding ASCII
    Write-SyncLog ("generated shared tag {0}" -f $tag)
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
    if ($value -match '^[A-Za-z]:$') { $value = "$value\" }
    return $value
}

function Test-IsUncPath {
    param([string]$PathValue)
    if (-not $PathValue) { return $false }
    return ($PathValue -match '^\\\\[^\\]+\\[^\\]')
}

function Test-IsLocalDrivePath {
    param([string]$PathValue)
    if (-not $PathValue) { return $false }
    if ($PathValue.StartsWith("\\")) { return $false }
    return ($PathValue -match '^[A-Za-z]:\\')
}

function Assert-PullOnlyPaths {
    # Hard stop if args could ever write to production / remote source.
    param(
        [string]$SourceUnc,
        [string]$LocalPath
    )
    if (-not (Test-IsUncPath -PathValue $SourceUnc)) {
        throw ("REFUSING SYNC: source must be a UNC share like \\server\share (got '{0}')" -f $SourceUnc)
    }
    if (-not (Test-IsLocalDrivePath -PathValue $LocalPath)) {
        throw ("REFUSING SYNC: destination must be a local drive path like G:\ (got '{0}')" -f $LocalPath)
    }
    if (Test-IsUncPath -PathValue $LocalPath) {
        throw ("REFUSING SYNC: destination is UNC - never copy onto a remote path ('{0}')" -f $LocalPath)
    }
    $srcNorm = $SourceUnc.TrimEnd('\').ToLowerInvariant()
    $dstNorm = $LocalPath.TrimEnd('\').ToLowerInvariant()
    if ($srcNorm -eq $dstNorm) {
        throw "REFUSING SYNC: source and destination resolve to the same path"
    }
}

function Escape-JsonString {
    param([string]$Text)
    if ($null -eq $Text) { return "" }
    $s = [string]$Text
    $s = $s.Replace([string]'\', [string]'\\')
    $s = $s.Replace([string]'"', [string]'\"')
    $s = $s.Replace([string]("`r"), [string]'')
    $s = $s.Replace([string]("`n"), [string]'\n')
    $s = $s.Replace([string]("`t"), [string]'\t')
    return $s
}

function Install-Self {
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    $sourceScript = Get-ThisScriptPath
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

function Save-Config {
    param($Config)
    try {
        # Build JSON by concatenation (NOT -f). Passwords may contain { } which break -f.
        $pairParts = New-Object System.Collections.ArrayList
        foreach ($pair in @($Config.pairs)) {
            $part = '{"source_unc":"' + (Escape-JsonString ([string]$pair.source_unc)) +
                '","local_path":"' + (Escape-JsonString ([string]$pair.local_path)) + '"}'
            [void]$pairParts.Add($part)
        }
        $pairsJson = "[" + ($pairParts -join ",") + "]"
        $json = '{"source_host":"' + (Escape-JsonString ([string]$Config.source_host)) +
            '","username":"' + (Escape-JsonString ([string]$Config.username)) +
            '","password":"' + (Escape-JsonString ([string]$Config.password)) +
            '","interval_seconds":' + ([int]$Config.interval_seconds) +
            ',"updated_at":"' + (Escape-JsonString ([string]$Config.updated_at)) +
            '","pairs":' + $pairsJson + '}'
        Set-Content -Path $ConfigFile -Value $json -Encoding ASCII
        try {
            & icacls.exe $ConfigFile /inheritance:r /grant:r Administrators:F /grant:r SYSTEM:F | Out-Null
        } catch {}
        Write-SyncLog ("config saved ({0} pair(s), interval {1}s)" -f @($Config.pairs).Count, $Config.interval_seconds)
        return $true
    } catch {
        Write-SyncLog ("config save failed: {0}" -f $_.Exception.Message) -Level "error" -Event
        return $false
    }
}

function Read-Config {
    if (-not (Test-Path $ConfigFile)) { return $null }
    try {
        $raw = Get-Content -Path $ConfigFile -Raw -ErrorAction Stop
        if (-not $raw -or -not $raw.Trim()) { return $null }
        $obj = $raw | ConvertFrom-Json
        $pairs = New-Object System.Collections.ArrayList
        foreach ($pair in @($obj.pairs)) {
            $sourceUnc = [string]$pair.source_unc
            $localPath = Normalize-LocalPath -PathValue ([string]$pair.local_path)
            if (-not $sourceUnc -or -not $localPath) { continue }
            try {
                Assert-PullOnlyPaths -SourceUnc $sourceUnc -LocalPath $localPath
            } catch {
                Write-SyncLog $_.Exception.Message -Level "error" -Event
                continue
            }
            [void]$pairs.Add(@{
                source_unc = $sourceUnc
                local_path = $localPath
            })
        }
        if ($pairs.Count -lt 1) { throw "config has no valid drive pairs" }
        return @{
            source_host = [string]$obj.source_host
            username = [string]$obj.username
            password = [string]$obj.password
            interval_seconds = [int]$obj.interval_seconds
            updated_at = [string]$obj.updated_at
            pairs = $pairs.ToArray()
        }
    } catch {
        Write-SyncLog ("config parse failed: {0}" -f $_.Exception.Message) -Level "error" -Event
        return $null
    }
}

function Invoke-Setup {
    Write-Host ""
    Write-Host "=== Setup (saved for future runs) ==="
    Write-Host "PULL ONLY: reads from production UNC, writes only to local disks on THIS PC."
    Write-Host "Production source files are never modified or deleted by this tool."
    Write-Host "Prefer a READ-ONLY Windows account on the source shares."
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
    $pairs = New-Object System.Collections.ArrayList

    for ($i = 1; $i -le $pairCount; $i++) {
        Write-Host ""
        Write-Host ("--- Pair {0} ---" -f $i)
        $share = Read-Host "Source share name or UNC (e.g. g  or  \\192.168.1.1\g)"
        $defaultLocal = ""
        if ($share -match '^[A-Za-z0-9._-]+$') { $defaultLocal = ($share.ToUpper() + ":\") }
        if ($defaultLocal) {
            $localPrompt = "Local destination path on this machine [$defaultLocal]"
        } else {
            $localPrompt = "Local destination path on this machine"
        }
        $local = Read-Host $localPrompt
        if (-not $local -and $defaultLocal) { $local = $defaultLocal }
        if (-not $share -or -not $local) { throw ("pair {0} requires source and local path" -f $i) }
        $localNorm = Normalize-LocalPath -PathValue $local
        $sourceUnc = ConvertTo-Unc -SourceHost $sourceHost -ShareOrUnc $share
        Assert-PullOnlyPaths -SourceUnc $sourceUnc -LocalPath $localNorm
        if (-not (Test-LocalDestination -LocalPath $localNorm)) {
            throw ("pair {0} destination must be a local fixed/removable drive (not a network map): {1}" -f $i, $localNorm)
        }
        [void]$pairs.Add(@{
            source_unc = $sourceUnc
            local_path = $localNorm
        })
    }

    $intervalRaw = Read-Host ("Check interval in seconds [{0}]" -f $DefaultInterval)
    if (-not $intervalRaw) { $intervalRaw = "$DefaultInterval" }
    $interval = [math]::Max(60, [int]$intervalRaw)

    $config = @{
        source_host = $sourceHost
        username = $username
        password = $password
        pairs = $pairs.ToArray()
        interval_seconds = $interval
        updated_at = (Get-Date).ToUniversalTime().ToString("o")
    }
    $saved = Save-Config -Config $config
    if (-not $saved) {
        throw "failed to save config.json - check permissions and run with -Setup again"
    }

    # Verify round-trip immediately so a bad save cannot start a broken loop.
    $verify = Read-Config
    if (-not $verify) {
        throw "config saved but could not be re-read - check config.json"
    }
    foreach ($pair in @($verify.pairs)) {
        Write-Host ("  VERIFY {0}  ->  {1}" -f $pair.source_unc, $pair.local_path)
        if ($pair.local_path -notmatch '^[A-Za-z]:\\') {
            throw ("verified local path invalid: {0}" -f $pair.local_path)
        }
    }

    Write-Host ""
    Write-Host "Saved config:"
    Write-Host ("  source: {0}" -f $sourceHost)
    foreach ($pair in $config.pairs) {
        Write-Host ("  {0}  ->  {1}" -f $pair.source_unc, $pair.local_path)
    }
    Write-Host ("  interval: {0}s" -f $interval)
    Write-Host ""
    return $verify
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
        dirs_total = $null
        bytes_copied = $null
    }
    $failedPaths = New-Object System.Collections.ArrayList
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^\s*Dirs\s*:\s*(\d+)') {
            $stats.dirs_total = [int]$Matches[1]
        }
        if ($line -match '^\s*Files\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)') {
            $stats.files_copied = [int]$Matches[2]
            $stats.files_skipped = [int]$Matches[3]
            $stats.files_failed = [int]$Matches[5]
            $stats.extras_deleted = [int]$Matches[6]
        }
        if ($line -match '^\s*Bytes\s*:\s*(\S+)\s+(\S+)') {
            $stats.bytes_copied = $Matches[2]
        }
        if ($line -match 'ERROR\s+\d+\s*\(' -or $line -match '\s+FAILED\s+') {
            [void]$failedPaths.Add($line.Trim())
        }
    }
    return @{ stats = $stats; failedPaths = @($failedPaths | Select-Object -First 50) }
}

function Quote-ProcessArg {
    param([string]$Value)
    if ($null -eq $Value) { return '""' }
    if ($Value -match '[\s"]') {
        return ('"{0}"' -f ($Value.Replace('"', '""')))
    }
    return $Value
}

function Read-NewFileText {
    param(
        [string]$Path,
        [ref]$Position
    )
    if (-not (Test-Path -LiteralPath $Path)) { return "" }
    try {
        $fs = [System.IO.File]::Open(
            $Path,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
        try {
            $pos = [int64]$Position.Value
            if ($pos -gt $fs.Length) { $pos = 0 }
            $fs.Position = $pos
            $sr = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::Default, $true)
            $chunk = $sr.ReadToEnd()
            $Position.Value = $fs.Position
            return $chunk
        } finally {
            $fs.Close()
        }
    } catch {
        return ""
    }
}

function Invoke-RobocopyWithProgress {
    # Streams robocopy output live + heartbeats so the console does not look frozen.
    param(
        [string]$Source,
        [string]$Dest,
        [string[]]$Options
    )

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    $outFile = Join-Path $InstallDir "robocopy-live.out.log"
    $errFile = Join-Path $InstallDir "robocopy-live.err.log"
    try { Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item -LiteralPath $errFile -Force -ErrorAction SilentlyContinue } catch {}

    $argParts = New-Object System.Collections.ArrayList
    [void]$argParts.Add((Quote-ProcessArg $Source))
    [void]$argParts.Add((Quote-ProcessArg $Dest))
    foreach ($opt in @($Options)) { [void]$argParts.Add([string]$opt) }
    $argString = [string]::Join(" ", $argParts.ToArray())

    Write-SyncLog ("STARTING COPY: {0}  ->  {1}" -f $Source, $Dest) -Event
    Write-SyncLog "Incremental: only NEW or CHANGED files transfer; identical files are skipped." -Event
    Write-SyncLog "Please wait. Heartbeats every 30s. Failures are logged as copy issue lines." -Event
    Write-SyncLog ("Watch destination grow if needed: {0}  |  raw robocopy: {1}" -f $Dest, $outFile) -Event

    $p = Start-Process -FilePath "robocopy.exe" -ArgumentList $argString `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile `
        -NoNewWindow -PassThru

    $started = Get-Date
    $outPos = [int64]0
    $errPos = [int64]0
    $sb = New-Object System.Text.StringBuilder
    $lastBeat = Get-Date
    $issueCount = 0

    while ($true) {
        $chunk = Read-NewFileText -Path $outFile -Position ([ref]$outPos)
        if ($chunk) {
            [void]$sb.Append($chunk)
            foreach ($line in ($chunk -split "`r?`n")) {
                if (-not $line) { continue }
                if ($line -match 'ERROR\s+\d+\s*\(' -or $line -match '\s+FAILED\s+') {
                    $issueCount++
                    if ($issueCount -le 50) {
                        Write-SyncLog ("copy issue: {0}" -f $line.Trim()) -Level "warning" -Event
                    }
                }
            }
        }

        $errChunk = Read-NewFileText -Path $errFile -Position ([ref]$errPos)
        if ($errChunk) {
            [void]$sb.Append($errChunk)
            foreach ($line in ($errChunk -split "`r?`n")) {
                if (-not $line) { continue }
                $issueCount++
                if ($issueCount -le 50) {
                    Write-SyncLog ("copy issue: {0}" -f $line.Trim()) -Level "warning" -Event
                }
            }
        }

        if ($p.HasExited) { break }

        if (((Get-Date) - $lastBeat).TotalSeconds -ge 30) {
            $elapsed = [int]((Get-Date) - $started).TotalSeconds
            Write-SyncLog ("still copying... please wait (elapsed {0}s, pid {1}, issues {2})" -f `
                $elapsed, $p.Id, $issueCount)
            $lastBeat = Get-Date
        }
        Start-Sleep -Milliseconds 700
    }

    try { $null = $p.WaitForExit(5000) } catch {}
    Start-Sleep -Milliseconds 400

    $chunk = Read-NewFileText -Path $outFile -Position ([ref]$outPos)
    if ($chunk) {
        [void]$sb.Append($chunk)
        foreach ($line in ($chunk -split "`r?`n")) {
            if (-not $line) { continue }
            if ($line -match 'ERROR\s+\d+\s*\(' -or $line -match '\s+FAILED\s+') {
                $issueCount++
                if ($issueCount -le 50) {
                    Write-SyncLog ("copy issue: {0}" -f $line.Trim()) -Level "warning" -Event
                }
            }
        }
    }
    $errChunk = Read-NewFileText -Path $errFile -Position ([ref]$errPos)
    if ($errChunk) { [void]$sb.Append($errChunk) }

    $exitCode = 0
    try { $exitCode = [int]$p.ExitCode } catch { $exitCode = -1 }
    $elapsedTotal = [int]((Get-Date) - $started).TotalSeconds
    Write-SyncLog ("robocopy finished in {0}s (exit {1}, issue lines {2})" -f $elapsedTotal, $exitCode, $issueCount) -Event

    return @{
        Output = $sb.ToString()
        ExitCode = $exitCode
        ElapsedSeconds = $elapsedTotal
        IssueCount = $issueCount
    }
}

function Test-LocalDestination {
    param([string]$LocalPath)
    # Only fixed (3) or removable (2) disks. Reject network-mapped letters (4)
    # so we never write onto another server by accident.
    try {
        if (-not (Test-IsLocalDrivePath -PathValue $LocalPath)) { return $false }
        $driveLetter = $LocalPath.Substring(0, 2).ToUpperInvariant()
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='$driveLetter'" -ErrorAction SilentlyContinue
        if (-not $disk) { return $false }
        $driveType = [int]$disk.DriveType
        if ($driveType -ne 2 -and $driveType -ne 3) {
            Write-SyncLog ("destination {0} is DriveType={1} (need local 2/3, not network 4)" -f $driveLetter, $driveType) -Level "error" -Event
            return $false
        }
        return $true
    } catch {
        return $false
    }
}

function Invoke-MirrorPair {
    param($Pair, [string]$Username, [string]$Password)

    $started = Get-Date
    $sourceUnc = [string]$Pair.source_unc
    $localPath = Normalize-LocalPath -PathValue ([string]$Pair.local_path)

    $result = @{
        source_unc = $sourceUnc
        local_path = $localPath
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
    }

    try {
        Assert-PullOnlyPaths -SourceUnc $sourceUnc -LocalPath $localPath
    } catch {
        $msg = $_.Exception.Message
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }

    if (-not (Test-LocalDestination -LocalPath $localPath)) {
        $msg = "local destination not accessible or not a local disk: $localPath"
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }
    $result.local_alive = $true

    Write-SyncLog ("connecting share READ path {0} as {1} (source is never modified)" -f $sourceUnc, $Username) -Event
    $connected = Connect-Share -Unc $sourceUnc -Username $Username -Password $Password
    if (-not $connected.ok) {
        $msg = "share auth/connect failed for ${sourceUnc}: $($connected.error)"
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }

    if (-not (Test-Path -LiteralPath $sourceUnc)) {
        $msg = "source path not found/accessible: $sourceUnc"
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        Disconnect-Share -Unc $sourceUnc
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }
    $result.source_alive = $true

    # SAFETY: robocopy <SOURCE> <DEST> - only DEST (/E+/PURGE) can change.
    # /COPY:DAT = data+attrs+times on DEST only; no /SEC /COPYALL.
    # Re-check paths immediately before spawn so args cannot be swapped.
    try {
        Assert-PullOnlyPaths -SourceUnc $sourceUnc -LocalPath $localPath
    } catch {
        $msg = $_.Exception.Message
        [void]$result.errors.Add($msg)
        Write-SyncLog $msg -Level "error" -Event
        Disconnect-Share -Unc $sourceUnc
        $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        return $result
    }

    # Arg0 = production UNC (read). Arg1 = local path (write/purge). Never reverse.
    # Robocopy default: skip identical files (same size + timestamp); only new/changed copy.
    $roboSource = $sourceUnc
    $roboDest = $localPath
    Assert-PullOnlyPaths -SourceUnc $roboSource -LocalPath $roboDest
    $roboOptions = @(
        "/E",
        "/PURGE",
        "/COPY:DAT",
        "/DCOPY:T",
        "/R:1",
        "/W:1",
        "/XJ",
        "/FFT",
        "/Z",
        "/ETA",
        "/BYTES"
    )
    Write-SyncLog ("PULL ONLY robocopy SOURCE->LOCAL: {0} -> {1} (purge extras on LOCAL only; production source never written)" -f $roboSource, $roboDest) -Event
    $roboRun = Invoke-RobocopyWithProgress -Source $roboSource -Dest $roboDest -Options $roboOptions
    $roboOutput = [string]$roboRun.Output
    $exitCode = [int]$roboRun.ExitCode
    $result.robocopy_exit_code = $exitCode
    $parsed = Parse-RobocopyStats -Text $roboOutput
    $result.copied = $parsed.stats.files_copied
    $result.deleted = $parsed.stats.extras_deleted
    $result.skipped = $parsed.stats.files_skipped
    $result.failed = $parsed.stats.files_failed

    if ($null -ne $parsed.stats.files_copied -or $null -ne $parsed.stats.dirs_total) {
        Write-SyncLog ("summary: dirs={0} copied={1} skipped_unchanged={2} failed={3} local_extras_deleted={4} bytes_copied={5}" -f `
            $parsed.stats.dirs_total, $result.copied, $result.skipped, $result.failed, $result.deleted, $parsed.stats.bytes_copied) -Event
    }

    foreach ($failedLine in $parsed.failedPaths) {
        [void]$result.errors.Add($failedLine)
        Write-SyncLog ("copy issue: {0}" -f $failedLine) -Level "warning" -Event
    }

    $logLevel = "warning"
    if ($exitCode -ge 0 -and $exitCode -le 7) {
        if (($result.failed -as [int]) -gt 0) {
            $result.status = "partial"
        } else {
            $result.status = "ok"
            $logLevel = "info"
        }
        Write-SyncLog ("pair done exit={0} copied={1} skipped_unchanged={2} local_extras_deleted={3} failed={4} (source untouched)" -f `
            $exitCode, $result.copied, $result.skipped, $result.deleted, $result.failed) `
            -Level $logLevel -Event
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

    Disconnect-Share -Unc $sourceUnc
    $result.duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
    return $result
}

function ConvertTo-JsonSafe {
    param($Object)
    # Prefer JavaScriptSerializer. PS 3/4 ConvertTo-Json wraps arrays as {value,Count}.
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
    $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $serializer.MaxJsonLength = [int]::MaxValue
    return $serializer.Serialize($Object)
}

function Send-Status {
    param([string]$Tag, $Payload)
    try {
        $json = $null
        try {
            $json = ConvertTo-JsonSafe -Object $Payload
        } catch {
            # Minimal hand-built fallback so a missing serializer never blocks sync.
            $status = "error"
            $sourceHost = ""
            $agentVer = $AgentVersion
            $hostName = $env:COMPUTERNAME
            if ($Payload -is [hashtable]) {
                if ($Payload.ContainsKey("status")) { $status = [string]$Payload.status }
                if ($Payload.ContainsKey("source_host") -and $Payload.source_host) { $sourceHost = [string]$Payload.source_host }
                if ($Payload.ContainsKey("agent_version")) { $agentVer = [string]$Payload.agent_version }
                if ($Payload.ContainsKey("hostname")) { $hostName = [string]$Payload.hostname }
            } else {
                try { $status = [string]$Payload.status } catch {}
                try { if ($Payload.source_host) { $sourceHost = [string]$Payload.source_host } } catch {}
            }
            $json = '{"type":"drive_sync","agent_version":"' + (Escape-JsonString $agentVer) +
                '","hostname":"' + (Escape-JsonString $hostName) +
                '","source_host":"' + (Escape-JsonString $sourceHost) +
                '","status":"' + (Escape-JsonString $status) +
                '","errors":["serializer unavailable; sync still ran"],"collected_at":"' +
                (Escape-JsonString ((Get-Date).ToUniversalTime().ToString("o"))) + '"}'
            Write-SyncLog ("json serializer fallback used: {0}" -f $_.Exception.Message) -Level "warning" -Event
        }
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

    $pairResults = New-Object System.Collections.ArrayList
    foreach ($pair in @($Config.pairs)) {
        try {
            [void]$pairResults.Add((Invoke-MirrorPair -Pair $pair -Username $Config.username -Password $Config.password))
        } catch {
            $message = "pair crashed $($pair.source_unc): $($_.Exception.Message)"
            Write-SyncLog $message -Level "error" -Event
            [void]$pairResults.Add(@{
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
        $nonOk = @($statuses | Where-Object { $_ -ne "ok" })
        $nonError = @($statuses | Where-Object { $_ -ne "error" })
        if ($nonOk.Count -eq 0) { $status = "ok" }
        elseif ($nonError.Count -eq 0) { $status = "error" }
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

    $errors = New-Object System.Collections.ArrayList
    foreach ($pair in $pairResults) {
        foreach ($err in @($pair.errors)) { [void]$errors.Add([string]$err) }
    }

    $pairPayload = New-Object System.Collections.ArrayList
    foreach ($pair in $pairResults) {
        [void]$pairPayload.Add(@{
            source_unc = [string]$pair.source_unc
            local_path = [string]$pair.local_path
            status = [string]$pair.status
            source_alive = [bool]$pair.source_alive
            local_alive = [bool]$pair.local_alive
            copied = $pair.copied
            deleted = $pair.deleted
            skipped = $pair.skipped
            failed = $pair.failed
            duration_ms = $pair.duration_ms
            robocopy_exit_code = $pair.robocopy_exit_code
            errors = @($pair.errors | ForEach-Object { [string]$_ })
        })
    }

    $eventPayload = New-Object System.Collections.ArrayList
    foreach ($ev in @($script:CycleEvents | Select-Object -Last 200)) {
        [void]$eventPayload.Add(@{
            at = [string]$ev.at
            level = [string]$ev.level
            message = [string]$ev.message
        })
    }

    $payload = @{
        type = "drive_sync"
        agent_version = $AgentVersion
        hostname = $env:COMPUTERNAME
        source_host = [string]$Config.source_host
        status = $status
        started_at = $startedAt
        finished_at = $finishedAt
        interval_seconds = [int]$Config.interval_seconds
        totals = $totals
        pairs = $pairPayload.ToArray()
        events = $eventPayload.ToArray()
        errors = @($errors | Select-Object -First 100)
        collected_at = $finishedAt
    }

    Send-Status -Tag $Tag -Payload $payload | Out-Null
}

Write-Host ""
Write-Host "  ============================================"
Write-Host "   HammerByte  -  Drive Sync"
Write-Host "   Windows Server 2012+ PowerShell ($AgentVersion)"
Write-Host "  ============================================"
Write-Host ""

Assert-ScriptParses

if (-not (Test-IsElevated)) {
    Write-Host "Administrator required. Re-launching elevated..."
    $scriptPath = Get-ThisScriptPath
    if (-not $scriptPath) { throw "cannot resolve drive-sync.ps1 path for elevation" }
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
    if ($Setup) { $argList = "$argList -Setup" }
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList
    exit 0
}

Install-Self
$tag = Get-OrCreateTag
Write-SyncLog ("tag {0}" -f $tag)
Write-SyncLog ("host {0}" -f $HostUrl)
Write-SyncLog ("version {0}" -f $AgentVersion)

if ($Setup -and (Test-Path $ConfigFile)) {
    Write-SyncLog "Setup requested - removing old config.json"
    Remove-Item -Path $ConfigFile -Force -ErrorAction SilentlyContinue
}

$config = Read-Config
if ($Setup -or -not $config) {
    $config = Invoke-Setup
}

while ($true) {
    try {
        $loaded = Read-Config
        if ($loaded) { $config = $loaded }
        if (-not $config) { $config = Invoke-Setup }
        Invoke-SyncCycle -Config $config -Tag $tag
    } catch {
        Write-SyncLog ("cycle failed: {0}" -f $_.Exception.Message) -Level "error" -Event
        $sourceHostValue = $null
        if ($config) { $sourceHostValue = $config.source_host }
        try {
            Send-Status -Tag $tag -Payload @{
                type = "drive_sync"
                agent_version = $AgentVersion
                hostname = $env:COMPUTERNAME
                source_host = $sourceHostValue
                status = "error"
                errors = @($_.Exception.Message)
                events = @()
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

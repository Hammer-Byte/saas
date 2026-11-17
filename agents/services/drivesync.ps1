#Requires -Version 3.0
<#
    HammerByte Drive Sync service. Started and stopped by the HammerByte Agent; do not run by hand.

    Pull-only mirror: for every pair, robocopy copies \\source_host\share onto a local folder.
    The source is only ever read. /PURGE removes files from the LOCAL destination that no longer
    exist at the source, so the local folder becomes an exact copy.
#>
param(
    [Parameter(Mandatory = $true)][string]$ConfigFile,
    [Parameter(Mandatory = $true)][int]$ParentPid
)

$ErrorActionPreference = 'Stop'
$script:ServiceVersion = '__HB_VERSION__'

# >>> HB-COMMON
# <<< HB-COMMON

$script:MaxReportEvents = 200
$script:RobocopyExe = Join-Path $env:SystemRoot 'System32\robocopy.exe'
$script:ExcludedDirs = @('System Volume Information', '$RECYCLE.BIN', 'RECYCLER')
$script:ExcludedFiles = @('pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'DumpStack.log.tmp')

# Robocopy per-file labels (English). Copied = transferred, skipped = identical at both ends,
# purged = existed only locally and was deleted by /PURGE.
$script:CopiedLabels = @('New File', 'Newer', 'Older', 'Changed', 'Modified', 'Tweaked')
$script:SkippedLabels = @('same')
$script:PurgedLabels = @('*EXTRA File', '*EXTRA Dir')
$script:FileLineRegex = '^\s*(New File|Newer|Older|Changed|Modified|Tweaked|same|\*EXTRA File|\*EXTRA Dir|\*Mismatch|lonely|New Dir)\s+(-?\d*)\s*(.+?)\s*$'
$script:ErrorLineRegex = 'ERROR\s+(\d+)\s+\(0x[0-9A-Fa-f]+\)\s+(.+?)\s+((?:\\\\|[A-Za-z]:\\).*)$'

function Invoke-HbNet {
    # Soften ErrorAction: with Stop, net.exe stderr (e.g. "connection could not be found" on
    # /delete when nothing is mapped) becomes a terminating exception before we can read exit codes.
    param([string[]]$Arguments)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $raw = & net.exe @Arguments 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    $parts = @($raw) | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) {
            [string]$_.Exception.Message
        } else {
            [string]$_
        }
    }
    return @{ code = $code; output = ($parts -join ' ').Trim() }
}

function Test-HbNetMissingConnection {
    # net use /delete when no session exists - expected, not a failure.
    param([hashtable]$Result)
    if (-not $Result) {
        return $false
    }
    if ($Result.code -eq 2) {
        return $true
    }
    $text = [string]$Result.output
    return ($text -match 'could not be found|1202|2250')
}

function Disconnect-HbSource {
    # Never throw: missing sessions are normal; finally-blocks must not crash the cycle.
    param([string]$SourceHost)
    $result = Invoke-HbNet -Arguments @('use', ('\\' + $SourceHost + '\IPC$'), '/delete', '/y')
    if ($result.code -eq 0 -or (Test-HbNetMissingConnection -Result $result)) {
        return
    }
}

function Connect-HbSource {
    # One IPC$ session per cycle carries the credentials for every share on the host.
    param([string]$SourceHost, [string]$User, [string]$Password)
    $target = '\\' + $SourceHost + '\IPC$'
    Disconnect-HbSource -SourceHost $SourceHost
    $result = Invoke-HbNet -Arguments @('use', $target, $Password, ('/user:' + $User), '/persistent:no')
    if ($result.code -eq 0) {
        return
    }
    if ($result.output -match '1219') {
        # Another session to the same host exists with different credentials; drop every session and retry once.
        $null = Invoke-HbNet -Arguments @('use', ('\\' + $SourceHost), '/delete', '/y')
        $result = Invoke-HbNet -Arguments @('use', $target, $Password, ('/user:' + $User), '/persistent:no')
        if ($result.code -eq 0) {
            return
        }
    }
    $message = $result.output
    if ($Password) {
        $message = $message.Replace($Password, '***')
    }
    throw ('cannot connect to ' + $target + ' as ' + $User + ': ' + $message)
}

function Get-HbNormalizedLocalPath {
    param([string]$Path)
    $trimmed = $Path.Trim().TrimEnd('\')
    if ($trimmed -match '^[A-Za-z]:$') {
        return $trimmed + '\'
    }
    return $trimmed
}

function Test-HbLocalDestination {
    # Returns an error string when mirroring into this path could destroy something important.
    param([string]$Path)
    if ($Path -notmatch '^[A-Za-z]:\\') {
        return 'local path must start with a drive letter, e.g. G:\'
    }
    $driveRoot = $Path.Substring(0, 3)
    if (-not [IO.Directory]::Exists($driveRoot)) {
        return ('drive ' + $driveRoot + ' does not exist on this machine')
    }
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\').ToLowerInvariant()
    $systemDrive = ([string]$env:SystemDrive).TrimEnd('\').ToLowerInvariant()
    if ($full -eq $systemDrive) {
        return 'refusing to mirror onto the root of the system drive'
    }
    $protected = @(
        $env:SystemRoot,
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)},
        $env:ProgramData,
        (Join-Path $env:SystemDrive 'Users')
    )
    foreach ($item in $protected) {
        if (-not $item) {
            continue
        }
        $protectedPath = ([string]$item).TrimEnd('\').ToLowerInvariant()
        if ($full -eq $protectedPath -or $full.StartsWith($protectedPath + '\') -or $protectedPath.StartsWith($full + '\')) {
            return ('refusing to mirror into or above protected folder ' + $item)
        }
    }
    return $null
}

function Test-HbDirectoryHasEntries {
    param([string]$Path)
    try {
        $enumerator = [IO.Directory]::EnumerateFileSystemEntries($Path).GetEnumerator()
        try {
            return $enumerator.MoveNext()
        } finally {
            $enumerator.Dispose()
        }
    } catch {
        return $false
    }
}

function Get-HbRobocopyMeaning {
    param([int]$Code)
    if ($Code -ge 16) { return 'fatal error: nothing copied (bad path, access denied to the share root, or out of space)' }
    $parts = @()
    if ($Code -band 1) { $parts += 'files copied' }
    if ($Code -band 2) { $parts += 'extra files purged locally' }
    if ($Code -band 4) { $parts += 'mismatched file/folder names' }
    if ($Code -band 8) { $parts += 'some files failed to copy' }
    if ($parts.Count -eq 0) { return 'no changes; destination already in sync' }
    return ($parts -join ', ')
}

function New-HbPairResult {
    param([string]$Share, [string]$Source, [string]$Destination)
    return @{
        share = $Share
        source = $Source
        destination = $Destination
        status = 'failed'
        exit_code = $null
        meaning = $null
        copied = 0
        skipped = 0
        purged = 0
        failed = 0
        mismatched = 0
        bytes_copied = 0
        dirs_created = 0
        duration_seconds = 0
        error = $null
    }
}

function Add-HbEvent {
    param($State, [string]$Share, [string]$Action, [string]$Path, $Size, [string]$Detail)
    $State.event_count = $State.event_count + 1
    if ($State.events.Count -lt $script:MaxReportEvents) {
        [void]$State.events.Add(@{
            share = $Share
            action = $Action
            path = $Path
            size = $Size
            detail = $Detail
        })
    }
}

function Get-HbFailureReason {
    # Plain-language reason for common Win32 codes robocopy reports.
    param([string]$Code, [string]$WindowsText)
    $text = [string]$WindowsText
    switch ($Code) {
        '5'   { return 'no access (permissions / ACL blocked the write or delete)' }
        '32'  { return 'locked by another application (file in use)' }
        '33'  { return 'locked by another application (file lock violation)' }
        '53'  { return 'network path not found' }
        '64'  { return 'network name dropped (share disconnected mid-copy)' }
        '112' { return 'not enough free space on the destination' }
        '123' { return 'invalid path or file name' }
        '267' { return 'invalid directory name' }
        default {
            if ($text -match '(?i)access is denied') {
                return 'no access (permissions / ACL blocked the write or delete)'
            }
            if ($text -match '(?i)being used by another process|cannot access the file') {
                return 'locked by another application (file in use)'
            }
            if ($text) {
                return $text
            }
            return ('Windows error ' + $Code)
        }
    }
}

function Read-HbRobocopyLog {
    # Streams the robocopy log, writes per-file lines to our log, and fills the pair result.
    param([string]$LogPath, $Result, $State, [int]$SkipLogMax)
    $skippedLogged = 0
    $summary = $null
    $bytesSummary = $null
    $pendingError = $null
    $failedPaths = @{}
    $reader = New-Object IO.StreamReader($LogPath, [Text.Encoding]::Unicode, $true)
    try {
        while ($null -ne ($line = $reader.ReadLine())) {
            if ($null -ne $pendingError) {
                $text = $line.Trim()
                if ($text) {
                    $pendingError.detail = $text
                    if (-not $failedPaths.ContainsKey($pendingError.path)) {
                        $failedPaths[$pendingError.path] = $true
                        $reason = Get-HbFailureReason -Code $pendingError.code -WindowsText $text
                        Write-HbLog ('FAILED ' + $pendingError.action + ' ' + $pendingError.path + ' - ' + $reason + ' [Windows ' + $pendingError.code + ': ' + $text + ']') 'WARN'
                        Add-HbEvent -State $State -Share $Result.share -Action 'failed' -Path $pendingError.path -Size $null -Detail ($reason + ' [Windows ' + $pendingError.code + ': ' + $text + ']')
                    }
                    $pendingError = $null
                }
                continue
            }
            $errorMatch = [regex]::Match($line, $script:ErrorLineRegex)
            if ($errorMatch.Success) {
                $pendingError = @{ code = $errorMatch.Groups[1].Value; action = $errorMatch.Groups[2].Value; path = $errorMatch.Groups[3].Value.Trim(); detail = $null }
                continue
            }
            if ($line -match '^\s*Files\s*:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)') {
                $summary = @([long]$Matches[1], [long]$Matches[2], [long]$Matches[3], [long]$Matches[4], [long]$Matches[5], [long]$Matches[6])
                continue
            }
            if ($line -match '^\s*Bytes\s*:\s+(\d+)\s+(\d+)\s+') {
                $bytesSummary = [long]$Matches[2]
                continue
            }
            $fileMatch = [regex]::Match($line, $script:FileLineRegex)
            if (-not $fileMatch.Success) {
                continue
            }
            $label = $fileMatch.Groups[1].Value
            $size = $null
            if ($fileMatch.Groups[2].Value) {
                $size = [long]$fileMatch.Groups[2].Value
            }
            $path = $fileMatch.Groups[3].Value
            if ($label -eq 'New Dir') {
                $Result.dirs_created = $Result.dirs_created + 1
                continue
            }
            if ($script:CopiedLabels -contains $label) {
                $Result.copied = $Result.copied + 1
                if ($null -ne $size) {
                    $Result.bytes_copied += $size
                }
                Write-HbLog ('COPIED (' + $label + ', ' + $size + ' bytes) ' + $path)
                Add-HbEvent -State $State -Share $Result.share -Action 'copied' -Path $path -Size $size -Detail $label
            } elseif ($script:SkippedLabels -contains $label) {
                $Result.skipped = $Result.skipped + 1
                if ($skippedLogged -lt $SkipLogMax) {
                    $skippedLogged++
                    Write-HbLog ('SKIPPED (unchanged: same size and timestamp) ' + $path)
                    if ($skippedLogged -eq $SkipLogMax) {
                        Write-HbLog ('skip log limit of ' + $SkipLogMax + ' reached for ' + $Result.share + '; further unchanged files are counted only')
                    }
                }
            } elseif ($script:PurgedLabels -contains $label) {
                $Result.purged = $Result.purged + 1
                Write-HbLog ('PURGED (not at source, removed locally) ' + $path)
                Add-HbEvent -State $State -Share $Result.share -Action 'purged' -Path $path -Size $size -Detail $label
            } elseif ($label -eq '*Mismatch') {
                $Result.mismatched = $Result.mismatched + 1
                Write-HbLog ('MISMATCH (file at one side, folder at the other) ' + $path) 'WARN'
                Add-HbEvent -State $State -Share $Result.share -Action 'mismatch' -Path $path -Size $size -Detail $label
            }
        }
    } finally {
        $reader.Dispose()
    }
    $Result.failed = $failedPaths.Count
    if ($null -ne $summary) {
        # Robocopy's own totals are authoritative: Total, Copied, Skipped, Mismatch, FAILED, Extras.
        $Result.copied = $summary[1]
        $Result.skipped = $summary[2]
        $Result.mismatched = $summary[3]
        $Result.failed = [Math]::Max($Result.failed, $summary[4])
    }
    if ($null -ne $bytesSummary) {
        $Result.bytes_copied = $bytesSummary
    }
}

function Get-HbMergedExcludes {
    # Built-in exclusions first, then user list; case-insensitive unique.
    param([string[]]$BuiltIn, $UserList)
    $merged = New-Object System.Collections.ArrayList
    $seen = @{}
    foreach ($item in (@($BuiltIn) + @($UserList))) {
        $name = [string]$item
        if (-not $name) {
            continue
        }
        $key = $name.ToLowerInvariant()
        if ($seen.ContainsKey($key)) {
            continue
        }
        $seen[$key] = $true
        [void]$merged.Add($name)
    }
    return ,$merged.ToArray()
}

function Resolve-HbRobocopyExcludePaths {
    # Exact paths only: every user entry is relative to the pair root.
    # Emit relative + source absolute + dest absolute so robocopy /XD|/XF matches
    # across 2012 path forms. Bare "logs" means share\logs only, not every logs folder.
    # Skip wildcards (* ?); validation should reject them.
    param(
        $Entries,
        [string]$SourceRoot,
        [string]$DestRoot
    )
    $resolved = New-Object System.Collections.ArrayList
    $seen = @{}
    $sourceBase = ([string]$SourceRoot).TrimEnd('\')
    $destBase = ([string]$DestRoot).TrimEnd('\')
    foreach ($item in @(Get-HbStringList -Raw $Entries)) {
        $raw = [string]$item
        if (-not $raw) {
            continue
        }
        $raw = $raw.Trim().TrimStart('\').TrimEnd('\')
        if (-not $raw) {
            continue
        }
        if ($raw.IndexOf('*') -ge 0 -or $raw.IndexOf('?') -ge 0) {
            continue
        }
        $relative = $raw.Replace('/', '\')
        $candidates = @(
            $relative,
            ($sourceBase + '\' + $relative),
            ($destBase + '\' + $relative)
        )
        foreach ($path in $candidates) {
            $key = ([string]$path).ToLowerInvariant()
            if ($seen.ContainsKey($key)) {
                continue
            }
            $seen[$key] = $true
            [void]$resolved.Add([string]$path)
        }
    }
    return ,$resolved.ToArray()
}

function Invoke-HbPairSync {
    # Read exclude lists from $Pair here (never via [string[]] params) so nested
    # Object[] from JSON cannot coerce to a single "System.Object[]" string.
    param(
        [string]$SourceHost,
        $Pair,
        [int]$SkipLogMax,
        $State,
        [int]$Index
    )
    $share = [string](Get-HbValue -Map $Pair -Key 'share' -Default '')
    $destination = Get-HbNormalizedLocalPath -Path ([string](Get-HbValue -Map $Pair -Key 'local_path' -Default ''))
    $source = '\\' + $SourceHost + '\' + $share
    $result = New-HbPairResult -Share $share -Source $source -Destination $destination
    $started = [DateTime]::UtcNow
    $rawExcludeDirs = Get-HbStringList -Raw (Get-HbValue -Map $Pair -Key 'exclude_dirs' -Default @())
    $rawExcludeFiles = Get-HbStringList -Raw (Get-HbValue -Map $Pair -Key 'exclude_files' -Default @())
    $resolvedUserDirs = Resolve-HbRobocopyExcludePaths -Entries $rawExcludeDirs -SourceRoot $source -DestRoot $destination
    $resolvedUserFiles = Resolve-HbRobocopyExcludePaths -Entries $rawExcludeFiles -SourceRoot $source -DestRoot $destination
    $resolvedExcludeDirs = Get-HbMergedExcludes -BuiltIn $script:ExcludedDirs -UserList $resolvedUserDirs
    $resolvedExcludeFiles = Get-HbMergedExcludes -BuiltIn $script:ExcludedFiles -UserList $resolvedUserFiles
    Write-HbLog ('pair ' + ($Index + 1) + ': ' + $source + ' -> ' + $destination)
    if ($rawExcludeDirs -and $rawExcludeDirs.Count -gt 0) {
        Write-HbLog ('pair ' + ($Index + 1) + ' raw exclude dirs: ' + ($rawExcludeDirs -join ', '))
    }
    if ($rawExcludeFiles -and $rawExcludeFiles.Count -gt 0) {
        Write-HbLog ('pair ' + ($Index + 1) + ' raw exclude files: ' + ($rawExcludeFiles -join ', '))
    }
    if ($resolvedExcludeDirs -and $resolvedExcludeDirs.Count -gt 0) {
        Write-HbLog ('pair ' + ($Index + 1) + ' exclude dirs (/XD): ' + ($resolvedExcludeDirs -join ', '))
    }
    if ($resolvedExcludeFiles -and $resolvedExcludeFiles.Count -gt 0) {
        Write-HbLog ('pair ' + ($Index + 1) + ' exclude files (/XF): ' + ($resolvedExcludeFiles -join ', '))
    }

    try {
        $problem = Test-HbLocalDestination -Path $destination
        if ($problem) {
            throw $problem
        }
        if (-not [IO.Directory]::Exists($source)) {
            throw ('source ' + $source + ' is not reachable; nothing copied and nothing removed locally')
        }
        if (-not (Test-HbDirectoryHasEntries -Path $source) -and (Test-HbDirectoryHasEntries -Path $destination)) {
            throw ('source ' + $source + ' is empty but ' + $destination + ' is not; refusing to mirror an empty source (would delete local files)')
        }

        $logPath = Join-Path $script:HbRunDir ('drivesync-pair-' + $Index + '.log')
        Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
        $argList = New-Object System.Collections.ArrayList
        foreach ($arg in @($source, $destination, '/E', '/PURGE', '/COPY:DAT', '/DCOPY:T', '/R:1', '/W:1', '/XJ', '/FFT', '/Z', '/V', '/FP', '/BYTES', '/NP', '/NJH', ('/UNILOG:' + $logPath))) {
            [void]$argList.Add([string]$arg)
        }
        if ($resolvedExcludeDirs -and $resolvedExcludeDirs.Count -gt 0) {
            [void]$argList.Add('/XD')
            foreach ($dir in @($resolvedExcludeDirs)) {
                [void]$argList.Add([string]$dir)
            }
        }
        if ($resolvedExcludeFiles -and $resolvedExcludeFiles.Count -gt 0) {
            [void]$argList.Add('/XF')
            foreach ($file in @($resolvedExcludeFiles)) {
                [void]$argList.Add([string]$file)
            }
        }
        $arguments = @($argList.ToArray())
        $null = & $script:RobocopyExe @arguments 2>&1
        $exitCode = $LASTEXITCODE
        $result.exit_code = $exitCode
        $result.meaning = Get-HbRobocopyMeaning -Code $exitCode

        if ([IO.File]::Exists($logPath)) {
            Read-HbRobocopyLog -LogPath $logPath -Result $result -State $State -SkipLogMax $SkipLogMax
            Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
        }

        if ($exitCode -ge 16) {
            $result.status = 'failed'
            $result.error = $result.meaning
        } elseif ($exitCode -ge 8 -or $result.failed -gt 0) {
            $result.status = 'partial'
            $result.error = ([string]$result.failed + ' file(s) failed to copy')
        } else {
            $result.status = 'ok'
        }
    } catch {
        $result.status = 'failed'
        $result.error = Get-HbErrorText $_
        Write-HbLog ('pair ' + ($Index + 1) + ' failed: ' + $result.error) 'ERROR'
    }

    $result.duration_seconds = [int]([DateTime]::UtcNow - $started).TotalSeconds
    Write-HbLog ('pair ' + ($Index + 1) + ' ' + $result.status + ': copied ' + $result.copied + ', skipped ' + $result.skipped + ', purged ' + $result.purged + ', failed ' + $result.failed + ', bytes ' + $result.bytes_copied + ', robocopy ' + $result.exit_code + ' (' + $result.meaning + '), ' + $result.duration_seconds + 's')
    return $result
}

function Get-HbPairIntervalSeconds {
    param($Pair)
    return (Get-HbInt -Map $Pair -Key 'interval_seconds' -Default 900 -Min 60 -Max 86400)
}

function Get-HbPairList {
    # Get-HbValue / ConvertTo-HbPlain may wrap object[] in an extra single-element
    # Object[], so @(Get-HbValue pairs) looks like 1 "pair" that is actually the
    # inner array (share/local_path lookups then fail). Unwrap and keep maps only.
    param($Raw)
    $current = $Raw
    while (
        $null -ne $current -and
        ($current -is [System.Array]) -and
        $current.Length -eq 1 -and
        $null -ne $current[0] -and
        ($current[0] -is [System.Array] -or $current[0] -is [System.Collections.ArrayList])
    ) {
        $current = $current[0]
    }
    $list = New-Object System.Collections.ArrayList
    if ($null -eq $current) {
        return ,$list.ToArray()
    }
    if ($current -is [System.Collections.IDictionary]) {
        [void]$list.Add($current)
        return ,$list.ToArray()
    }
    if ($current -is [System.Collections.IEnumerable] -and -not ($current -is [string])) {
        foreach ($item in $current) {
            if ($item -is [System.Collections.IDictionary]) {
                [void]$list.Add($item)
            }
        }
        return ,$list.ToArray()
    }
    return ,$list.ToArray()
}

function Get-HbStringList {
    # Same nesting issue as pairs: exclude_dirs / exclude_files can arrive as
    # Object[]{ Object[]{ 'path1', 'path2' } }. Flatten to a string[].
    param($Raw)
    $current = $Raw
    while (
        $null -ne $current -and
        ($current -is [System.Array]) -and
        $current.Length -eq 1 -and
        $null -ne $current[0] -and
        -not ($current[0] -is [string]) -and
        ($current[0] -is [System.Array] -or $current[0] -is [System.Collections.ArrayList])
    ) {
        $current = $current[0]
    }
    $list = New-Object System.Collections.ArrayList
    if ($null -eq $current) {
        return ,$list.ToArray()
    }
    if ($current -is [string]) {
        $one = $current.Trim()
        if ($one) {
            [void]$list.Add($one)
        }
        return ,$list.ToArray()
    }
    if ($current -is [System.Collections.IEnumerable]) {
        foreach ($item in $current) {
            if ($item -is [string]) {
                $text = $item.Trim()
                if ($text) {
                    [void]$list.Add($text)
                }
                continue
            }
            if ($item -is [System.Array] -or $item -is [System.Collections.ArrayList]) {
                foreach ($inner in @(Get-HbStringList -Raw $item)) {
                    [void]$list.Add($inner)
                }
            }
        }
        return ,$list.ToArray()
    }
    return ,$list.ToArray()
}

function Get-HbSoonestNextDueUtc {
    param($NextDueByIndex, [int]$PairCount)
    $soonest = $null
    for ($i = 0; $i -lt $PairCount; $i++) {
        if (-not $NextDueByIndex.ContainsKey($i)) {
            continue
        }
        $due = [DateTime]$NextDueByIndex[$i]
        if ($null -eq $soonest -or $due -lt $soonest) {
            $soonest = $due
        }
    }
    return $soonest
}

function Invoke-HbSyncCycle {
    param(
        $Config,
        [int[]]$DueIndexes,
        $NextDueByIndex
    )
    $sourceHost = [string](Get-HbValue -Map $Config -Key 'source_host' -Default '')
    $user = [string](Get-HbValue -Map $Config -Key 'username' -Default '')
    $password = [string](Get-HbValue -Map $Config -Key 'password' -Default '')
    $pairs = Get-HbPairList -Raw (Get-HbValue -Map $Config -Key 'pairs' -Default @())
    $skipLogMax = Get-HbInt -Map $Config -Key 'skip_log_max' -Default 500 -Min 0 -Max 5000
    $dueIndexes = @($DueIndexes)

    $startedUtc = [DateTime]::UtcNow
    $state = @{ events = (New-Object System.Collections.ArrayList); event_count = 0 }
    $pairResults = @()
    $cycleError = $null

    $pairSummaries = New-Object System.Collections.ArrayList
    foreach ($index in $dueIndexes) {
        if ($index -lt 0 -or $index -ge $pairs.Count) {
            continue
        }
        $pair = $pairs[$index]
        $shareName = [string](Get-HbValue -Map $pair -Key 'share' -Default '')
        $localPath = [string](Get-HbValue -Map $pair -Key 'local_path' -Default '')
        $null = $pairSummaries.Add(@{
            share = $shareName
            local_path = $localPath
            source = ('\\' + $sourceHost + '\' + $shareName)
            destination = $localPath
            interval_seconds = (Get-HbPairIntervalSeconds -Pair $pair)
        })
    }

    Write-HbLog ('sync cycle started: ' + $dueIndexes.Count + ' due pair(s) of ' + $pairs.Count + ' from ' + $sourceHost)
    $null = Send-HbResult -Type 'heartbeat' -Data @{}
    $null = Send-HbResult -Type 'sync_start' -Data @{
        source_host = $sourceHost
        started_at_ist = (Format-HbIst -Utc $startedUtc)
        pair_count = $dueIndexes.Count
        pairs = $pairSummaries.ToArray()
    }
    try {
        Connect-HbSource -SourceHost $sourceHost -User $user -Password $password
        Write-HbLog ('connected to \\' + $sourceHost + ' as ' + $user)
        foreach ($i in $dueIndexes) {
            if (-not (Test-HbParentAlive)) {
                throw 'agent stopped during sync'
            }
            if ($i -lt 0 -or $i -ge $pairs.Count) {
                continue
            }
            $pair = $pairs[$i]
            $pairInterval = Get-HbPairIntervalSeconds -Pair $pair
            $pairResult = Invoke-HbPairSync -SourceHost $sourceHost -Pair $pair -SkipLogMax $skipLogMax -State $state -Index $i
            $finishedUtc = [DateTime]::UtcNow
            $nextDueUtc = $finishedUtc.AddSeconds($pairInterval)
            $NextDueByIndex[$i] = $nextDueUtc
            $pairResult['interval_seconds'] = $pairInterval
            $pairResult['next_run_at_ist'] = (Format-HbIst -Utc $nextDueUtc)
            $pairResults += $pairResult
            Write-HbLog ('pair ' + ($i + 1) + ' next run ' + $pairResult.next_run_at_ist + ' (interval ' + $pairInterval + 's)')
        }
    } catch {
        $cycleError = Get-HbErrorText $_
        Write-HbLog ('sync cycle failed: ' + $cycleError) 'ERROR'
        foreach ($i in $dueIndexes) {
            if (-not $NextDueByIndex.ContainsKey($i) -or ([DateTime]$NextDueByIndex[$i]) -le $startedUtc) {
                $pair = $null
                if ($i -ge 0 -and $i -lt $pairs.Count) {
                    $pair = $pairs[$i]
                }
                $pairInterval = Get-HbPairIntervalSeconds -Pair $pair
                $NextDueByIndex[$i] = [DateTime]::UtcNow.AddSeconds($pairInterval)
            }
        }
    } finally {
        Disconnect-HbSource -SourceHost $sourceHost
    }

    $totals = @{ copied = 0; skipped = 0; purged = 0; failed = 0; mismatched = 0; bytes_copied = 0 }
    $okPairs = 0
    foreach ($pairResult in $pairResults) {
        foreach ($key in @('copied', 'skipped', 'purged', 'failed', 'mismatched', 'bytes_copied')) {
            $totals[$key] += [long]$pairResult[$key]
        }
        if ($pairResult.status -eq 'ok') {
            $okPairs++
        }
    }
    $status = 'ok'
    if ($cycleError -or $pairResults.Count -eq 0 -or $okPairs -eq 0) {
        $status = 'failed'
    } elseif ($okPairs -lt $pairResults.Count) {
        $status = 'partial'
    }
    if ($pairs.Count -eq 0) {
        $cycleError = 'no drive pairs configured'
        $status = 'failed'
    }

    $finishedUtc = [DateTime]::UtcNow
    $soonestUtc = Get-HbSoonestNextDueUtc -NextDueByIndex $NextDueByIndex -PairCount $pairs.Count
    if ($null -eq $soonestUtc) {
        $soonestUtc = $finishedUtc.AddSeconds(900)
    }
    $seen = [long]$totals.copied + [long]$totals.skipped + [long]$totals.purged + [long]$totals.failed + [long]$totals.mismatched
    $report = @{
        status = $status
        source_host = $sourceHost
        started_at_ist = (Format-HbIst -Utc $startedUtc)
        finished_at_ist = (Format-HbIst -Utc $finishedUtc)
        duration_seconds = [int]($finishedUtc - $startedUtc).TotalSeconds
        next_run_at_ist = (Format-HbIst -Utc $soonestUtc)
        files_seen = $seen
        totals = $totals
        pairs = $pairResults
        events = $state.events.ToArray()
        event_count = $state.event_count
        events_truncated = ($state.event_count -gt $state.events.Count)
        error = $cycleError
    }
    Write-HbLog ('sync cycle ' + $status + ': copied ' + $totals.copied + ', skipped ' + $totals.skipped + ', purged ' + $totals.purged + ', failed ' + $totals.failed + ', ' + $report.duration_seconds + 's; next ' + $report.next_run_at_ist)
    if (-not (Send-HbResult -Type 'sync_run' -Data $report)) {
        Write-HbLog 'sync report could not be delivered (details remain in this log)' 'WARN'
    }
}

function Start-HbDriveSync {
    Initialize-HbService -Name 'drivesync' -Version $script:ServiceVersion -ConfigFile $ConfigFile -ParentPid $ParentPid
    $config = $script:HbConfig
    $pairs = Get-HbPairList -Raw (Get-HbValue -Map $config -Key 'pairs' -Default @())
    Write-HbLog ('pair-specific intervals; ' + $pairs.Count + ' pair(s); source ' + [string](Get-HbValue -Map $config -Key 'source_host' -Default ''))
    $nextDueByIndex = @{}
    for ($i = 0; $i -lt $pairs.Count; $i++) {
        $nextDueByIndex[$i] = [DateTime]::MinValue
        $pairShare = [string](Get-HbValue -Map $pairs[$i] -Key 'share' -Default '')
        $pairLocal = [string](Get-HbValue -Map $pairs[$i] -Key 'local_path' -Default '')
        Write-HbLog ('pair ' + ($i + 1) + ' ' + $pairShare + ' -> ' + $pairLocal + '; interval ' + (Get-HbPairIntervalSeconds -Pair $pairs[$i]) + 's')
    }
    while ($true) {
        if (-not (Test-HbParentAlive)) {
            Write-HbLog 'agent is gone; exiting'
            return
        }
        $pairs = Get-HbPairList -Raw (Get-HbValue -Map $config -Key 'pairs' -Default @())
        $nowUtc = [DateTime]::UtcNow
        $dueIndexes = New-Object System.Collections.ArrayList
        for ($i = 0; $i -lt $pairs.Count; $i++) {
            if (-not $nextDueByIndex.ContainsKey($i)) {
                $nextDueByIndex[$i] = [DateTime]::MinValue
            }
            if (([DateTime]$nextDueByIndex[$i]) -le $nowUtc) {
                [void]$dueIndexes.Add($i)
            }
        }
        if ($dueIndexes.Count -gt 0) {
            try {
                Invoke-HbSyncCycle -Config $config -DueIndexes @($dueIndexes.ToArray()) -NextDueByIndex $nextDueByIndex
            } catch {
                Write-HbLog ('cycle crashed: ' + (Get-HbErrorText $_)) 'ERROR'
                foreach ($i in @($dueIndexes.ToArray())) {
                    $pairInterval = 900
                    if ($i -ge 0 -and $i -lt $pairs.Count) {
                        $pairInterval = Get-HbPairIntervalSeconds -Pair $pairs[$i]
                    }
                    $nextDueByIndex[$i] = [DateTime]::UtcNow.AddSeconds($pairInterval)
                }
            }
        }
        $soonestUtc = Get-HbSoonestNextDueUtc -NextDueByIndex $nextDueByIndex -PairCount $pairs.Count
        $sleepSeconds = 60
        if ($null -ne $soonestUtc) {
            $sleepSeconds = [int][Math]::Max(1, [Math]::Ceiling(($soonestUtc - [DateTime]::UtcNow).TotalSeconds))
        }
        Write-HbLog ('next due pair check in ' + $sleepSeconds + 's')
        if (-not (Wait-HbSeconds -Seconds $sleepSeconds)) {
            Write-HbLog 'agent is gone; exiting'
            return
        }
    }
}

try {
    Start-HbDriveSync
    exit 0
} catch {
    try {
        Write-HbLog ('fatal: ' + (Get-HbErrorText $_)) 'ERROR'
    } catch {}
    exit 1
}

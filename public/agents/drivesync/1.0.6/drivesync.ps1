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
$script:ServiceVersion = '1.0.6'

# >>> HB-COMMON
# HammerByte shared helpers. scripts/build-agents.js inlines this file into every script.
# Must stay PowerShell 3.0 compatible: no classes, no ::new(), no ternary, no ?? operators.
# Only hashtables / arrays / primitives may be passed to JavaScriptSerializer.

$script:HbBaseUrl = 'https://hammerbyte.co.in'
$script:HbRoot = Join-Path $env:ProgramData 'HammerByte'
$script:HbLogDir = Join-Path $script:HbRoot 'logs'
$script:HbRunDir = Join-Path $script:HbRoot 'run'
$script:HbTagFile = Join-Path $script:HbRoot '.server-tag'
$script:HbLogName = 'agent'
$script:HbLogRetentionDays = 14
$script:HbLastLogPruneDay = ''
$script:HbJsonLoaded = $false
$script:HbInvariant = [Globalization.CultureInfo]::InvariantCulture
$script:HbUtf8NoBom = New-Object Text.UTF8Encoding($false)

# ---------------------------------------------------------------- time (IST only)

function Get-HbIstNow {
    # India has no daylight saving, so a fixed +05:30 offset is exact.
    return [DateTime]::UtcNow.AddMinutes(330)
}

function Format-HbIst {
    param([DateTime]$Utc)
    return $Utc.AddMinutes(330).ToString('yyyy-MM-dd HH:mm:ss', $script:HbInvariant) + ' IST'
}

function Get-HbIstStamp {
    return Format-HbIst -Utc ([DateTime]::UtcNow)
}

# ---------------------------------------------------------------- logging

function Remove-HbOldLogs {
    try {
        $cutoff = [DateTime]::UtcNow.AddDays(-$script:HbLogRetentionDays)
        $pattern = $script:HbLogName + '-*.log'
        foreach ($file in @(Get-ChildItem -LiteralPath $script:HbLogDir -Filter $pattern -ErrorAction SilentlyContinue)) {
            if ($file.LastWriteTimeUtc -lt $cutoff) {
                Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

function Write-HbLog {
    param(
        [string]$Message,
        [string]$Level = 'INFO'
    )
    $ist = Get-HbIstNow
    $day = $ist.ToString('yyyy-MM-dd', $script:HbInvariant)
    $line = '[' + $ist.ToString('yyyy-MM-dd HH:mm:ss', $script:HbInvariant) + ' IST] [' + $Level + '] [' + $script:HbLogName + ':' + $PID + '] ' + $Message
    $file = Join-Path $script:HbLogDir ($script:HbLogName + '-' + $day + '.log')
    $bytes = $script:HbUtf8NoBom.GetBytes($line + "`r`n")
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        try {
            if (-not [IO.Directory]::Exists($script:HbLogDir)) {
                [void][IO.Directory]::CreateDirectory($script:HbLogDir)
            }
            $stream = New-Object IO.FileStream($file, [IO.FileMode]::Append, [IO.FileAccess]::Write, [IO.FileShare]::ReadWrite)
            try {
                $stream.Write($bytes, 0, $bytes.Length)
            } finally {
                $stream.Dispose()
            }
            break
        } catch {
            Start-Sleep -Milliseconds 100
        }
    }
    if ($day -ne $script:HbLastLogPruneDay) {
        $script:HbLastLogPruneDay = $day
        Remove-HbOldLogs
    }
}

function Get-HbErrorText {
    param($ErrorRecord)
    try {
        $ex = $ErrorRecord.Exception
        while ($null -ne $ex.InnerException -and $ex -is [System.Management.Automation.MethodInvocationException]) {
            $ex = $ex.InnerException
        }
        $text = [string]$ex.Message
        if ($ErrorRecord.InvocationInfo -and $ErrorRecord.InvocationInfo.ScriptLineNumber) {
            $text = $text + ' (line ' + $ErrorRecord.InvocationInfo.ScriptLineNumber + ')'
        }
        return $text
    } catch {
        return [string]$ErrorRecord
    }
}

function Get-HbInnerException {
    param($Exception, [Type]$Type)
    $ex = $Exception
    while ($null -ne $ex) {
        if ($ex -is $Type) {
            return $ex
        }
        $ex = $ex.InnerException
    }
    return $null
}

# ---------------------------------------------------------------- JSON

function Initialize-HbJson {
    if (-not $script:HbJsonLoaded) {
        Add-Type -AssemblyName System.Web.Extensions
        $script:HbJsonLoaded = $true
    }
}

function New-HbSerializer {
    Initialize-HbJson
    $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $serializer.MaxJsonLength = [int]::MaxValue
    $serializer.RecursionLimit = 100
    return $serializer
}

function ConvertTo-HbPlain {
    # Rebuilds any value as hashtables / object[] / primitives so the serializer never sees PSObject members.
    param($Value, [int]$Depth = 0)
    if ($null -eq $Value) {
        return $null
    }
    if ($Depth -gt 32) {
        return [string]$Value
    }
    if ($Value -is [System.Management.Automation.PSObject] -and -not ($Value -is [System.Management.Automation.PSCustomObject])) {
        $Value = $Value.PSObject.BaseObject
    }
    if ($Value -is [string]) {
        return [string]$Value
    }
    if ($Value -is [bool]) {
        return [bool]$Value
    }
    if ($Value -is [char] -or $Value -is [Enum] -or $Value -is [Guid]) {
        return $Value.ToString()
    }
    if ($Value -is [DateTime]) {
        return Format-HbIst -Utc $Value.ToUniversalTime()
    }
    if ($Value -is [double] -or $Value -is [single]) {
        $number = [double]$Value
        if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) {
            return $null
        }
        return $number
    }
    if ($Value -is [int] -or $Value -is [long] -or $Value -is [decimal] -or $Value -is [byte] -or
        $Value -is [int16] -or $Value -is [uint16] -or $Value -is [uint32] -or $Value -is [uint64] -or $Value -is [sbyte]) {
        return $Value
    }
    if ($Value -is [System.Collections.IDictionary]) {
        $table = @{}
        foreach ($key in @($Value.Keys)) {
            $table[[string]$key] = ConvertTo-HbPlain -Value $Value[$key] -Depth ($Depth + 1)
        }
        return $table
    }
    if ($Value -is [System.Management.Automation.PSCustomObject]) {
        $table = @{}
        foreach ($property in $Value.PSObject.Properties) {
            $table[[string]$property.Name] = ConvertTo-HbPlain -Value $property.Value -Depth ($Depth + 1)
        }
        return $table
    }
    if ($Value -is [System.Collections.IEnumerable]) {
        $list = New-Object System.Collections.ArrayList
        foreach ($item in $Value) {
            [void]$list.Add((ConvertTo-HbPlain -Value $item -Depth ($Depth + 1)))
        }
        return ,($list.ToArray())
    }
    return [string]$Value
}

function ConvertTo-HbJson {
    param($Value)
    $serializer = New-HbSerializer
    $plain = ConvertTo-HbPlain -Value $Value
    return $serializer.Serialize($plain)
}

function ConvertFrom-HbJson {
    # DeserializeObject returns Dictionary[string,object]; PowerShell cannot call .Contains on that
    # type (explicit IDictionary only). Convert to hashtables / object[] so callers can use
    # ContainsKey / foreach Keys / Get-HbValue uniformly.
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) {
        return $null
    }
    $serializer = New-HbSerializer
    $value = $serializer.DeserializeObject($Text)
    return ,(ConvertTo-HbPlain -Value $value)
}

function Test-HbMapHasKey {
    param($Map, [string]$Key)
    if ($null -eq $Map -or -not ($Map -is [System.Collections.IDictionary])) {
        return $false
    }
    # Hashtable has ContainsKey; Dictionary[string,*] only exposes Contains via IDictionary.
    if ($Map -is [hashtable]) {
        return $Map.ContainsKey($Key)
    }
    return ([System.Collections.IDictionary]$Map).Contains($Key)
}

function Get-HbValue {
    param($Map, [string]$Key, $Default = $null)
    $value = $Default
    if ((Test-HbMapHasKey -Map $Map -Key $Key) -and $null -ne $Map[$Key]) {
        $value = $Map[$Key]
    }
    # The leading comma stops PowerShell from unrolling arrays (empty arrays would become $null).
    return ,$value
}

function Get-HbBool {
    param($Map, [string]$Key)
    $value = Get-HbValue -Map $Map -Key $Key -Default $false
    if ($value -is [bool]) {
        return $value
    }
    return ([string]$value) -eq 'true' -or ([string]$value) -eq '1'
}

function Get-HbInt {
    param($Map, [string]$Key, [int]$Default, [int]$Min, [int]$Max)
    $value = Get-HbValue -Map $Map -Key $Key -Default $Default
    $number = 0
    if (-not [int]::TryParse([string]$value, [ref]$number)) {
        return $Default
    }
    if ($number -lt $Min) {
        return $Min
    }
    if ($number -gt $Max) {
        return $Max
    }
    return $number
}

# ---------------------------------------------------------------- files

function Write-HbTextFile {
    param([string]$Path, [string]$Text)
    $dir = [IO.Path]::GetDirectoryName($Path)
    if (-not [IO.Directory]::Exists($dir)) {
        [void][IO.Directory]::CreateDirectory($dir)
    }
    $temp = $Path + '.tmp'
    [IO.File]::WriteAllText($temp, $Text, $script:HbUtf8NoBom)
    if ([IO.File]::Exists($Path)) {
        [IO.File]::Delete($Path)
    }
    [IO.File]::Move($temp, $Path)
}

function Write-HbJsonFile {
    param([string]$Path, $Value)
    Write-HbTextFile -Path $Path -Text (ConvertTo-HbJson -Value $Value)
}

function Read-HbJsonFile {
    param([string]$Path)
    try {
        if (-not [IO.File]::Exists($Path)) {
            return $null
        }
        $text = [IO.File]::ReadAllText($Path, $script:HbUtf8NoBom)
        $value = ConvertFrom-HbJson -Text $text
        return ,$value
    } catch {
        return $null
    }
}

function Get-HbSha256 {
    param([string]$Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Path)
    try {
        $hash = $sha.ComputeHash($stream)
    } finally {
        $stream.Dispose()
        $sha.Clear()
    }
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLowerInvariant()
}

function Get-HbTag {
    try {
        if ([IO.File]::Exists($script:HbTagFile)) {
            $tag = ([IO.File]::ReadAllText($script:HbTagFile)).Trim()
            if ($tag -match '^[A-Za-z0-9._-]{6,64}$') {
                return $tag
            }
        }
    } catch {}
    return $null
}

# ---------------------------------------------------------------- HTTP

function Initialize-HbTls {
    try {
        $current = [int][Net.ServicePointManager]::SecurityProtocol
        [Net.ServicePointManager]::SecurityProtocol = [Enum]::ToObject([Net.SecurityProtocolType], ($current -bor 3072))
    } catch {}
    try {
        [Net.ServicePointManager]::Expect100Continue = $false
    } catch {}
}

function Resolve-HbUrl {
    param([string]$Path)
    if ($Path -match '^https?://') {
        return $Path
    }
    return $script:HbBaseUrl.TrimEnd('/') + '/' + $Path.TrimStart('/')
}

function New-HbRequest {
    param([string]$Method, [string]$Path, [hashtable]$Headers, [int]$TimeoutSec)
    Initialize-HbTls
    $request = [Net.HttpWebRequest]([Net.WebRequest]::Create((Resolve-HbUrl -Path $Path)))
    $request.Method = $Method
    $request.Timeout = $TimeoutSec * 1000
    $request.ReadWriteTimeout = $TimeoutSec * 1000
    $request.UserAgent = 'HammerByteAgent'
    $request.KeepAlive = $false
    $request.AllowAutoRedirect = $true
    if ($null -ne $Headers) {
        foreach ($key in @($Headers.Keys)) {
            $request.Headers[[string]$key] = [string]$Headers[$key]
        }
    }
    return $request
}

function Get-HbResponse {
    # Returns the response even for 4xx/5xx; throws only on transport failure.
    param($Request)
    try {
        return $Request.GetResponse()
    } catch {
        $webError = Get-HbInnerException -Exception $_.Exception -Type ([Net.WebException])
        if ($null -ne $webError -and $null -ne $webError.Response) {
            return $webError.Response
        }
        throw
    }
}

function Invoke-HbHttp {
    param(
        [string]$Method = 'GET',
        [string]$Path,
        $Body = $null,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = 30
    )
    $request = New-HbRequest -Method $Method -Path $Path -Headers $Headers -TimeoutSec $TimeoutSec
    $request.Accept = 'application/json'
    if ($null -ne $Body) {
        $bytes = $script:HbUtf8NoBom.GetBytes((ConvertTo-HbJson -Value $Body))
        $request.ContentType = 'application/json; charset=utf-8'
        $request.ContentLength = $bytes.Length
        $requestStream = $request.GetRequestStream()
        try {
            $requestStream.Write($bytes, 0, $bytes.Length)
        } finally {
            $requestStream.Dispose()
        }
    }
    $response = Get-HbResponse -Request $request
    try {
        $status = [int]$response.StatusCode
        $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
        try {
            $text = $reader.ReadToEnd()
        } finally {
            $reader.Dispose()
        }
    } finally {
        $response.Close()
    }
    return @{ status = $status; text = $text }
}

function Save-HbFile {
    # Downloads to a temp file, verifies sha256, then moves into place.
    param([string]$Path, [string]$Destination, [string]$Sha256, [int]$TimeoutSec = 120)
    $dir = [IO.Path]::GetDirectoryName($Destination)
    if (-not [IO.Directory]::Exists($dir)) {
        [void][IO.Directory]::CreateDirectory($dir)
    }
    $temp = $Destination + '.download'
    $request = New-HbRequest -Method 'GET' -Path $Path -Headers @{} -TimeoutSec $TimeoutSec
    $response = Get-HbResponse -Request $request
    try {
        $status = [int]$response.StatusCode
        if ($status -ne 200) {
            throw ('download failed: HTTP ' + $status + ' for ' + $Path)
        }
        $source = $response.GetResponseStream()
        $target = [IO.File]::Create($temp)
        try {
            $buffer = New-Object byte[] 65536
            while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $target.Write($buffer, 0, $read)
            }
        } finally {
            $target.Dispose()
            $source.Dispose()
        }
    } finally {
        $response.Close()
    }
    $actual = Get-HbSha256 -Path $temp
    if ($actual -ne $Sha256.ToLowerInvariant()) {
        [IO.File]::Delete($temp)
        throw ('sha256 mismatch for ' + $Path + ': expected ' + $Sha256 + ' got ' + $actual)
    }
    if ([IO.File]::Exists($Destination)) {
        [IO.File]::Delete($Destination)
    }
    [IO.File]::Move($temp, $Destination)
}

# ---------------------------------------------------------------- processes / platform

function Get-HbProcessStartUtc {
    param([int]$Id)
    try {
        $process = [Diagnostics.Process]::GetProcessById($Id)
        if ($process.HasExited) {
            return $null
        }
        return $process.StartTime.ToUniversalTime()
    } catch {
        return $null
    }
}

function Stop-HbProcessTree {
    param([int]$Id)
    if ($Id -le 0) {
        return
    }
    $exe = Join-Path $env:SystemRoot 'System32\taskkill.exe'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $null = & $exe /PID $Id /T /F 2>&1
    } catch {
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Get-HbPlatformFamily {
    param([int]$Build, [bool]$IsServer)
    if ($IsServer) {
        if ($Build -ge 26100) { return 'server2025' }
        if ($Build -ge 20348) { return 'server2022' }
        if ($Build -ge 17763) { return 'server2019' }
        if ($Build -ge 14393) { return 'server2016' }
        if ($Build -ge 9600) { return 'server2012r2' }
        if ($Build -ge 9200) { return 'server2012' }
        return 'server-legacy'
    }
    if ($Build -ge 22000) { return 'win11' }
    if ($Build -ge 10240) { return 'win10' }
    if ($Build -ge 9200) { return 'win8' }
    return 'client-legacy'
}

function Get-HbPlatform {
    $info = @{
        hostname = [string]$env:COMPUTERNAME
        os_caption = $null
        os_build = $null
        ps_version = $PSVersionTable.PSVersion.ToString()
        clr_version = [Environment]::Version.ToString()
        arch = [string]$env:PROCESSOR_ARCHITECTURE
        family = 'unknown'
        is_server = $false
    }
    try {
        $os = Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop
        $build = 0
        [void][int]::TryParse([string]$os.BuildNumber, [ref]$build)
        $isServer = ([int]$os.ProductType) -ne 1
        $info.os_caption = ([string]$os.Caption).Trim()
        $info.os_build = [string]$os.BuildNumber
        $info.is_server = $isServer
        $info.family = Get-HbPlatformFamily -Build $build -IsServer $isServer
    } catch {}
    return $info
}

# ---------------------------------------------------------------- service child helpers

$script:HbServiceName = ''
$script:HbServiceVersion = ''
$script:HbConfigVersion = 0
$script:HbConfig = $null
$script:HbTag = $null
$script:HbParentPid = 0
$script:HbParentStartUtc = $null

function Initialize-HbService {
    param([string]$Name, [string]$Version, [string]$ConfigFile, [int]$ParentPid)
    $script:HbLogName = $Name
    $script:HbServiceName = $Name
    $script:HbServiceVersion = $Version
    $script:HbParentPid = $ParentPid
    $script:HbParentStartUtc = Get-HbProcessStartUtc -Id $ParentPid
    if ($null -eq $script:HbParentStartUtc) {
        throw ('parent agent process ' + $ParentPid + ' is not running')
    }
    $document = Read-HbJsonFile -Path $ConfigFile
    if ($null -eq $document) {
        throw ('config file missing or unreadable: ' + $ConfigFile)
    }
    $script:HbTag = [string](Get-HbValue -Map $document -Key 'tag' -Default '')
    if (-not $script:HbTag) {
        throw 'config file has no tag'
    }
    $script:HbConfigVersion = [int](Get-HbValue -Map $document -Key 'config_version' -Default 0)
    $script:HbConfig = Get-HbValue -Map $document -Key 'config' -Default @{}
    Write-HbLog ('started ' + $Name + ' v' + $Version + ' config v' + $script:HbConfigVersion + ' (agent pid ' + $ParentPid + ')')
}

function Test-HbParentAlive {
    $startUtc = Get-HbProcessStartUtc -Id $script:HbParentPid
    if ($null -eq $startUtc) {
        return $false
    }
    return [Math]::Abs(($startUtc - $script:HbParentStartUtc).TotalSeconds) -lt 2
}

function Wait-HbSeconds {
    # Sleeps in short slices; returns $false as soon as the agent is gone.
    param([int]$Seconds)
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (-not (Test-HbParentAlive)) {
            return $false
        }
        $remaining = ($deadline - [DateTime]::UtcNow).TotalMilliseconds
        Start-Sleep -Milliseconds ([int][Math]::Max(100, [Math]::Min(5000, $remaining)))
    }
    return (Test-HbParentAlive)
}

function Send-HbResult {
    param([string]$Type, [hashtable]$Data = @{})
    $body = @{}
    foreach ($key in @($Data.Keys)) {
        $body[$key] = $Data[$key]
    }
    $body['service'] = $script:HbServiceName
    $body['type'] = $Type
    $body['script_version'] = $script:HbServiceVersion
    $body['config_version'] = $script:HbConfigVersion
    $body['hostname'] = [string]$env:COMPUTERNAME
    $body['sent_at_ist'] = Get-HbIstStamp
    try {
        $response = Invoke-HbHttp -Method 'POST' -Path '/api/servers/metrics' -Body $body -Headers @{ 'X-Server-Tag' = $script:HbTag } -TimeoutSec 60
        if ($response.status -ne 200) {
            $snippet = [string]$response.text
            if ($snippet.Length -gt 200) {
                $snippet = $snippet.Substring(0, 200)
            }
            Write-HbLog ('send ' + $Type + ' rejected: HTTP ' + $response.status + ' ' + $snippet) 'WARN'
            return $false
        }
        return $true
    } catch {
        Write-HbLog ('send ' + $Type + ' failed: ' + (Get-HbErrorText $_)) 'WARN'
        return $false
    }
}
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

function Invoke-HbPairSync {
    param(
        [string]$SourceHost,
        $Pair,
        [int]$SkipLogMax,
        $State,
        [int]$Index,
        [string[]]$ExcludeDirs,
        [string[]]$ExcludeFiles
    )
    $share = [string](Get-HbValue -Map $Pair -Key 'share' -Default '')
    $destination = Get-HbNormalizedLocalPath -Path ([string](Get-HbValue -Map $Pair -Key 'local_path' -Default ''))
    $source = '\\' + $SourceHost + '\' + $share
    $result = New-HbPairResult -Share $share -Source $source -Destination $destination
    $started = [DateTime]::UtcNow
    Write-HbLog ('pair ' + ($Index + 1) + ': ' + $source + ' -> ' + $destination)
    if ($ExcludeDirs -and $ExcludeDirs.Count -gt 0) {
        Write-HbLog ('pair ' + ($Index + 1) + ' exclude dirs (/XD): ' + ($ExcludeDirs -join ', '))
    }
    if ($ExcludeFiles -and $ExcludeFiles.Count -gt 0) {
        Write-HbLog ('pair ' + ($Index + 1) + ' exclude files (/XF): ' + ($ExcludeFiles -join ', '))
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
        $arguments = @($source, $destination, '/E', '/PURGE', '/COPY:DAT', '/DCOPY:T', '/R:1', '/W:1', '/XJ', '/FFT', '/Z', '/V', '/FP', '/BYTES', '/NP', '/NJH', ('/UNILOG:' + $logPath))
        if ($ExcludeDirs -and $ExcludeDirs.Count -gt 0) {
            $arguments += '/XD'
            $arguments += $ExcludeDirs
        }
        if ($ExcludeFiles -and $ExcludeFiles.Count -gt 0) {
            $arguments += '/XF'
            $arguments += $ExcludeFiles
        }
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

function Invoke-HbSyncCycle {
    param($Config)
    $sourceHost = [string](Get-HbValue -Map $Config -Key 'source_host' -Default '')
    $user = [string](Get-HbValue -Map $Config -Key 'username' -Default '')
    $password = [string](Get-HbValue -Map $Config -Key 'password' -Default '')
    $pairs = Get-HbValue -Map $Config -Key 'pairs' -Default @()
    $pairs = @($pairs)
    $skipLogMax = Get-HbInt -Map $Config -Key 'skip_log_max' -Default 500 -Min 0 -Max 5000
    $serviceExcludeDirs = @(Get-HbValue -Map $Config -Key 'exclude_dirs' -Default @())
    $serviceExcludeFiles = @(Get-HbValue -Map $Config -Key 'exclude_files' -Default @())
    $cycleExcludeDirs = Get-HbMergedExcludes -BuiltIn $script:ExcludedDirs -UserList $serviceExcludeDirs
    $cycleExcludeFiles = Get-HbMergedExcludes -BuiltIn $script:ExcludedFiles -UserList $serviceExcludeFiles

    $intervalSeconds = Get-HbInt -Map $Config -Key 'interval_seconds' -Default 900 -Min 60 -Max 86400
    $startedUtc = [DateTime]::UtcNow
    $state = @{ events = (New-Object System.Collections.ArrayList); event_count = 0 }
    $pairResults = @()
    $cycleError = $null

    $pairSummaries = New-Object System.Collections.ArrayList
    foreach ($pair in $pairs) {
        $shareName = [string](Get-HbValue -Map $pair -Key 'share' -Default '')
        $localPath = [string](Get-HbValue -Map $pair -Key 'local_path' -Default '')
        $null = $pairSummaries.Add(@{
            share = $shareName
            local_path = $localPath
            source = ('\\' + $sourceHost + '\' + $shareName)
            destination = $localPath
        })
    }

    Write-HbLog ('sync cycle started: ' + $pairs.Count + ' pair(s) from ' + $sourceHost)
    if ($cycleExcludeDirs.Count -gt 0) {
        Write-HbLog ('service-wide exclude dirs (/XD): ' + ($cycleExcludeDirs -join ', '))
    }
    if ($cycleExcludeFiles.Count -gt 0) {
        Write-HbLog ('service-wide exclude files (/XF): ' + ($cycleExcludeFiles -join ', '))
    }
    $null = Send-HbResult -Type 'heartbeat' -Data @{}
    $null = Send-HbResult -Type 'sync_start' -Data @{
        source_host = $sourceHost
        started_at_ist = (Format-HbIst -Utc $startedUtc)
        interval_seconds = $intervalSeconds
        pair_count = $pairs.Count
        pairs = $pairSummaries.ToArray()
        exclude_dirs = $cycleExcludeDirs
        exclude_files = $cycleExcludeFiles
    }
    try {
        Connect-HbSource -SourceHost $sourceHost -User $user -Password $password
        Write-HbLog ('connected to \\' + $sourceHost + ' as ' + $user)
        for ($i = 0; $i -lt $pairs.Count; $i++) {
            if (-not (Test-HbParentAlive)) {
                throw 'agent stopped during sync'
            }
            $pair = $pairs[$i]
            $pairExcludeDirs = Get-HbMergedExcludes -BuiltIn $script:ExcludedDirs -UserList (@($serviceExcludeDirs) + @(Get-HbValue -Map $pair -Key 'exclude_dirs' -Default @()))
            $pairExcludeFiles = Get-HbMergedExcludes -BuiltIn $script:ExcludedFiles -UserList (@($serviceExcludeFiles) + @(Get-HbValue -Map $pair -Key 'exclude_files' -Default @()))
            $pairResults += (Invoke-HbPairSync -SourceHost $sourceHost -Pair $pair -SkipLogMax $skipLogMax -State $state -Index $i -ExcludeDirs $pairExcludeDirs -ExcludeFiles $pairExcludeFiles)
        }
    } catch {
        $cycleError = Get-HbErrorText $_
        Write-HbLog ('sync cycle failed: ' + $cycleError) 'ERROR'
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
    $nextRunUtc = $finishedUtc.AddSeconds($intervalSeconds)
    $seen = [long]$totals.copied + [long]$totals.skipped + [long]$totals.purged + [long]$totals.failed + [long]$totals.mismatched
    $report = @{
        status = $status
        source_host = $sourceHost
        started_at_ist = (Format-HbIst -Utc $startedUtc)
        finished_at_ist = (Format-HbIst -Utc $finishedUtc)
        duration_seconds = [int]($finishedUtc - $startedUtc).TotalSeconds
        interval_seconds = $intervalSeconds
        next_run_at_ist = (Format-HbIst -Utc $nextRunUtc)
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
    $interval = Get-HbInt -Map $config -Key 'interval_seconds' -Default 900 -Min 60 -Max 86400
    Write-HbLog ('interval ' + $interval + 's between cycles; source ' + [string](Get-HbValue -Map $config -Key 'source_host' -Default ''))
    while ($true) {
        if (-not (Test-HbParentAlive)) {
            Write-HbLog 'agent is gone; exiting'
            return
        }
        try {
            Invoke-HbSyncCycle -Config $config
        } catch {
            Write-HbLog ('cycle crashed: ' + (Get-HbErrorText $_)) 'ERROR'
        }
        Write-HbLog ('next cycle in ' + $interval + 's')
        if (-not (Wait-HbSeconds -Seconds $interval)) {
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

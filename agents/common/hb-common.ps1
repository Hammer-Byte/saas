# HammerByte shared helpers. scripts/build-agents.js inlines this file into every script.
# Must stay PowerShell 3.0 compatible: no classes, no ::new(), no ternary, no ?? operators.
# Only hashtables / arrays / primitives may be passed to JavaScriptSerializer.

$script:HbBaseUrl = '__HB_BASE_URL__'
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

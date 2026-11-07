#Requires -Version 3.0
<#
.SYNOPSIS
  HammerByte Server Agent (Windows Server 2012+ PowerShell)
  Collects metrics twice (900s apart), then exits for supervisor refresh.
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$Tag
)

$ErrorActionPreference = "Continue"
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    [Net.ServicePointManager]::SecurityProtocol = [Enum]::ToObject([Net.SecurityProtocolType], 3072)
}

$HostUrl = "https://hammerbyte.co.in"
$MetricsUrl = "$HostUrl/api/servers/metrics"
$MetricsIntervalSeconds = 900
$SendsPerRun = 2
$AgentVersion = "0.3.0-ps"
$InstallDir = Join-Path $env:ProgramData "HammerByte\ServerMonitor"
$AgentLogFile = Join-Path $InstallDir "agent.log"

function Write-AgentLog {
    param([string]$Message)
    $stamp = (Get-Date).ToUniversalTime().ToString("o")
    $line = "[agent $stamp] $Message"
    Write-Host $line
    try {
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        Add-Content -Path $AgentLogFile -Value $line -Encoding UTF8
    } catch {}
}

function New-EmptyPayload {
    param([string]$CollectionError = $null)
    return @{
        type = "metrics"
        agent_version = $AgentVersion
        hostname = $env:COMPUTERNAME
        pid = $PID
        platform = "win32"
        arch = $env:PROCESSOR_ARCHITECTURE
        os_type = "Windows_NT"
        os_release = $null
        uptime_seconds = $null
        loadavg = @(0, 0, 0)
        cpu_count = $null
        processor = @{
            name = $null; packages = $null; core_count = $null; logical_count = $null
            max_clock_mhz = $null; load_percent_wmi = $null; usage_percent = $null
        }
        memory = @{
            total_mb = $null; free_mb = $null; used_mb = $null; used_percent = $null
        }
        processes = @{ total = $null; top_cpu = @(); top_memory = @() }
        services = @{ total = $null; running = $null; stopped = $null }
        disks = @()
        os = $null
        hardware = $null
        temperatures = @{ available = $false; celsius_max = $null; zones = @() }
        collected_at = (Get-Date).ToUniversalTime().ToString("o")
        collection_error = $CollectionError
    }
}

function Get-Rounded {
    param($Value, [int]$Digits = 1)
    if ($null -eq $Value) { return $null }
    try { return [math]::Round([double]$Value, $Digits) } catch { return $null }
}

function Get-CpuUsagePercent {
    try {
        $samples = @(Get-WmiObject Win32_PerfFormattedData_PerfOS_Processor -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -eq "_Total" })
        if ($samples.Count -gt 0) {
            return Get-Rounded (100 - [double]$samples[0].PercentIdleTime) 1
        }
    } catch {}
    try {
        $load = Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue |
            Measure-Object -Property LoadPercentage -Average
        if ($null -ne $load.Average) { return Get-Rounded $load.Average 1 }
    } catch {}
    return $null
}

function Get-Temperatures {
    $zones = @()
    try {
        $thermal = @(Get-WmiObject -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue)
        foreach ($item in $thermal) {
            try {
                $celsius = Get-Rounded (($item.CurrentTemperature / 10.0) - 273.15) 1
                if ($null -eq $celsius) { continue }
                $zones += @{
                    name = [string]$item.InstanceName
                    celsius = $celsius
                }
            } catch {}
        }
    } catch {}

    if ($zones.Count -eq 0) {
        return @{ available = $false; celsius_max = $null; zones = @() }
    }
    $max = ($zones | Measure-Object -Property celsius -Maximum).Maximum
    return @{ available = $true; celsius_max = $max; zones = $zones }
}

function Collect-Metrics {
    $os = $null
    $cs = $null
    $bios = $null
    $board = $null
    $procs = @()
    $disks = @()
    $services = @()
    $processList = @()
    $perf = $null

    try { $os = Get-WmiObject Win32_OperatingSystem -ErrorAction SilentlyContinue } catch {}
    try { $cs = Get-WmiObject Win32_ComputerSystem -ErrorAction SilentlyContinue } catch {}
    try { $bios = Get-WmiObject Win32_BIOS -ErrorAction SilentlyContinue } catch {}
    try { $board = Get-WmiObject Win32_BaseBoard -ErrorAction SilentlyContinue } catch {}
    try { $procs = @(Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue) } catch {}
    try { $disks = @(Get-WmiObject Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue) } catch {}
    try { $services = @(Get-Service -ErrorAction SilentlyContinue) } catch {}
    try { $processList = @(Get-Process -ErrorAction SilentlyContinue) } catch {}
    try { $perf = Get-WmiObject Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue } catch {}

    $processorName = $null
    $coreCount = $null
    $logicalCount = $null
    $maxClock = $null
    $loadWmi = $null
    if ($procs.Count -gt 0) {
        $processorName = [string]$procs[0].Name
        $coreCount = ($procs | Measure-Object -Property NumberOfCores -Sum).Sum
        $logicalCount = ($procs | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
        $maxClock = ($procs | Measure-Object -Property MaxClockSpeed -Maximum).Maximum
        $loadWmi = Get-Rounded (($procs | Measure-Object -Property LoadPercentage -Average).Average) 1
    }

    $totalMb = $null
    $freeMb = $null
    if ($os) {
        $totalMb = Get-Rounded (([double]$os.TotalVisibleMemorySize) / 1024.0) 1
        $freeMb = Get-Rounded (([double]$os.FreePhysicalMemory) / 1024.0) 1
    }
    $usedMb = $null
    $usedPct = $null
    if (($null -ne $totalMb) -and ($null -ne $freeMb)) {
        $usedMb = Get-Rounded ($totalMb - $freeMb) 1
        if ($totalMb -gt 0) { $usedPct = Get-Rounded ((($totalMb - $freeMb) / $totalMb) * 100) 1 }
    }

    $topCpu = @()
    $topMemory = @()
    try {
        $topCpu = @(
            $processList | Sort-Object CPU -Descending | Select-Object -First 5 | ForEach-Object {
                @{
                    name = $_.ProcessName
                    pid = $_.Id
                    cpu_seconds = if ($null -eq $_.CPU) { $null } else { Get-Rounded $_.CPU 1 }
                    memory_mb = Get-Rounded ($_.WorkingSet64 / 1MB) 1
                }
            }
        )
        $topMemory = @(
            $processList | Sort-Object WorkingSet64 -Descending | Select-Object -First 5 | ForEach-Object {
                @{
                    name = $_.ProcessName
                    pid = $_.Id
                    memory_mb = Get-Rounded ($_.WorkingSet64 / 1MB) 1
                    cpu_seconds = if ($null -eq $_.CPU) { $null } else { Get-Rounded $_.CPU 1 }
                }
            }
        )
    } catch {}

    $diskRows = @()
    foreach ($disk in $disks) {
        try {
            $total = [double]$disk.Size
            $free = [double]$disk.FreeSpace
            $usedDiskPct = $null
            if ($total -gt 0) { $usedDiskPct = Get-Rounded ((($total - $free) / $total) * 100) 1 }
            $diskRows += @{
                device = $disk.DeviceID
                label = $disk.VolumeName
                filesystem = $disk.FileSystem
                total_mb = Get-Rounded ($total / 1MB) 1
                free_mb = Get-Rounded ($free / 1MB) 1
                used_percent = $usedDiskPct
            }
        } catch {}
    }

    $uptimeSeconds = $null
    if ($os -and $os.LastBootUpTime) {
        try {
            $boot = [Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)
            $uptimeSeconds = [int]((Get-Date) - $boot).TotalSeconds
        } catch {}
    }

    $installDate = $null
    $lastBoot = $null
    if ($os -and $os.InstallDate) {
        try { $installDate = ([Management.ManagementDateTimeConverter]::ToDateTime($os.InstallDate)).ToString("o") } catch {}
    }
    if ($os -and $os.LastBootUpTime) {
        try { $lastBoot = ([Management.ManagementDateTimeConverter]::ToDateTime($os.LastBootUpTime)).ToString("o") } catch {}
    }

    return @{
        type = "metrics"
        agent_version = $AgentVersion
        hostname = $env:COMPUTERNAME
        pid = $PID
        platform = "win32"
        arch = $env:PROCESSOR_ARCHITECTURE
        os_type = "Windows_NT"
        os_release = if ($os) { [string]$os.Version } else { $null }
        uptime_seconds = $uptimeSeconds
        loadavg = @(0, 0, 0)
        cpu_count = $logicalCount
        processor = @{
            name = $processorName
            packages = $procs.Count
            core_count = $coreCount
            logical_count = $logicalCount
            max_clock_mhz = $maxClock
            load_percent_wmi = $loadWmi
            usage_percent = Get-CpuUsagePercent
        }
        memory = @{
            total_mb = $totalMb
            free_mb = $freeMb
            used_mb = $usedMb
            used_percent = $usedPct
            available_mb = if ($perf) { Get-Rounded $perf.AvailableMBytes 1 } else { $null }
            committed_mb = if ($perf) { Get-Rounded ($perf.CommittedBytes / 1MB) 1 } else { $null }
            pool_paged_mb = if ($perf) { Get-Rounded ($perf.PoolPagedBytes / 1MB) 1 } else { $null }
            pool_nonpaged_mb = if ($perf) { Get-Rounded ($perf.PoolNonpagedBytes / 1MB) 1 } else { $null }
        }
        processes = @{
            total = $processList.Count
            top_cpu = $topCpu
            top_memory = $topMemory
        }
        services = @{
            total = $services.Count
            running = @($services | Where-Object { $_.Status -eq "Running" }).Count
            stopped = @($services | Where-Object { $_.Status -eq "Stopped" }).Count
        }
        disks = $diskRows
        os = if ($os) {
            @{
                caption = $os.Caption
                version = $os.Version
                build = $os.BuildNumber
                architecture = $os.OSArchitecture
                install_date = $installDate
                last_boot = $lastBoot
            }
        } else { $null }
        hardware = @{
            manufacturer = if ($cs) { $cs.Manufacturer } else { $null }
            model = if ($cs) { $cs.Model } else { $null }
            domain = if ($cs) { $cs.Domain } else { $null }
            bios_version = if ($bios) { $bios.SMBIOSBIOSVersion } else { $null }
            serial_number = if ($bios) { $bios.SerialNumber } else { $null }
            baseboard_product = if ($board) { $board.Product } else { $null }
        }
        temperatures = Get-Temperatures
        collected_at = (Get-Date).ToUniversalTime().ToString("o")
        collection_error = $null
    }
}

function Send-Metrics {
    param([string]$ServerTag)
    $payload = $null
    try {
        $payload = Collect-Metrics
    } catch {
        Write-AgentLog ("collectMetrics failed: {0}" -f $_.Exception.Message)
        $payload = New-EmptyPayload -CollectionError $_.Exception.Message
    }

    try {
        Write-AgentLog ("cpu {0}% | ram {1}% | processes {2}" -f `
            $payload.processor.usage_percent, $payload.memory.used_percent, $payload.processes.total)
        if ($payload.temperatures -and $payload.temperatures.available) {
            Write-AgentLog ("temperatures max {0}°C" -f $payload.temperatures.celsius_max)
        }
        if ($payload.collection_error) {
            Write-AgentLog ("collection warning: {0}" -f $payload.collection_error)
        }
        Write-AgentLog "health check done"

        $json = $payload | ConvertTo-Json -Compress -Depth 8
        $webClient = New-Object System.Net.WebClient
        try {
            $webClient.Headers["Content-Type"] = "application/json"
            $webClient.Headers["X-Server-Tag"] = $ServerTag
            $null = $webClient.UploadString($MetricsUrl, "POST", $json)
        } finally {
            $webClient.Dispose()
        }
        Write-AgentLog "health check sent"
        return $true
    } catch {
        Write-AgentLog ("failed to connect: {0}" -f $_.Exception.Message)
        return $false
    }
}

Write-AgentLog ("host {0}" -f $HostUrl)
Write-AgentLog ("tag {0}" -f $Tag)
Write-AgentLog ("frequency {0}s ({1} sends then exit)" -f $MetricsIntervalSeconds, $SendsPerRun)
Write-AgentLog "collecting metrics now..."

for ($i = 1; $i -le $SendsPerRun; $i++) {
    Write-AgentLog ("send {0}/{1} starting" -f $i, $SendsPerRun)
    try {
        Send-Metrics -ServerTag $Tag | Out-Null
    } catch {
        Write-AgentLog ("send cycle failed: {0}" -f $_.Exception.Message)
    }
    if ($i -lt $SendsPerRun) {
        Write-AgentLog ("waiting {0}s before next send (this is normal)" -f $MetricsIntervalSeconds)
        Start-Sleep -Seconds $MetricsIntervalSeconds
    }
}

Write-AgentLog "send cycle complete; exiting for supervisor agent refresh"
exit 0

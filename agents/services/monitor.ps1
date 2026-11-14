#Requires -Version 3.0
<#
    HammerByte Monitor service. Started and stopped by the HammerByte Agent; do not run by hand.
    Sends a heartbeat and periodic metrics snapshots to HammerByte.
#>
param(
    [Parameter(Mandatory = $true)][string]$ConfigFile,
    [Parameter(Mandatory = $true)][int]$ParentPid
)

$ErrorActionPreference = 'Stop'
$script:ServiceVersion = '__HB_VERSION__'

# >>> HB-COMMON
# <<< HB-COMMON

$script:LogicalProcessors = 1

function Get-HbRound {
    param($Value, [int]$Digits = 1)
    if ($null -eq $Value) {
        return $null
    }
    return [Math]::Round([double]$Value, $Digits)
}

function Get-HbWmi {
    param([string]$Class, [string]$Filter = $null, [string]$Namespace = 'root\cimv2')
    if ($Filter) {
        return @(Get-WmiObject -Namespace $Namespace -Class $Class -Filter $Filter -ErrorAction Stop)
    }
    return @(Get-WmiObject -Namespace $Namespace -Class $Class -ErrorAction Stop)
}

function ConvertFrom-HbWmiDate {
    param([string]$Value)
    if (-not $Value) {
        return $null
    }
    try {
        return [Management.ManagementDateTimeConverter]::ToDateTime($Value).ToUniversalTime()
    } catch {
        return $null
    }
}

function Get-HbCpuUsage {
    # Formatted perf classes need two samples; the first read after start is often 0.
    $usage = $null
    for ($i = 0; $i -lt 2; $i++) {
        try {
            $total = Get-HbWmi -Class 'Win32_PerfFormattedData_PerfOS_Processor' -Filter "Name='_Total'"
            if ($total.Count -gt 0) {
                $usage = [double]$total[0].PercentProcessorTime
            }
        } catch {}
        if ($i -eq 0) {
            Start-Sleep -Seconds 1
        }
    }
    if ($null -eq $usage) {
        $loads = @()
        foreach ($cpu in (Get-HbWmi -Class 'Win32_Processor')) {
            if ($null -ne $cpu.LoadPercentage) {
                $loads += [double]$cpu.LoadPercentage
            }
        }
        if ($loads.Count -gt 0) {
            $sum = 0.0
            foreach ($load in $loads) {
                $sum += $load
            }
            $usage = $sum / $loads.Count
        }
    }
    return $usage
}

function Get-HbProcessorInfo {
    $cpus = Get-HbWmi -Class 'Win32_Processor'
    $cores = 0
    $logical = 0
    $maxClock = 0
    $name = $null
    foreach ($cpu in $cpus) {
        if (-not $name) {
            $name = ([string]$cpu.Name).Trim()
        }
        $cores += [int]$cpu.NumberOfCores
        $logical += [int]$cpu.NumberOfLogicalProcessors
        if ([int]$cpu.MaxClockSpeed -gt $maxClock) {
            $maxClock = [int]$cpu.MaxClockSpeed
        }
    }
    if ($logical -gt 0) {
        $script:LogicalProcessors = $logical
    }
    return @{
        name = $name
        packages = $cpus.Count
        core_count = $cores
        logical_count = $logical
        max_clock_mhz = $maxClock
        usage_percent = Get-HbRound (Get-HbCpuUsage)
    }
}

function Get-HbMemoryInfo {
    $os = (Get-HbWmi -Class 'Win32_OperatingSystem')[0]
    $totalMb = [double]$os.TotalVisibleMemorySize / 1024
    $freeMb = [double]$os.FreePhysicalMemory / 1024
    $usedMb = $totalMb - $freeMb
    $usedPercent = 0
    if ($totalMb -gt 0) {
        $usedPercent = $usedMb / $totalMb * 100
    }
    $commitTotalMb = [double]$os.TotalVirtualMemorySize / 1024
    $commitFreeMb = [double]$os.FreeVirtualMemory / 1024
    return @{
        total_mb = Get-HbRound $totalMb
        used_mb = Get-HbRound $usedMb
        free_mb = Get-HbRound $freeMb
        used_percent = Get-HbRound $usedPercent
        commit_total_mb = Get-HbRound $commitTotalMb
        commit_used_mb = Get-HbRound ($commitTotalMb - $commitFreeMb)
    }
}

function Get-HbDiskInfo {
    $disks = @()
    foreach ($disk in (Get-HbWmi -Class 'Win32_LogicalDisk' -Filter 'DriveType=3')) {
        $size = [double]$disk.Size
        $free = [double]$disk.FreeSpace
        $usedPercent = $null
        if ($size -gt 0) {
            $usedPercent = Get-HbRound (($size - $free) / $size * 100)
        }
        $disks += @{
            name = [string]$disk.DeviceID
            label = [string]$disk.VolumeName
            file_system = [string]$disk.FileSystem
            size_gb = Get-HbRound ($size / 1GB) 2
            free_gb = Get-HbRound ($free / 1GB) 2
            used_percent = $usedPercent
        }
    }
    return ,$disks
}

function Get-HbProcessInfo {
    param([int]$Top)
    $rows = @()
    foreach ($process in (Get-HbWmi -Class 'Win32_PerfFormattedData_PerfProc_Process')) {
        $name = [string]$process.Name
        if ($name -eq '_Total' -or $name -eq 'Idle') {
            continue
        }
        $rows += @{
            name = $name
            pid = [int]$process.IDProcess
            cpu_percent = [Math]::Round([double]$process.PercentProcessorTime / [Math]::Max(1, $script:LogicalProcessors), 1)
            working_set_mb = [Math]::Round([double]$process.WorkingSet / 1MB, 1)
        }
    }
    $byCpu = @($rows | Sort-Object -Property @{ Expression = { $_.cpu_percent } } -Descending | Select-Object -First $Top)
    $byMemory = @($rows | Sort-Object -Property @{ Expression = { $_.working_set_mb } } -Descending | Select-Object -First $Top)
    return @{
        count = $rows.Count
        top_cpu = $byCpu
        top_memory = $byMemory
    }
}

function Get-HbServicesInfo {
    $all = Get-HbWmi -Class 'Win32_Service'
    $running = 0
    $stoppedAuto = @()
    foreach ($service in $all) {
        if ([string]$service.State -eq 'Running') {
            $running++
        } elseif ([string]$service.StartMode -eq 'Auto') {
            $stoppedAuto += @{
                name = [string]$service.Name
                display_name = [string]$service.DisplayName
                state = [string]$service.State
            }
        }
    }
    return @{
        total = $all.Count
        running = $running
        auto_not_running_count = $stoppedAuto.Count
        auto_not_running = @($stoppedAuto | Select-Object -First 30)
    }
}

function Get-HbOsInfo {
    $os = (Get-HbWmi -Class 'Win32_OperatingSystem')[0]
    $computer = (Get-HbWmi -Class 'Win32_ComputerSystem')[0]
    $bootUtc = ConvertFrom-HbWmiDate -Value ([string]$os.LastBootUpTime)
    $uptime = $null
    $bootIst = $null
    if ($null -ne $bootUtc) {
        $uptime = [int]([DateTime]::UtcNow - $bootUtc).TotalSeconds
        $bootIst = Format-HbIst -Utc $bootUtc
    }
    return @{
        caption = ([string]$os.Caption).Trim()
        version = [string]$os.Version
        build = [string]$os.BuildNumber
        architecture = [string]$os.OSArchitecture
        domain = [string]$computer.Domain
        logged_in_user = [string]$computer.UserName
        last_boot_ist = $bootIst
        uptime_seconds = $uptime
        ps_version = $PSVersionTable.PSVersion.ToString()
        platform_family = (Get-HbPlatform).family
    }
}

function Get-HbHardwareInfo {
    $computer = (Get-HbWmi -Class 'Win32_ComputerSystem')[0]
    $info = @{
        manufacturer = ([string]$computer.Manufacturer).Trim()
        model = ([string]$computer.Model).Trim()
        total_physical_memory_gb = Get-HbRound ([double]$computer.TotalPhysicalMemory / 1GB) 2
        bios_serial = $null
        bios_version = $null
        board = $null
    }
    try {
        $bios = (Get-HbWmi -Class 'Win32_BIOS')[0]
        $info.bios_serial = ([string]$bios.SerialNumber).Trim()
        $info.bios_version = ([string]$bios.SMBIOSBIOSVersion).Trim()
    } catch {}
    try {
        $board = (Get-HbWmi -Class 'Win32_BaseBoard')[0]
        $info.board = (([string]$board.Manufacturer).Trim() + ' ' + ([string]$board.Product).Trim()).Trim()
    } catch {}
    return $info
}

function Get-HbNetworkInfo {
    $speeds = @{}
    try {
        foreach ($adapter in (Get-HbWmi -Class 'Win32_NetworkAdapter' -Filter 'NetEnabled=TRUE')) {
            $speeds[[string]$adapter.Index] = $adapter.Speed
        }
    } catch {}
    $adapters = @()
    foreach ($config in (Get-HbWmi -Class 'Win32_NetworkAdapterConfiguration' -Filter 'IPEnabled=TRUE')) {
        $speedMbps = $null
        $rawSpeed = $speeds[[string]$config.Index]
        if ($null -ne $rawSpeed) {
            $speedMbps = [Math]::Round([double]$rawSpeed / 1000000, 0)
        }
        $adapters += @{
            description = [string]$config.Description
            mac = [string]$config.MACAddress
            ip_addresses = @($config.IPAddress | ForEach-Object { [string]$_ })
            gateways = @($config.DefaultIPGateway | ForEach-Object { [string]$_ })
            dns_servers = @($config.DNSServerSearchOrder | ForEach-Object { [string]$_ })
            dhcp = [bool]$config.DHCPEnabled
            speed_mbps = $speedMbps
        }
    }
    return ,$adapters
}

function Get-HbTemperatureInfo {
    $zones = @()
    $max = $null
    foreach ($zone in (Get-HbWmi -Namespace 'root\wmi' -Class 'MSAcpi_ThermalZoneTemperature')) {
        $celsius = [Math]::Round(([double]$zone.CurrentTemperature / 10) - 273.15, 1)
        if ($celsius -le -50 -or $celsius -ge 150) {
            continue
        }
        $zones += @{ name = [string]$zone.InstanceName; celsius = $celsius }
        if ($null -eq $max -or $celsius -gt $max) {
            $max = $celsius
        }
    }
    return @{ max_celsius = $max; zones = $zones }
}

function Get-HbMetricsSnapshot {
    param($Config)
    $started = [DateTime]::UtcNow
    $enabled = Get-HbValue -Map $Config -Key 'metrics' -Default @{}
    $top = Get-HbInt -Map $Config -Key 'top_process_count' -Default 5 -Min 1 -Max 20
    $snapshot = @{ collected_at_ist = (Get-HbIstStamp) }
    $errors = @{}

    $sections = @(
        @{ key = 'cpu'; name = 'processor'; block = { Get-HbProcessorInfo } },
        @{ key = 'memory'; name = 'memory'; block = { Get-HbMemoryInfo } },
        @{ key = 'disks'; name = 'disks'; block = { Get-HbDiskInfo } },
        @{ key = 'processes'; name = 'processes'; block = { Get-HbProcessInfo -Top $top } },
        @{ key = 'services'; name = 'services'; block = { Get-HbServicesInfo } },
        @{ key = 'os'; name = 'os'; block = { Get-HbOsInfo } },
        @{ key = 'hardware'; name = 'hardware'; block = { Get-HbHardwareInfo } },
        @{ key = 'network'; name = 'network'; block = { Get-HbNetworkInfo } },
        @{ key = 'temperatures'; name = 'temperatures'; block = { Get-HbTemperatureInfo } }
    )
    foreach ($section in $sections) {
        if (-not (Get-HbBool -Map $enabled -Key $section.key)) {
            continue
        }
        try {
            $value = & $section.block
            $snapshot[$section.name] = $value
        } catch {
            $errors[$section.name] = Get-HbErrorText $_
        }
    }
    $snapshot['collection_errors'] = $errors
    $snapshot['duration_ms'] = [int]([DateTime]::UtcNow - $started).TotalMilliseconds
    return $snapshot
}

function Start-HbMonitor {
    Initialize-HbService -Name 'monitor' -Version $script:ServiceVersion -ConfigFile $ConfigFile -ParentPid $ParentPid
    $config = $script:HbConfig
    $heartbeatSeconds = Get-HbInt -Map $config -Key 'heartbeat_interval_seconds' -Default 60 -Min 30 -Max 3600
    $metricsSeconds = Get-HbInt -Map $config -Key 'metrics_interval_seconds' -Default 900 -Min 60 -Max 86400
    Write-HbLog ('heartbeat every ' + $heartbeatSeconds + 's, metrics every ' + $metricsSeconds + 's')

    $nextHeartbeat = [DateTime]::UtcNow
    $nextMetrics = [DateTime]::UtcNow
    $heartbeatFailures = 0
    while ($true) {
        if (-not (Test-HbParentAlive)) {
            Write-HbLog 'agent is gone; exiting'
            return
        }
        $now = [DateTime]::UtcNow
        if ($now -ge $nextMetrics) {
            $nextMetrics = $now.AddSeconds($metricsSeconds)
            try {
                $snapshot = Get-HbMetricsSnapshot -Config $config
                $summary = 'metrics collected in ' + $snapshot['duration_ms'] + 'ms'
                if ($snapshot.ContainsKey('processor')) {
                    $summary += ', cpu ' + $snapshot['processor']['usage_percent'] + '%'
                }
                if ($snapshot.ContainsKey('memory')) {
                    $summary += ', memory ' + $snapshot['memory']['used_percent'] + '%'
                }
                if ($snapshot['collection_errors'].Count -gt 0) {
                    $summary += ', section errors: ' + (($snapshot['collection_errors'].Keys | ForEach-Object { $_ + '=' + $snapshot['collection_errors'][$_] }) -join '; ')
                }
                if (Send-HbResult -Type 'metrics' -Data $snapshot) {
                    Write-HbLog ($summary + ', sent')
                    Write-HbLog 'heartbeat ok (covered by metrics)'
                } else {
                    Write-HbLog ($summary + ', NOT sent') 'WARN'
                }
            } catch {
                Write-HbLog ('metrics cycle failed: ' + (Get-HbErrorText $_)) 'ERROR'
            }
            # A metrics post also proves liveness.
            $nextHeartbeat = [DateTime]::UtcNow.AddSeconds($heartbeatSeconds)
            $heartbeatFailures = 0
        } elseif ($now -ge $nextHeartbeat) {
            $nextHeartbeat = $now.AddSeconds($heartbeatSeconds)
            if (Send-HbResult -Type 'heartbeat' -Data @{}) {
                if ($heartbeatFailures -gt 0) {
                    Write-HbLog ('heartbeat recovered after ' + $heartbeatFailures + ' failure(s)')
                } else {
                    Write-HbLog 'heartbeat sent'
                }
                $heartbeatFailures = 0
            } else {
                $heartbeatFailures++
                Write-HbLog ('heartbeat NOT sent (failure ' + $heartbeatFailures + ')') 'WARN'
            }
        }
        $wakeAt = $nextHeartbeat
        if ($nextMetrics -lt $wakeAt) {
            $wakeAt = $nextMetrics
        }
        $waitSeconds = [int][Math]::Ceiling(($wakeAt - [DateTime]::UtcNow).TotalSeconds)
        if ($waitSeconds -gt 0 -and -not (Wait-HbSeconds -Seconds $waitSeconds)) {
            Write-HbLog 'agent is gone; exiting'
            return
        }
    }
}

try {
    Start-HbMonitor
    exit 0
} catch {
    try {
        Write-HbLog ('fatal: ' + (Get-HbErrorText $_)) 'ERROR'
    } catch {}
    exit 1
}

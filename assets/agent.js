/**
 * HammerByte Server Agent — metrics worker (child process).
 * Spawned by supervisor with --tag.
 * Sends metrics twice (900s apart), then exits so supervisor can refresh the EXE.
 */

import { hostname, arch, release, type, freemem, totalmem, uptime, cpus, loadavg } from "node:os";

const HOST = "https://hammerbyte.co.in";
const METRICS_URL = `${HOST}/api/servers/metrics`;
const METRICS_INTERVAL_SECONDS = Number(Bun.env.HB_METRICS_INTERVAL) || 900;
const SENDS_PER_RUN = 2;
const AGENT_VERSION = "0.2.0";
const QUERY_TIMEOUT_MS = 12_000;
const CPU_SAMPLE_MS = 1_000;

function parseArgs(argv) {
    const options = { tag: null };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === "--tag" && argv[index + 1]) {
            options.tag = argv[++index];
        }
    }
    return options;
}

function log(message) {
    const stamp = new Date().toISOString();
    console.log(`[agent ${stamp}] ${message}`);
}

function round(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
        return null;
    }
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function kelvinTenthsToCelsius(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
        return null;
    }
    return round(number / 10 - 273.15, 1);
}

function cpuTimesTotal(cpuList) {
    let idle = 0;
    let total = 0;
    for (const cpu of cpuList || []) {
        const times = cpu.times || {};
        const slice =
            (times.user || 0) +
            (times.nice || 0) +
            (times.sys || 0) +
            (times.irq || 0) +
            (times.idle || 0);
        idle += times.idle || 0;
        total += slice;
    }
    return { idle, total };
}

async function sampleCpuUsagePercent() {
    const first = cpuTimesTotal(cpus());
    await Bun.sleep(CPU_SAMPLE_MS);
    const second = cpuTimesTotal(cpus());
    const idleDelta = second.idle - first.idle;
    const totalDelta = second.total - first.total;
    if (totalDelta <= 0) {
        return null;
    }
    return round((1 - idleDelta / totalDelta) * 100, 1);
}

async function runPowerShellJson(script, timeoutMs = QUERY_TIMEOUT_MS) {
    if (process.platform !== "win32") {
        return null;
    }

    try {
        const child = Bun.spawn(
            [
                "powershell.exe",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            {
                stdout: "pipe",
                stderr: "pipe",
                windowsHide: true,
            },
        );

        const timeout = Bun.sleep(timeoutMs).then(() => {
            try {
                child.kill();
            } catch {
                // ignore
            }
            return { timedOut: true };
        });

        const finished = (async () => {
            const exitCode = await child.exited;
            const stdout = (await new Response(child.stdout).text()).trim();
            const stderr = (await new Response(child.stderr).text()).trim();
            return { timedOut: false, exitCode, stdout, stderr };
        })();

        const result = await Promise.race([finished, timeout]);
        if (result.timedOut || result.exitCode !== 0 || !result.stdout) {
            return null;
        }

        return JSON.parse(result.stdout);
    } catch {
        return null;
    }
}

async function collectWindowsSnapshot() {
    return await runPowerShellJson(`
$ErrorActionPreference = 'SilentlyContinue'

function To-MB([double]$bytes) {
  if ($null -eq $bytes) { return $null }
  return [math]::Round($bytes / 1MB, 1)
}

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
$bios = Get-CimInstance Win32_BIOS
$baseBoard = Get-CimInstance Win32_BaseBoard
$procs = @(Get-CimInstance Win32_Processor)
$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3")
$services = @(Get-Service -ErrorAction SilentlyContinue)
$processList = @(Get-Process -ErrorAction SilentlyContinue)
$perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue
$thermal = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue)

$processorName = ($procs | Select-Object -ExpandProperty Name -First 1)
$coreCount = ($procs | Measure-Object -Property NumberOfCores -Sum).Sum
$logicalCount = ($procs | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
$maxClock = ($procs | Measure-Object -Property MaxClockSpeed -Maximum).Maximum
$loadAvg = ($procs | Measure-Object -Property LoadPercentage -Average).Average

$runningServices = @($services | Where-Object { $_.Status -eq 'Running' }).Count
$stoppedServices = @($services | Where-Object { $_.Status -eq 'Stopped' }).Count

$topCpu = @(
  $processList |
    Sort-Object CPU -Descending |
    Select-Object -First 5 |
    ForEach-Object {
      [pscustomobject]@{
        name = $_.ProcessName
        pid = $_.Id
        cpu_seconds = if ($null -eq $_.CPU) { $null } else { [math]::Round([double]$_.CPU, 1) }
        memory_mb = To-MB $_.WorkingSet64
      }
    }
)

$topMemory = @(
  $processList |
    Sort-Object WorkingSet64 -Descending |
    Select-Object -First 5 |
    ForEach-Object {
      [pscustomobject]@{
        name = $_.ProcessName
        pid = $_.Id
        memory_mb = To-MB $_.WorkingSet64
        cpu_seconds = if ($null -eq $_.CPU) { $null } else { [math]::Round([double]$_.CPU, 1) }
      }
    }
)

$diskRows = @(
  $disks | ForEach-Object {
    $total = [double]$_.Size
    $free = [double]$_.FreeSpace
    $usedPct = if ($total -gt 0) { [math]::Round((($total - $free) / $total) * 100, 1) } else { $null }
    [pscustomobject]@{
      device = $_.DeviceID
      label = $_.VolumeName
      filesystem = $_.FileSystem
      total_mb = To-MB $total
      free_mb = To-MB $free
      used_percent = $usedPct
    }
  }
)

$tempZones = @(
  $thermal | ForEach-Object {
    [pscustomobject]@{
      name = [string]$_.InstanceName
      kelvin_tenths = [double]$_.CurrentTemperature
    }
  }
)

$result = [pscustomobject]@{
  os = [pscustomobject]@{
    caption = $os.Caption
    version = $os.Version
    build = $os.BuildNumber
    architecture = $os.OSArchitecture
    install_date = if ($os.InstallDate) { $os.InstallDate.ToString('o') } else { $null }
    last_boot = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString('o') } else { $null }
  }
  hardware = [pscustomobject]@{
    manufacturer = $cs.Manufacturer
    model = $cs.Model
    domain = $cs.Domain
    bios_version = $bios.SMBIOSBIOSVersion
    serial_number = $bios.SerialNumber
    baseboard_product = $baseBoard.Product
  }
  processor = [pscustomobject]@{
    name = $processorName
    packages = $procs.Count
    core_count = $coreCount
    logical_count = $logicalCount
    max_clock_mhz = $maxClock
    load_percent_wmi = if ($null -eq $loadAvg) { $null } else { [math]::Round([double]$loadAvg, 1) }
  }
  memory = [pscustomobject]@{
    total_mb = To-MB ([double]$os.TotalVisibleMemorySize * 1KB)
    free_mb = To-MB ([double]$os.FreePhysicalMemory * 1KB)
    available_mb = if ($perf) { [math]::Round([double]$perf.AvailableMBytes, 1) } else { $null }
    committed_mb = if ($perf) { [math]::Round([double]$perf.CommittedBytes / 1MB, 1) } else { $null }
    pool_paged_mb = if ($perf) { [math]::Round([double]$perf.PoolPagedBytes / 1MB, 1) } else { $null }
    pool_nonpaged_mb = if ($perf) { [math]::Round([double]$perf.PoolNonpagedBytes / 1MB, 1) } else { $null }
  }
  processes = [pscustomobject]@{
    total = $processList.Count
    top_cpu = $topCpu
    top_memory = $topMemory
  }
  services = [pscustomobject]@{
    total = $services.Count
    running = $runningServices
    stopped = $stoppedServices
  }
  disks = $diskRows
  thermal_zones = $tempZones
}

$result | ConvertTo-Json -Compress -Depth 6
`);
}

function normalizeTemperatures(thermalZones) {
    const zones = [];
    for (const zone of thermalZones || []) {
        const celsius = kelvinTenthsToCelsius(zone?.kelvin_tenths);
        if (celsius == null) {
            continue;
        }
        zones.push({
            name: String(zone?.name || "thermal").slice(0, 128),
            celsius,
        });
    }

    if (!zones.length) {
        return { available: false, celsius_max: null, zones: [] };
    }

    return {
        available: true,
        celsius_max: Math.max(...zones.map((zone) => zone.celsius)),
        zones,
    };
}

function memoryFromOs() {
    const totalBytes = totalmem();
    const freeBytes = freemem();
    const usedBytes = Math.max(totalBytes - freeBytes, 0);
    return {
        total_mb: round(totalBytes / (1024 * 1024), 1),
        free_mb: round(freeBytes / (1024 * 1024), 1),
        used_mb: round(usedBytes / (1024 * 1024), 1),
        used_percent: totalBytes > 0 ? round((usedBytes / totalBytes) * 100, 1) : null,
    };
}

async function collectMetrics() {
    const cpuList = cpus() || [];
    const cpuUsagePercent = await sampleCpuUsagePercent();
    const windows = await collectWindowsSnapshot();
    const memoryOs = memoryFromOs();
    const memory = {
        ...memoryOs,
        ...(windows?.memory || {}),
        total_mb: windows?.memory?.total_mb ?? memoryOs.total_mb,
        free_mb: windows?.memory?.free_mb ?? memoryOs.free_mb,
        used_mb:
            windows?.memory?.total_mb != null && windows?.memory?.free_mb != null
                ? round(windows.memory.total_mb - windows.memory.free_mb, 1)
                : memoryOs.used_mb,
        used_percent:
            windows?.memory?.total_mb > 0
                ? round(
                      ((windows.memory.total_mb - windows.memory.free_mb) / windows.memory.total_mb) *
                          100,
                      1,
                  )
                : memoryOs.used_percent,
    };

    const processor = {
        name: windows?.processor?.name || cpuList[0]?.model || null,
        packages: windows?.processor?.packages ?? null,
        core_count: windows?.processor?.core_count ?? null,
        logical_count: windows?.processor?.logical_count ?? cpuList.length,
        max_clock_mhz: windows?.processor?.max_clock_mhz ?? null,
        load_percent_wmi: windows?.processor?.load_percent_wmi ?? null,
        usage_percent: cpuUsagePercent,
    };

    return {
        agent_version: AGENT_VERSION,
        hostname: hostname(),
        pid: process.pid,
        platform: process.platform,
        arch: arch(),
        os_type: type(),
        os_release: release(),
        uptime_seconds: Math.round(uptime()),
        loadavg: loadavg(),
        cpu_count: processor.logical_count || cpuList.length,
        processor,
        memory,
        processes: windows?.processes || { total: null, top_cpu: [], top_memory: [] },
        services: windows?.services || { total: null, running: null, stopped: null },
        disks: windows?.disks || [],
        os: windows?.os || null,
        hardware: windows?.hardware || null,
        temperatures: normalizeTemperatures(windows?.thermal_zones),
        collected_at: new Date().toISOString(),
    };
}

async function sendMetrics({ tag }) {
    const payload = await collectMetrics();

    log(
        `cpu ${payload.processor.usage_percent ?? "n/a"}% | ram ${payload.memory.used_percent ?? "n/a"}% | processes ${payload.processes.total ?? "n/a"}`,
    );
    if (payload.temperatures?.available) {
        log(`temperatures max ${payload.temperatures.celsius_max}°C`);
    }
    log("health check done");

    try {
        const response = await fetch(METRICS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Server-Tag": tag,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            log(`failed to send (HTTP ${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
            return false;
        }

        log("health check sent");
        return true;
    } catch (error) {
        log(`failed to connect: ${error?.message || error}`);
        return false;
    }
}

function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main() {
    const options = parseArgs(Bun.argv.slice(2));
    if (!options.tag) {
        console.error("Usage: agent.exe --tag <uuid>");
        process.exit(1);
    }

    log(`host ${HOST}`);
    log(`tag ${options.tag}`);
    log(`frequency ${METRICS_INTERVAL_SECONDS}s (${SENDS_PER_RUN} sends then exit)`);

    for (let sendIndex = 1; sendIndex <= SENDS_PER_RUN; sendIndex++) {
        await sendMetrics({ tag: options.tag });
        if (sendIndex < SENDS_PER_RUN) {
            log(`waiting ${METRICS_INTERVAL_SECONDS}s before next send`);
            await sleep(METRICS_INTERVAL_SECONDS);
        }
    }

    log("send cycle complete; exiting for supervisor agent refresh");
    process.exit(0);
}

await main();

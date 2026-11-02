/**
 * HammerByte Server Agent — metrics worker (child process).
 * Spawned by supervisor with --tag.
 * Sends metrics twice (900s apart), then exits so supervisor can refresh the EXE.
 * Collection is best-effort: failures are logged and never crash the process.
 */

import { hostname, arch, release, type, freemem, totalmem, uptime, cpus, loadavg } from "node:os";

const HOST = "https://hammerbyte.co.in";
const METRICS_URL = `${HOST}/api/servers/metrics`;
const METRICS_INTERVAL_SECONDS = Number(Bun.env.HB_METRICS_INTERVAL) || 900;
const SENDS_PER_RUN = 2;
const AGENT_VERSION = "0.2.1";
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
    try {
        const stamp = new Date().toISOString();
        console.log(`[agent ${stamp}] ${message}`);
    } catch {
        // ignore logging failures
    }
}

function errorMessage(error) {
    if (error == null) {
        return "unknown error";
    }
    if (typeof error === "string") {
        return error;
    }
    return error.message || String(error);
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

function safeCall(label, fn, fallback) {
    try {
        return fn();
    } catch (error) {
        log(`${label} failed: ${errorMessage(error)}`);
        return fallback;
    }
}

function cpuTimesTotal(cpuList) {
    let idle = 0;
    let total = 0;
    for (const cpu of cpuList || []) {
        const times = cpu?.times || {};
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
    try {
        const firstList = safeCall("cpus(first)", () => cpus(), []) || [];
        const first = cpuTimesTotal(firstList);
        await Bun.sleep(CPU_SAMPLE_MS);
        const secondList = safeCall("cpus(second)", () => cpus(), []) || [];
        const second = cpuTimesTotal(secondList);
        const idleDelta = second.idle - first.idle;
        const totalDelta = second.total - first.total;
        if (totalDelta <= 0) {
            return null;
        }
        return round((1 - idleDelta / totalDelta) * 100, 1);
    } catch (error) {
        log(`cpu sample failed: ${errorMessage(error)}`);
        return null;
    }
}

async function runPowerShellJson(script, timeoutMs = QUERY_TIMEOUT_MS) {
    if (process.platform !== "win32") {
        return null;
    }

    let child = null;
    try {
        child = Bun.spawn(
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
    } catch (error) {
        log(`powershell spawn failed: ${errorMessage(error)}`);
        return null;
    }

    const finished = (async () => {
        try {
            const exitCode = await child.exited;
            const stdout = (await new Response(child.stdout).text().catch(() => "")).trim();
            const stderr = (await new Response(child.stderr).text().catch(() => "")).trim();
            return { timedOut: false, exitCode, stdout, stderr };
        } catch (error) {
            return {
                timedOut: false,
                exitCode: -1,
                stdout: "",
                stderr: errorMessage(error),
            };
        }
    })();

    // Prevent unhandled rejection if timeout wins the race.
    finished.catch(() => {});

    const timeout = Bun.sleep(timeoutMs).then(() => {
        try {
            child.kill();
        } catch {
            // ignore
        }
        return { timedOut: true, exitCode: -1, stdout: "", stderr: "timeout" };
    });

    try {
        const result = await Promise.race([finished, timeout]);
        if (result.timedOut) {
            log("powershell snapshot timed out");
            return null;
        }
        if (result.exitCode !== 0) {
            log(
                `powershell snapshot exit ${result.exitCode}${result.stderr ? `: ${result.stderr.slice(0, 200)}` : ""}`,
            );
            return null;
        }
        if (!result.stdout) {
            log("powershell snapshot returned empty output");
            return null;
        }

        try {
            return JSON.parse(result.stdout);
        } catch (error) {
            log(`powershell json parse failed: ${errorMessage(error)}`);
            return null;
        }
    } catch (error) {
        log(`powershell snapshot failed: ${errorMessage(error)}`);
        return null;
    }
}

async function collectWindowsSnapshot() {
    try {
        return await runPowerShellJson(`
$ErrorActionPreference = 'SilentlyContinue'
try {
  function To-MB([double]$bytes) {
    if ($null -eq $bytes) { return $null }
    return [math]::Round($bytes / 1MB, 1)
  }

  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
  $bios = Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue
  $baseBoard = Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue
  $procs = @(Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue)
  $disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue)
  $services = @(Get-Service -ErrorAction SilentlyContinue)
  $processList = @(Get-Process -ErrorAction SilentlyContinue)
  $perf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue
  $thermal = @(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue)

  $processorName = $null
  if ($procs.Count -gt 0) { $processorName = [string]$procs[0].Name }

  $coreCount = $null
  $logicalCount = $null
  $maxClock = $null
  $loadAvg = $null
  if ($procs.Count -gt 0) {
    $coreCount = ($procs | Measure-Object -Property NumberOfCores -Sum).Sum
    $logicalCount = ($procs | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum
    $maxClock = ($procs | Measure-Object -Property MaxClockSpeed -Maximum).Maximum
    $loadAvg = ($procs | Measure-Object -Property LoadPercentage -Average).Average
  }

  $runningServices = @($services | Where-Object { $_.Status -eq 'Running' }).Count
  $stoppedServices = @($services | Where-Object { $_.Status -eq 'Stopped' }).Count

  $topCpu = @()
  $topMemory = @()
  try {
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
  } catch {}

  $diskRows = @()
  try {
    $diskRows = @(
      $disks | ForEach-Object {
        try {
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
        } catch {}
      }
    )
  } catch {}

  $tempZones = @()
  try {
    $tempZones = @(
      $thermal | ForEach-Object {
        try {
          [pscustomobject]@{
            name = [string]$_.InstanceName
            kelvin_tenths = [double]$_.CurrentTemperature
          }
        } catch {}
      }
    )
  } catch {}

  $result = [pscustomobject]@{
    os = if ($os) {
      [pscustomobject]@{
        caption = $os.Caption
        version = $os.Version
        build = $os.BuildNumber
        architecture = $os.OSArchitecture
        install_date = if ($os.InstallDate) { $os.InstallDate.ToString('o') } else { $null }
        last_boot = if ($os.LastBootUpTime) { $os.LastBootUpTime.ToString('o') } else { $null }
      }
    } else { $null }
    hardware = [pscustomobject]@{
      manufacturer = if ($cs) { $cs.Manufacturer } else { $null }
      model = if ($cs) { $cs.Model } else { $null }
      domain = if ($cs) { $cs.Domain } else { $null }
      bios_version = if ($bios) { $bios.SMBIOSBIOSVersion } else { $null }
      serial_number = if ($bios) { $bios.SerialNumber } else { $null }
      baseboard_product = if ($baseBoard) { $baseBoard.Product } else { $null }
    }
    processor = [pscustomobject]@{
      name = $processorName
      packages = $procs.Count
      core_count = $coreCount
      logical_count = $logicalCount
      max_clock_mhz = $maxClock
      load_percent_wmi = if ($null -eq $loadAvg) { $null } else { [math]::Round([double]$loadAvg, 1) }
    }
    memory = if ($os) {
      [pscustomobject]@{
        total_mb = To-MB ([double]$os.TotalVisibleMemorySize * 1KB)
        free_mb = To-MB ([double]$os.FreePhysicalMemory * 1KB)
        available_mb = if ($perf) { [math]::Round([double]$perf.AvailableMBytes, 1) } else { $null }
        committed_mb = if ($perf) { [math]::Round([double]$perf.CommittedBytes / 1MB, 1) } else { $null }
        pool_paged_mb = if ($perf) { [math]::Round([double]$perf.PoolPagedBytes / 1MB, 1) } else { $null }
        pool_nonpaged_mb = if ($perf) { [math]::Round([double]$perf.PoolNonpagedBytes / 1MB, 1) } else { $null }
      }
    } else { $null }
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
} catch {
  Write-Output '{}'
  exit 0
}
`);
    } catch (error) {
        log(`windows snapshot failed: ${errorMessage(error)}`);
        return null;
    }
}

function normalizeTemperatures(thermalZones) {
    try {
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
    } catch (error) {
        log(`temperature normalize failed: ${errorMessage(error)}`);
        return { available: false, celsius_max: null, zones: [] };
    }
}

function memoryFromOs() {
    return safeCall(
        "memoryFromOs",
        () => {
            const totalBytes = totalmem();
            const freeBytes = freemem();
            const usedBytes = Math.max(totalBytes - freeBytes, 0);
            return {
                total_mb: round(totalBytes / (1024 * 1024), 1),
                free_mb: round(freeBytes / (1024 * 1024), 1),
                used_mb: round(usedBytes / (1024 * 1024), 1),
                used_percent: totalBytes > 0 ? round((usedBytes / totalBytes) * 100, 1) : null,
            };
        },
        {
            total_mb: null,
            free_mb: null,
            used_mb: null,
            used_percent: null,
        },
    );
}

function mergeMemory(memoryOs, windowsMemory) {
    try {
        const totalMb = windowsMemory?.total_mb ?? memoryOs.total_mb;
        const freeMb = windowsMemory?.free_mb ?? memoryOs.free_mb;
        const usedMb =
            totalMb != null && freeMb != null ? round(totalMb - freeMb, 1) : memoryOs.used_mb;
        const usedPercent =
            totalMb > 0 && freeMb != null
                ? round(((totalMb - freeMb) / totalMb) * 100, 1)
                : memoryOs.used_percent;

        return {
            ...memoryOs,
            ...(windowsMemory || {}),
            total_mb: totalMb,
            free_mb: freeMb,
            used_mb: usedMb,
            used_percent: usedPercent,
        };
    } catch (error) {
        log(`memory merge failed: ${errorMessage(error)}`);
        return memoryOs;
    }
}

function emptyPayload(collectionError = null) {
    return {
        agent_version: AGENT_VERSION,
        hostname: safeCall("hostname", () => hostname(), null),
        pid: process.pid,
        platform: process.platform,
        arch: safeCall("arch", () => arch(), null),
        os_type: safeCall("os_type", () => type(), null),
        os_release: safeCall("os_release", () => release(), null),
        uptime_seconds: safeCall("uptime", () => Math.round(uptime()), null),
        loadavg: safeCall("loadavg", () => loadavg(), []),
        cpu_count: null,
        processor: {
            name: null,
            packages: null,
            core_count: null,
            logical_count: null,
            max_clock_mhz: null,
            load_percent_wmi: null,
            usage_percent: null,
        },
        memory: {
            total_mb: null,
            free_mb: null,
            used_mb: null,
            used_percent: null,
        },
        processes: { total: null, top_cpu: [], top_memory: [] },
        services: { total: null, running: null, stopped: null },
        disks: [],
        os: null,
        hardware: null,
        temperatures: { available: false, celsius_max: null, zones: [] },
        collected_at: new Date().toISOString(),
        collection_error: collectionError,
    };
}

async function collectMetrics() {
    try {
        const cpuList = safeCall("cpus", () => cpus(), []) || [];
        const [cpuUsagePercent, windows] = await Promise.all([
            sampleCpuUsagePercent(),
            collectWindowsSnapshot(),
        ]);
        const memoryOs = memoryFromOs();
        const memory = mergeMemory(memoryOs, windows?.memory);

        const processor = {
            name: windows?.processor?.name || cpuList[0]?.model || null,
            packages: windows?.processor?.packages ?? null,
            core_count: windows?.processor?.core_count ?? null,
            logical_count: windows?.processor?.logical_count ?? (cpuList.length || null),
            max_clock_mhz: windows?.processor?.max_clock_mhz ?? null,
            load_percent_wmi: windows?.processor?.load_percent_wmi ?? null,
            usage_percent: cpuUsagePercent,
        };

        return {
            agent_version: AGENT_VERSION,
            hostname: safeCall("hostname", () => hostname(), null),
            pid: process.pid,
            platform: process.platform,
            arch: safeCall("arch", () => arch(), null),
            os_type: safeCall("os_type", () => type(), null),
            os_release: safeCall("os_release", () => release(), null),
            uptime_seconds: safeCall("uptime", () => Math.round(uptime()), null),
            loadavg: safeCall("loadavg", () => loadavg(), []),
            cpu_count: processor.logical_count || cpuList.length || null,
            processor,
            memory,
            processes: windows?.processes || { total: null, top_cpu: [], top_memory: [] },
            services: windows?.services || { total: null, running: null, stopped: null },
            disks: Array.isArray(windows?.disks) ? windows.disks : [],
            os: windows?.os || null,
            hardware: windows?.hardware || null,
            temperatures: normalizeTemperatures(windows?.thermal_zones),
            collected_at: new Date().toISOString(),
            collection_error: windows ? null : "windows_snapshot_unavailable",
        };
    } catch (error) {
        log(`collectMetrics failed: ${errorMessage(error)}`);
        return emptyPayload(errorMessage(error));
    }
}

async function sendMetrics({ tag }) {
    let payload;
    try {
        payload = await collectMetrics();
    } catch (error) {
        log(`collectMetrics threw: ${errorMessage(error)}`);
        payload = emptyPayload(errorMessage(error));
    }

    try {
        log(
            `cpu ${payload?.processor?.usage_percent ?? "n/a"}% | ram ${payload?.memory?.used_percent ?? "n/a"}% | processes ${payload?.processes?.total ?? "n/a"}`,
        );
        if (payload?.temperatures?.available) {
            log(`temperatures max ${payload.temperatures.celsius_max}°C`);
        }
        if (payload?.collection_error) {
            log(`collection warning: ${payload.collection_error}`);
        }
        log("health check done");
    } catch {
        // ignore summary log failures
    }

    try {
        let body;
        try {
            body = JSON.stringify(payload ?? emptyPayload("empty_payload"));
        } catch (error) {
            log(`payload stringify failed: ${errorMessage(error)}`);
            body = JSON.stringify(emptyPayload(`stringify_failed: ${errorMessage(error)}`));
        }

        const response = await fetch(METRICS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Server-Tag": tag,
            },
            body,
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            log(`failed to send (HTTP ${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
            return false;
        }

        log("health check sent");
        return true;
    } catch (error) {
        log(`failed to connect: ${errorMessage(error)}`);
        return false;
    }
}

function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function installProcessGuards() {
    process.on("uncaughtException", (error) => {
        log(`uncaughtException: ${errorMessage(error)}`);
    });
    process.on("unhandledRejection", (reason) => {
        log(`unhandledRejection: ${errorMessage(reason)}`);
    });
}

async function main() {
    installProcessGuards();

    const options = parseArgs(Bun.argv.slice(2));
    if (!options.tag) {
        console.error("Usage: agent.exe --tag <uuid>");
        process.exit(1);
    }

    log(`host ${HOST}`);
    log(`tag ${options.tag}`);
    log(`frequency ${METRICS_INTERVAL_SECONDS}s (${SENDS_PER_RUN} sends then exit)`);

    for (let sendIndex = 1; sendIndex <= SENDS_PER_RUN; sendIndex++) {
        try {
            await sendMetrics({ tag: options.tag });
        } catch (error) {
            log(`send cycle ${sendIndex} failed: ${errorMessage(error)}`);
        }

        if (sendIndex < SENDS_PER_RUN) {
            log(`waiting ${METRICS_INTERVAL_SECONDS}s before next send`);
            try {
                await sleep(METRICS_INTERVAL_SECONDS);
            } catch (error) {
                log(`sleep failed: ${errorMessage(error)}`);
            }
        }
    }

    log("send cycle complete; exiting for supervisor agent refresh");
    process.exit(0);
}

try {
    await main();
} catch (error) {
    log(`fatal: ${errorMessage(error)}`);
    process.exit(0);
}

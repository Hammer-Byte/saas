/**
 * HammerByte Drive Sync — child VM utility.
 * Mirrors source UNC shares onto local paths every N seconds.
 * Usage: drive-sync.exe   |   drive-sync.exe --setup
 */

import {
    mkdir,
    readFile,
    writeFile,
    appendFile,
    access,
    copyFile,
    unlink,
    rename,
    constants as fsConstants,
} from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join, basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

const HOST = "https://hammerbyte.co.in";
const METRICS_URL = `${HOST}/api/servers/metrics`;
const TASK_NAME = "HammerByteDriveSync";
const EXE_FILE = "drive-sync.exe";
const CONFIG_FILE = "config.json";
const LOG_FILE = "drive-sync.log";
const TAG_FILE = ".server-tag";
const AGENT_VERSION = "0.1.0";
const DEFAULT_INTERVAL_SECONDS = 300;

let logDirectory = null;
const cycleEvents = [];

function hammerByteRoot() {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    return join(programData, "HammerByte");
}

function targetInstallDirectory() {
    return join(hammerByteRoot(), "DriveSync");
}

function monitorTagPath() {
    return join(hammerByteRoot(), "ServerMonitor", TAG_FILE);
}

function normalizePath(path) {
    return resolve(path).replaceAll("/", "\\").toLowerCase();
}

function isSameDirectory(left, right) {
    return normalizePath(left) === normalizePath(right);
}

function errorMessage(error) {
    if (error == null) return "unknown error";
    if (typeof error === "string") return error;
    return error.message || String(error);
}

async function log(message, { event = null, level = "info" } = {}) {
    const stamp = new Date().toISOString();
    const line = `[drive-sync ${stamp}] ${message}`;
    console.log(line);
    if (event) {
        cycleEvents.push({ at: stamp, level, message: event === true ? message : String(event) });
    }
    if (!logDirectory) return;
    try {
        await appendFile(join(logDirectory, LOG_FILE), `${line}\n`, "utf8");
    } catch {
        // ignore
    }
}

function clearCycleEvents() {
    cycleEvents.length = 0;
}

function printBanner() {
    console.log("");
    console.log("  ╔══════════════════════════════════════════╗");
    console.log("  ║                                          ║");
    console.log("  ║   HammerByte  ·  Drive Sync              ║");
    console.log("  ║   child pull mirror  ·  auto-install     ║");
    console.log("  ║                                          ║");
    console.log("  ╚══════════════════════════════════════════╝");
    console.log("");
}

async function fileExists(path) {
    try {
        await access(path, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function runCaptured(command, args, { timeoutMs = 120_000 } = {}) {
    let child;
    try {
        child = Bun.spawn([command, ...args], {
            stdout: "pipe",
            stderr: "pipe",
            windowsHide: true,
        });
    } catch (error) {
        return { exitCode: -1, stdout: "", stderr: errorMessage(error), timedOut: false };
    }

    const finished = (async () => {
        try {
            const exitCode = await child.exited;
            const stdout = (await new Response(child.stdout).text().catch(() => "")).trim();
            const stderr = (await new Response(child.stderr).text().catch(() => "")).trim();
            return { timedOut: false, exitCode, stdout, stderr };
        } catch (error) {
            return { timedOut: false, exitCode: -1, stdout: "", stderr: errorMessage(error) };
        }
    })();
    finished.catch(() => {});

    const timeout = Bun.sleep(timeoutMs).then(() => {
        try {
            child.kill();
        } catch {
            // ignore
        }
        return { timedOut: true, exitCode: -1, stdout: "", stderr: "timeout" };
    });

    return await Promise.race([finished, timeout]);
}

async function isElevated() {
    if (process.platform !== "win32") return false;
    try {
        const result = await runCaptured("net", ["session"], { timeoutMs: 10_000 });
        return result.exitCode === 0;
    } catch {
        return false;
    }
}

function psSingleQuote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

async function ask(rl, question, { defaultValue = null, secret = false } = {}) {
    const hint = defaultValue != null && defaultValue !== "" ? ` [${defaultValue}]` : "";
    if (secret && process.platform === "win32") {
        const script = `
$ErrorActionPreference = 'Stop'
Write-Host ${psSingleQuote(question + hint)} -NoNewline
$secure = Read-Host -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
`;
        const tempPs1 = join(targetInstallDirectory(), `_ask_password_${process.pid}.ps1`);
        await mkdir(targetInstallDirectory(), { recursive: true });
        await writeFile(tempPs1, script, "utf8");
        const result = await runCaptured(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tempPs1],
            { timeoutMs: 300_000 },
        );
        try {
            await unlink(tempPs1);
        } catch {
            // ignore
        }
        const value = (result.stdout || "").trim();
        if (value) return value;
        if (defaultValue != null) return String(defaultValue);
        return "";
    }

    const answer = (await rl.question(`${question}${hint}\n> `)).trim();
    if (!answer && defaultValue != null) return String(defaultValue);
    return answer;
}

function toUnc(sourceHost, shareOrUnc) {
    const raw = String(shareOrUnc || "").trim().replaceAll("/", "\\");
    if (raw.startsWith("\\\\")) return raw.replace(/\\+$/, "");
    const share = raw.replace(/^\\+/, "").replace(/\\+$/, "");
    return `\\\\${sourceHost}\\${share}`;
}

function normalizeLocalPath(path) {
    let value = String(path || "").trim().replaceAll("/", "\\");
    if (/^[a-zA-Z]:$/.test(value)) value = `${value}\\`;
    return value;
}

async function loadConfig(directory) {
    const path = join(directory, CONFIG_FILE);
    if (!(await fileExists(path))) return null;
    try {
        return JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
        await log(`config parse failed: ${errorMessage(error)}`, { event: true, level: "error" });
        return null;
    }
}

async function saveConfig(directory, config) {
    const path = join(directory, CONFIG_FILE);
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    if (process.platform === "win32") {
        await runCaptured(
            "icacls",
            [path, "/inheritance:r", "/grant:r", "Administrators:F", "/grant:r", "SYSTEM:F"],
            { timeoutMs: 15_000 },
        );
    }
    await log(`config saved (${config.pairs?.length || 0} pair(s), interval ${config.interval_seconds}s)`);
}

async function loadOrCreateTag(directory) {
    const monitorTag = monitorTagPath();
    if (await fileExists(monitorTag)) {
        const existing = (await readFile(monitorTag, "utf8")).trim();
        if (existing) {
            await log(`using ServerMonitor tag ${existing}`);
            const localTag = join(directory, TAG_FILE);
            try {
                await writeFile(localTag, `${existing}\n`, "utf8");
            } catch {
                // ignore
            }
            return existing;
        }
    }

    const tagPath = join(directory, TAG_FILE);
    if (await fileExists(tagPath)) {
        const existing = (await readFile(tagPath, "utf8")).trim();
        if (existing) return existing;
    }
    const tag = randomUUID();
    await writeFile(tagPath, `${tag}\n`, "utf8");
    await log(`generated tag ${tag}`);
    return tag;
}

async function copySelfToInstallDir({ sourceExe, targetExe }) {
    try {
        await copyFile(sourceExe, targetExe);
        return true;
    } catch (error) {
        const staging = `${targetExe}.new`;
        try {
            await copyFile(sourceExe, staging);
            await runCaptured("schtasks", ["/End", "/TN", TASK_NAME], { timeoutMs: 15_000 });
            await Bun.sleep(1500);
            try {
                if (await fileExists(targetExe)) await unlink(targetExe);
            } catch {
                // ignore
            }
            await rename(staging, targetExe);
            return true;
        } catch (inner) {
            throw new Error(`failed to install ${EXE_FILE}: ${errorMessage(inner || error)}`);
        }
    }
}

async function ensureInstalledLocation() {
    const targetDir = targetInstallDirectory();
    const sourceDir = dirname(process.execPath);
    const sourceExe = process.execPath;
    const targetExe = join(targetDir, EXE_FILE);

    await mkdir(targetDir, { recursive: true });
    if (isSameDirectory(sourceDir, targetDir)) return targetDir;

    console.log(`[drive-sync] installing to ${targetDir}`);
    await copySelfToInstallDir({ sourceExe, targetExe });

    const forwardedArgs = Bun.argv
        .slice(2)
        .map((arg) => psSingleQuote(arg))
        .join(", ");
    const argList = forwardedArgs ? `@(${forwardedArgs})` : "@()";
    const start = await runCaptured("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath ${psSingleQuote(targetExe)} -WorkingDirectory ${psSingleQuote(targetDir)} -ArgumentList ${argList} -Verb RunAs`,
    ]);
    if (start.exitCode !== 0) {
        throw new Error(`failed to start installed copy: ${start.stderr || start.stdout}`);
    }
    console.log("[drive-sync] approve UAC if shown; this window will close");
    await Bun.sleep(4000);
    process.exit(0);
}

async function ensureElevated({ directory }) {
    if (process.platform !== "win32") return;
    if (await isElevated()) {
        await log("running elevated (Administrator)");
        return;
    }
    const exePath = join(directory, EXE_FILE);
    await log("not elevated — requesting Administrator via UAC", { event: true, level: "warning" });
    const start = await runCaptured("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath ${psSingleQuote(exePath)} -WorkingDirectory ${psSingleQuote(directory)} -Verb RunAs`,
    ]);
    if (start.exitCode !== 0) {
        await log(`UAC relaunch failed: ${start.stderr || start.stdout}`, { event: true, level: "error" });
        return;
    }
    await log("elevated copy starting; this non-admin process will exit");
    await Bun.sleep(2000);
    process.exit(0);
}

async function ensureScheduledTask({ directory }) {
    if (process.platform !== "win32") {
        await log("skip task scheduler (not Windows)");
        return;
    }
    if (!(await isElevated())) {
        await log("WARNING: not elevated — boot task will NOT be registered", {
            event: true,
            level: "warning",
        });
        return;
    }
    const exePath = join(directory, EXE_FILE);
    await log(`registering Task Scheduler boot task for ${exePath}`);
    const created = await runCaptured("schtasks", [
        "/Create",
        "/TN",
        TASK_NAME,
        "/SC",
        "ONSTART",
        "/RL",
        "HIGHEST",
        "/RU",
        "SYSTEM",
        "/F",
        "/TR",
        exePath,
    ]);
    if (created.exitCode === 0) {
        await log("task scheduler registered (ONSTART, SYSTEM)");
    } else {
        await log(
            `task scheduler registration failed: ${created.stderr || created.stdout || created.exitCode}`,
            { event: true, level: "error" },
        );
    }
}

async function runSetup(directory, { force = false } = {}) {
    const existing = await loadConfig(directory);
    if (existing && !force) return existing;

    const rl = createInterface({ input, output });
    try {
        console.log("");
        console.log("=== Setup (saved for future runs) ===");
        console.log("");

        const sourceHost = await ask(rl, "Source host IP or name");
        if (!sourceHost) throw new Error("source host is required");

        const username = await ask(rl, "Windows username for the share (DOMAIN\\user or .\\user)");
        if (!username) throw new Error("username is required");

        const password = await ask(rl, "Password (input hidden)", { secret: true });
        if (!password) throw new Error("password is required");

        const pairCountRaw = await ask(rl, "How many drive pairs to sync?", { defaultValue: "1" });
        const pairCount = Math.max(1, Number.parseInt(pairCountRaw, 10) || 1);
        const pairs = [];

        for (let index = 1; index <= pairCount; index++) {
            console.log("");
            console.log(`--- Pair ${index} ---`);
            const share = await ask(rl, "Source share name or UNC (e.g. g  or  \\\\192.168.1.1\\g)");
            const local = await ask(rl, "Local destination path on this machine", {
                defaultValue: /^[a-zA-Z0-9._-]+$/.test(share) ? `${share.toUpperCase()}:\\` : "",
            });
            if (!share || !local) throw new Error(`pair ${index} requires source and local path`);
            pairs.push({
                source_unc: toUnc(sourceHost, share),
                local_path: normalizeLocalPath(local),
            });
        }

        const intervalRaw = await ask(rl, "Check interval in seconds", {
            defaultValue: String(DEFAULT_INTERVAL_SECONDS),
        });
        const interval_seconds = Math.max(60, Number.parseInt(intervalRaw, 10) || DEFAULT_INTERVAL_SECONDS);

        const config = {
            source_host: sourceHost,
            username,
            password,
            pairs,
            interval_seconds,
            updated_at: new Date().toISOString(),
        };

        await saveConfig(directory, config);
        console.log("");
        console.log("Saved config:");
        console.log(`  source: ${sourceHost}`);
        for (const pair of pairs) {
            console.log(`  ${pair.source_unc}  ->  ${pair.local_path}`);
        }
        console.log(`  interval: ${interval_seconds}s`);
        console.log("");
        return config;
    } finally {
        rl.close();
    }
}

function parseRobocopyStats(stdout) {
    const stats = {
        dirs_copied: null,
        files_copied: null,
        files_skipped: null,
        files_failed: null,
        extras_deleted: null,
    };
    const lines = String(stdout || "").split(/\r?\n/);
    for (const line of lines) {
        const filesMatch = line.match(
            /^\s*Files\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i,
        );
        if (filesMatch) {
            stats.files_copied = Number(filesMatch[2]);
            stats.files_skipped = Number(filesMatch[3]);
            stats.files_failed = Number(filesMatch[5]);
            stats.extras_deleted = Number(filesMatch[6]);
        }
        const dirsMatch = line.match(
            /^\s*Dirs\s*:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/i,
        );
        if (dirsMatch) {
            stats.dirs_copied = Number(dirsMatch[2]);
        }
    }

    const failedPaths = [];
    for (const line of lines) {
        if (/ERROR\s+\d+\s*\(/i.test(line) || /\s+FAILED\s+/i.test(line)) {
            failedPaths.push(line.trim().slice(0, 500));
        }
    }
    return { stats, failedPaths: failedPaths.slice(0, 50) };
}

function robocopySucceeded(exitCode) {
    // 0–7 = success / extra files / mismatches; >=8 = failure
    return exitCode >= 0 && exitCode <= 7;
}

async function pathAccessible(path) {
    try {
        await access(path, fsConstants.F_OK);
        return { ok: true };
    } catch (error) {
        return { ok: false, error: errorMessage(error) };
    }
}

async function connectShare({ unc, username, password }) {
    await runCaptured("net", ["use", unc, "/delete", "/y"], { timeoutMs: 30_000 });
    const result = await runCaptured(
        "net",
        ["use", unc, password, `/user:${username}`, "/persistent:no"],
        { timeoutMs: 60_000 },
    );
    if (result.exitCode !== 0) {
        return {
            ok: false,
            error: result.stderr || result.stdout || `net use exit ${result.exitCode}`,
        };
    }
    return { ok: true };
}

async function disconnectShare(unc) {
    await runCaptured("net", ["use", unc, "/delete", "/y"], { timeoutMs: 30_000 });
}

async function mirrorPair({ pair, username, password }) {
    const started = Date.now();
    const result = {
        source_unc: pair.source_unc,
        local_path: pair.local_path,
        status: "error",
        source_alive: false,
        local_alive: false,
        copied: null,
        deleted: null,
        skipped: null,
        failed: null,
        duration_ms: 0,
        robocopy_exit_code: null,
        errors: [],
        events: [],
    };

    const push = async (message, level = "info") => {
        result.events.push({ at: new Date().toISOString(), level, message });
        await log(message, { event: message, level });
    };

    const localCheck = await pathAccessible(pair.local_path);
    result.local_alive = localCheck.ok;
    if (!localCheck.ok) {
        const msg = `local destination not accessible: ${pair.local_path} (${localCheck.error})`;
        result.errors.push(msg);
        await push(msg, "error");
        result.duration_ms = Date.now() - started;
        return result;
    }

    await push(`connecting share ${pair.source_unc} as ${username}`);
    const connected = await connectShare({
        unc: pair.source_unc,
        username,
        password,
    });
    if (!connected.ok) {
        const msg = `share auth/connect failed for ${pair.source_unc}: ${connected.error}`;
        result.errors.push(msg);
        await push(msg, "error");
        result.duration_ms = Date.now() - started;
        return result;
    }

    const sourceCheck = await pathAccessible(pair.source_unc);
    result.source_alive = sourceCheck.ok;
    if (!sourceCheck.ok) {
        const msg = `source path not found/accessible: ${pair.source_unc} (${sourceCheck.error})`;
        result.errors.push(msg);
        await push(msg, "error");
        await disconnectShare(pair.source_unc);
        result.duration_ms = Date.now() - started;
        return result;
    }

    await push(`starting robocopy /MIR ${pair.source_unc} -> ${pair.local_path}`);
    const copy = await runCaptured(
        "robocopy",
        [
            pair.source_unc,
            pair.local_path,
            "/MIR",
            "/R:1",
            "/W:1",
            "/XJ",
            "/FFT",
            "/Z",
            "/NP",
            "/BYTES",
        ],
        { timeoutMs: 6 * 60 * 60 * 1000 },
    );

    result.robocopy_exit_code = copy.exitCode;
    const parsed = parseRobocopyStats(copy.stdout);
    result.copied = parsed.stats.files_copied;
    result.deleted = parsed.stats.extras_deleted;
    result.skipped = parsed.stats.files_skipped;
    result.failed = parsed.stats.files_failed;

    for (const failedLine of parsed.failedPaths) {
        result.errors.push(failedLine);
        await push(`copy issue: ${failedLine}`, "warning");
    }

    if (copy.timedOut) {
        const msg = `robocopy timed out for ${pair.source_unc}`;
        result.errors.push(msg);
        await push(msg, "error");
        result.status = "error";
    } else if (robocopySucceeded(copy.exitCode)) {
        result.status = (result.failed || 0) > 0 ? "partial" : "ok";
        await push(
            `pair done exit=${copy.exitCode} copied=${result.copied ?? "n/a"} deleted=${result.deleted ?? "n/a"} skipped=${result.skipped ?? "n/a"} failed=${result.failed ?? "n/a"}`,
            result.status === "ok" ? "info" : "warning",
        );
    } else {
        const detail = (copy.stderr || copy.stdout || "").slice(-1000);
        const msg = `robocopy failed exit=${copy.exitCode}${detail ? `: ${detail}` : ""}`;
        result.errors.push(msg);
        await push(msg, "error");
        result.status = "error";
    }

    await disconnectShare(pair.source_unc);
    result.duration_ms = Date.now() - started;
    return result;
}

function summarizeCycle(pairResults) {
    if (!pairResults.length) return "error";
    const statuses = pairResults.map((pair) => pair.status);
    if (statuses.every((status) => status === "ok")) return "ok";
    if (statuses.every((status) => status === "error")) return "error";
    return "partial";
}

async function postStatus({ tag, payload }) {
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
            await log(
                `failed to post status (HTTP ${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
                { event: true, level: "error" },
            );
            return false;
        }
        await log("posted status to hammerbyte.co.in");
        return true;
    } catch (error) {
        await log(`failed to post status: ${errorMessage(error)}`, { event: true, level: "error" });
        return false;
    }
}

async function runCycle({ config, tag }) {
    clearCycleEvents();
    const startedAt = new Date().toISOString();
    await log(`==== sync cycle start ==== source=${config.source_host}`);

    const pairResults = [];
    for (const pair of config.pairs || []) {
        try {
            pairResults.push(
                await mirrorPair({
                    pair,
                    username: config.username,
                    password: config.password,
                }),
            );
        } catch (error) {
            const message = `pair crashed ${pair.source_unc}: ${errorMessage(error)}`;
            await log(message, { event: true, level: "error" });
            pairResults.push({
                source_unc: pair.source_unc,
                local_path: pair.local_path,
                status: "error",
                source_alive: false,
                local_alive: false,
                copied: null,
                deleted: null,
                skipped: null,
                failed: null,
                duration_ms: 0,
                robocopy_exit_code: null,
                errors: [message],
                events: [],
            });
        }
    }

    const status = summarizeCycle(pairResults);
    const totals = pairResults.reduce(
        (acc, pair) => {
            acc.copied += Number(pair.copied) || 0;
            acc.deleted += Number(pair.deleted) || 0;
            acc.skipped += Number(pair.skipped) || 0;
            acc.failed += Number(pair.failed) || 0;
            return acc;
        },
        { copied: 0, deleted: 0, skipped: 0, failed: 0 },
    );

    const finishedAt = new Date().toISOString();
    await log(
        `==== sync cycle end ==== status=${status} copied=${totals.copied} deleted=${totals.deleted} skipped=${totals.skipped} failed=${totals.failed}`,
    );

    const payload = {
        type: "drive_sync",
        agent_version: AGENT_VERSION,
        hostname: hostname(),
        source_host: config.source_host,
        status,
        started_at: startedAt,
        finished_at: finishedAt,
        interval_seconds: config.interval_seconds,
        totals,
        pairs: pairResults.map((pair) => ({
            source_unc: pair.source_unc,
            local_path: pair.local_path,
            status: pair.status,
            source_alive: pair.source_alive,
            local_alive: pair.local_alive,
            copied: pair.copied,
            deleted: pair.deleted,
            skipped: pair.skipped,
            failed: pair.failed,
            duration_ms: pair.duration_ms,
            robocopy_exit_code: pair.robocopy_exit_code,
            errors: pair.errors,
        })),
        events: cycleEvents.slice(-200),
        errors: pairResults.flatMap((pair) => pair.errors || []).slice(0, 100),
        collected_at: finishedAt,
    };

    await postStatus({ tag, payload });
    return { status, payload };
}

async function main() {
    printBanner();
    const forceSetup = Bun.argv.slice(2).includes("--setup");

    if (process.platform === "win32") {
        await ensureInstalledLocation();
    }

    const directory = targetInstallDirectory();
    logDirectory = directory;
    await mkdir(directory, { recursive: true });

    await log("==== drive-sync start ====");
    await log(`host ${HOST}`);
    await log(`install dir ${directory}`);
    await log(`pid ${process.pid}`);

    await ensureElevated({ directory });
    const tag = await loadOrCreateTag(directory);
    await log(`tag ${tag}`);
    await ensureScheduledTask({ directory });

    let config = await runSetup(directory, { force: forceSetup });
    if (!config) {
        await log("no config — running setup", { event: true, level: "warning" });
        config = await runSetup(directory, { force: true });
    }

    while (true) {
        try {
            config = (await loadConfig(directory)) || config;
            await runCycle({ config, tag });
        } catch (error) {
            await log(`cycle failed: ${errorMessage(error)}`, { event: true, level: "error" });
            try {
                await postStatus({
                    tag,
                    payload: {
                        type: "drive_sync",
                        agent_version: AGENT_VERSION,
                        hostname: hostname(),
                        source_host: config?.source_host || null,
                        status: "error",
                        errors: [errorMessage(error)],
                        events: cycleEvents.slice(-50),
                        collected_at: new Date().toISOString(),
                    },
                });
            } catch {
                // ignore
            }
        }

        const sleepSeconds = Math.max(60, Number(config?.interval_seconds) || DEFAULT_INTERVAL_SECONDS);
        await log(`sleeping ${sleepSeconds}s`);
        await Bun.sleep(sleepSeconds * 1000);
    }
}

try {
    await main();
} catch (error) {
    console.error(`[drive-sync] fatal: ${errorMessage(error)}`);
    process.exit(1);
}

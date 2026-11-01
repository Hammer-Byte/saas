/**
 * HammerByte Server Supervisor — parent process.
 * Usage: run supervisor.exe as Administrator once.
 * Installs itself to %ProgramData%\HammerByte\ServerMonitor and registers a boot task.
 * After reboot it runs as SYSTEM (no window) — check supervisor.log in that folder.
 */

import {
    mkdir,
    readFile,
    writeFile,
    appendFile,
    rename,
    unlink,
    access,
    copyFile,
    constants as fsConstants,
} from "node:fs/promises";
import { dirname, join, basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const HOST = "https://hammerbyte.co.in";
const AGENT_DOWNLOAD_URL = `${HOST}/public/server-monitors/agent.exe`;
const TASK_NAME = "HammerByteServerMonitor";
const TAG_FILE = ".server-tag";
const AGENT_FILE = "agent.exe";
const LOG_FILE = "supervisor.log";
const SUPERVISOR_FILE = "supervisor.exe";

let logDirectory = null;

function targetInstallDirectory() {
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
    return join(programData, "HammerByte", "ServerMonitor");
}

function normalizePath(path) {
    return resolve(path).replaceAll("/", "\\").toLowerCase();
}

function isSameDirectory(left, right) {
    return normalizePath(left) === normalizePath(right);
}

async function log(message) {
    const stamp = new Date().toISOString();
    const line = `[supervisor ${stamp}] ${message}`;
    console.log(line);
    if (!logDirectory) {
        return;
    }
    try {
        await appendFile(join(logDirectory, LOG_FILE), `${line}\n`, "utf8");
    } catch {
        // ignore log write failures
    }
}

function printBanner() {
    console.log("##############################");
    console.log("# HammerByte Server Supervisor #");
    console.log("##############################");
}

async function fileExists(path) {
    try {
        await access(path, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function loadOrCreateTag(directory) {
    const tagPath = join(directory, TAG_FILE);
    if (await fileExists(tagPath)) {
        const existing = (await readFile(tagPath, "utf8")).trim();
        if (existing) {
            return existing;
        }
    }
    const tag = randomUUID();
    await writeFile(tagPath, `${tag}\n`, "utf8");
    await log(`generated tag ${tag}`);
    return tag;
}

async function isElevated() {
    if (process.platform !== "win32") {
        return false;
    }
    try {
        const processResult = Bun.spawn(["net", "session"], {
            stdout: "ignore",
            stderr: "ignore",
        });
        const exitCode = await processResult.exited;
        return exitCode === 0;
    } catch {
        return false;
    }
}

function psSingleQuote(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

async function runCaptured(command, args) {
    const processResult = Bun.spawn([command, ...args], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const exitCode = await processResult.exited;
    const stdout = (await new Response(processResult.stdout).text()).trim();
    const stderr = (await new Response(processResult.stderr).text()).trim();
    return { exitCode, stdout, stderr };
}

async function queryScheduledTask() {
    const result = await runCaptured("schtasks", [
        "/Query",
        "/TN",
        TASK_NAME,
        "/V",
        "/FO",
        "LIST",
    ]);
    if (result.exitCode !== 0) {
        await log(`task query: NOT FOUND (${result.stderr || result.stdout || `exit ${result.exitCode}`})`);
        return false;
    }

    const lines = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) =>
            /^(TaskName|Status|Last Run Time|Last Result|Next Run Time|Task To Run|Run As User):/i.test(
                line,
            ),
        );
    for (const line of lines) {
        await log(`task query: ${line}`);
    }
    return true;
}

async function stopScheduledTask() {
    await runCaptured("schtasks", ["/End", "/TN", TASK_NAME]);
}

async function copySupervisorToInstallDir({ sourceExe, targetExe }) {
    try {
        await copyFile(sourceExe, targetExe);
        return true;
    } catch (error) {
        const stagingPath = `${targetExe}.new`;
        try {
            await copyFile(sourceExe, stagingPath);
            await stopScheduledTask();
            await Bun.sleep(1500);
            try {
                if (await fileExists(targetExe)) {
                    await unlink(targetExe);
                }
            } catch {
                // ignore
            }
            await rename(stagingPath, targetExe);
            return true;
        } catch (innerError) {
            throw new Error(
                `failed to install supervisor.exe: ${innerError?.message || error?.message || innerError}`,
            );
        }
    }
}

/**
 * If launched from Downloads (or anywhere else), copy into ProgramData and
 * re-launch from there so the stable install dir owns tag/agent/logs/task.
 */
async function ensureInstalledLocation() {
    const targetDir = targetInstallDirectory();
    const sourceDir = dirname(process.execPath);
    const sourceExe = process.execPath;
    const targetExe = join(targetDir, SUPERVISOR_FILE);

    await mkdir(targetDir, { recursive: true });

    if (isSameDirectory(sourceDir, targetDir)) {
        return targetDir;
    }

    console.log("");
    console.log("=== INSTALLING ===");
    console.log(`From: ${sourceExe}`);
    console.log(`To:   ${targetExe}`);
    console.log("==================");
    console.log("");

    await copySupervisorToInstallDir({ sourceExe, targetExe });
    if (!(await fileExists(targetExe))) {
        throw new Error(`install failed; missing ${targetExe}`);
    }
    console.log("[supervisor] copied supervisor.exe OK");

    const sourceTag = join(sourceDir, TAG_FILE);
    const targetTag = join(targetDir, TAG_FILE);
    if ((await fileExists(sourceTag)) && !(await fileExists(targetTag))) {
        await copyFile(sourceTag, targetTag);
        console.log("[supervisor] migrated server tag to install directory");
    }

    // Start-Process opens a real new console window (plain Bun.spawn was invisible).
    console.log("[supervisor] opening ProgramData supervisor in a new window...");
    const start = await runCaptured("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath ${psSingleQuote(targetExe)} -WorkingDirectory ${psSingleQuote(targetDir)} -Verb RunAs`,
    ]);
    if (start.exitCode !== 0) {
        throw new Error(
            `failed to start installed supervisor: ${start.stderr || start.stdout || `exit ${start.exitCode}`}`,
        );
    }

    console.log("");
    console.log(`[supervisor] installed at ${targetDir}`);
    console.log("[supervisor] approve the UAC prompt if shown — ProgramData copy must run as Administrator");
    console.log("[supervisor] this Downloads window will close in 5 seconds");
    console.log("[supervisor] you can delete the Downloads copy afterward");
    console.log("");
    await Bun.sleep(5000);
    process.exit(0);
}

/** Relaunch this EXE with UAC elevation so Task Scheduler can be registered. */
async function ensureElevated({ directory }) {
    if (process.platform !== "win32") {
        return;
    }

    if (await isElevated()) {
        await log("running elevated (Administrator)");
        return;
    }

    const supervisorPath = join(directory, SUPERVISOR_FILE);
    await log("not elevated — requesting Administrator via UAC");
    console.log("");
    console.log("=== ADMIN REQUIRED ===");
    console.log("Approve the UAC prompt to register the boot task.");
    console.log("======================");
    console.log("");

    const start = await runCaptured("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Start-Process -FilePath ${psSingleQuote(supervisorPath)} -WorkingDirectory ${psSingleQuote(directory)} -Verb RunAs`,
    ]);

    if (start.exitCode !== 0) {
        await log(
            `UAC relaunch failed: ${start.stderr || start.stdout || `exit ${start.exitCode}`}`,
        );
        await log(
            "boot task was NOT registered — right-click supervisor.exe → Run as administrator once",
        );
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

    const elevated = await isElevated();
    if (!elevated) {
        await log(
            "WARNING: not elevated — boot task will NOT be registered",
        );
        await queryScheduledTask();
        return;
    }

    const supervisorPath = join(directory, SUPERVISOR_FILE);
    if (!(await fileExists(supervisorPath))) {
        await log(`cannot register task; missing ${supervisorPath}`);
        return;
    }

    await log(`registering Task Scheduler boot task for ${supervisorPath}`);

    // schtasks only — PowerShell Register-ScheduledTask can hang on some Win11 setups.
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
        supervisorPath,
    ]);

    if (created.exitCode === 0) {
        await log("task scheduler registered (ONSTART, SYSTEM)");
        if (created.stdout) {
            await log(`schtasks: ${created.stdout}`);
        }
    } else {
        await log(
            `task scheduler registration failed: ${created.stderr || created.stdout || `exit ${created.exitCode}`}`,
        );
    }

    await queryScheduledTask();
}

async function downloadAgent({ directory }) {
    const targetPath = join(directory, AGENT_FILE);
    const tempPath = `${targetPath}.new`;

    await log("updating agent");
    const response = await fetch(AGENT_DOWNLOAD_URL);
    if (!response.ok) {
        throw new Error(`download failed (HTTP ${response.status})`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length) {
        throw new Error("download failed (empty file)");
    }

    await writeFile(tempPath, bytes);
    if (await fileExists(targetPath)) {
        await unlink(targetPath);
    }
    await rename(tempPath, targetPath);

    await log("agent updated");
}

async function ensureAgentPresent({ directory }) {
    const agentPath = join(directory, AGENT_FILE);
    if (!(await fileExists(agentPath))) {
        await log("agent missing; downloading");
        await downloadAgent({ directory });
    }
}

async function runAgentOnce({ tag, directory }) {
    const agentPath = join(directory, AGENT_FILE);
    if (!(await fileExists(agentPath))) {
        throw new Error("agent.exe not found");
    }

    await log("starting agent");
    const child = Bun.spawn([agentPath, "--tag", tag], {
        cwd: directory,
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
    });

    const forward = async (stream) => {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value, { stream: true });
            if (!text) continue;
            process.stdout.write(text);
            if (logDirectory) {
                try {
                    await appendFile(join(logDirectory, LOG_FILE), text, "utf8");
                } catch {
                    // ignore
                }
            }
        }
    };

    await Promise.all([forward(child.stdout), forward(child.stderr)]);
    const exitCode = await child.exited;
    await log(`agent exited (code ${exitCode}); restarting after refresh`);
    return exitCode;
}

async function main() {
    printBanner();

    if (process.platform === "win32") {
        await ensureInstalledLocation();
    }

    const directory = targetInstallDirectory();
    logDirectory = directory;
    await mkdir(directory, { recursive: true });

    await log("==== supervisor start ====");
    await log(`host ${HOST}`);
    await log(`install dir ${directory}`);
    await log(`pid ${process.pid}`);

    await ensureElevated({ directory });

    const tag = await loadOrCreateTag(directory);
    await log(`tag ${tag}`);

    await ensureScheduledTask({ directory });


    while (true) {
        try {
            await ensureAgentPresent({ directory });
            await runAgentOnce({ tag, directory });
            await downloadAgent({ directory });
        } catch (error) {
            await log(`error: ${error?.message || error}`);
            await log("retrying in 30s");
            await Bun.sleep(30_000);
        }
    }
}

await main();

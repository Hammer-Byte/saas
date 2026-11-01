/**
 * HammerByte Server Supervisor — parent process.
 * Usage: supervisor.exe
 */

import {
    mkdir,
    readFile,
    writeFile,
    rename,
    unlink,
    access,
    constants as fsConstants,
} from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { randomUUID } from "node:crypto";

const HOST = "https://hammerbyte.co.in";
const AGENT_DOWNLOAD_URL = `${HOST}/public/server-monitors/agent.exe`;
const TASK_NAME = "HammerByteServerMonitor";
const TAG_FILE = ".server-tag";
const AGENT_FILE = "agent.exe";

function installDirectory() {
    const executableName = basename(process.execPath).toLowerCase();
    if (executableName === "supervisor.exe" || executableName === "supervisor") {
        return dirname(process.execPath);
    }
    return import.meta.dir;
}

function log(message) {
    const stamp = new Date().toISOString();
    console.log(`[supervisor ${stamp}] ${message}`);
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
    log(`generated tag ${tag}`);
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

async function taskExists() {
    try {
        const processResult = Bun.spawn(["schtasks", "/Query", "/TN", TASK_NAME], {
            stdout: "ignore",
            stderr: "ignore",
        });
        return (await processResult.exited) === 0;
    } catch {
        return false;
    }
}

async function ensureScheduledTask({ directory }) {
    if (process.platform !== "win32") {
        log("skip task scheduler (not Windows)");
        return;
    }

    const elevated = await isElevated();
    if (!elevated) {
        log("not elevated; cannot ensure Task Scheduler registration");
        return;
    }

    if (await taskExists()) {
        log("task scheduler already present");
        return;
    }

    const supervisorPath = join(directory, "supervisor.exe");
    const processResult = Bun.spawn(
        [
            "schtasks",
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
            `"${supervisorPath}"`,
        ],
        {
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const exitCode = await processResult.exited;
    if (exitCode === 0) {
        log("task scheduler registered");
    } else {
        const stderr = await new Response(processResult.stderr).text();
        log(`task scheduler registration failed: ${stderr.trim() || `exit ${exitCode}`}`);
    }
}

async function downloadAgent({ directory }) {
    const targetPath = join(directory, AGENT_FILE);
    const tempPath = `${targetPath}.new`;

    log("updating agent");
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

    log("agent updated");
}

async function ensureAgentPresent({ directory }) {
    const agentPath = join(directory, AGENT_FILE);
    if (!(await fileExists(agentPath))) {
        log("agent missing; downloading");
        await downloadAgent({ directory });
    }
}

async function runAgentOnce({ tag, directory }) {
    const agentPath = join(directory, AGENT_FILE);
    if (!(await fileExists(agentPath))) {
        throw new Error("agent.exe not found");
    }

    log("starting agent");
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
            if (text) {
                process.stdout.write(text);
            }
        }
    };

    await Promise.all([forward(child.stdout), forward(child.stderr)]);
    const exitCode = await child.exited;
    log(`agent exited (code ${exitCode}); restarting after refresh`);
    return exitCode;
}

async function main() {
    printBanner();

    const directory = installDirectory();
    await mkdir(directory, { recursive: true });

    log(`host ${HOST}`);
    log(`install dir ${directory}`);

    const tag = await loadOrCreateTag(directory);
    log(`tag ${tag}`);

    await ensureScheduledTask({ directory });

    while (true) {
        try {
            await ensureAgentPresent({ directory });
            await runAgentOnce({ tag, directory });
            await downloadAgent({ directory });
        } catch (error) {
            log(`error: ${error?.message || error}`);
            log("retrying in 30s");
            await Bun.sleep(30_000);
        }
    }
}

await main();

/**
 * HammerByte Server Supervisor — parent process.
 * Usage: supervisor.exe --host https://your-site.example
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

const TASK_NAME = "HammerByteServerMonitor";
const TAG_FILE = ".server-tag";
const AGENT_FILE = "agent.exe";

function parseArgs(argv) {
    const options = { host: null };
    for (let index = 0; index < argv.length; index++) {
        const argument = argv[index];
        if (argument === "--host" && argv[index + 1]) {
            options.host = argv[++index];
        }
    }
    return options;
}

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

async function ensureScheduledTask({ host, directory }) {
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
    const tr = `"${supervisorPath}" --host ${host}`;
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
            tr,
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

async function downloadAgent({ host, directory }) {
    const baseUrl = host.replace(/\/+$/, "");
    const url = `${baseUrl}/public/server-monitors/agent.exe`;
    const targetPath = join(directory, AGENT_FILE);
    const tempPath = `${targetPath}.new`;

    log("updating agent");
    const response = await fetch(url);
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

async function ensureAgentPresent({ host, directory }) {
    const agentPath = join(directory, AGENT_FILE);
    if (!(await fileExists(agentPath))) {
        log("agent missing; downloading");
        await downloadAgent({ host, directory });
    }
}

async function runAgentOnce({ host, tag, directory }) {
    const agentPath = join(directory, AGENT_FILE);
    if (!(await fileExists(agentPath))) {
        throw new Error("agent.exe not found");
    }

    log("starting agent");
    const child = Bun.spawn([agentPath, "--host", host, "--tag", tag], {
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

    const options = parseArgs(Bun.argv.slice(2));
    if (!options.host) {
        console.error("Usage: supervisor.exe --host <https://your-hammerbyte-site>");
        process.exit(1);
    }

    const directory = installDirectory();
    await mkdir(directory, { recursive: true });

    log(`set to host ${options.host}`);
    log(`install dir ${directory}`);

    const tag = await loadOrCreateTag(directory);
    log(`tag ${tag}`);

    await ensureScheduledTask({ host: options.host, directory });

    while (true) {
        try {
            await ensureAgentPresent({ host: options.host, directory });
            await runAgentOnce({ host: options.host, tag, directory });
            await downloadAgent({ host: options.host, directory });
        } catch (error) {
            log(`error: ${error?.message || error}`);
            log("retrying in 30s");
            await Bun.sleep(30_000);
        }
    }
}

await main();

/**
 * HammerByte Server Supervisor — parent process.
 * Usage: run supervisor.exe as Administrator once to register boot task.
 */

import {
    mkdir,
    readFile,
    writeFile,
    appendFile,
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
const LOG_FILE = "supervisor.log";
const TASK_XML_FILE = "hammerbyte-monitor-task.xml";

let logDirectory = null;

function installDirectory() {
    const executableName = basename(process.execPath).toLowerCase();
    if (executableName === "supervisor.exe" || executableName === "supervisor") {
        return dirname(process.execPath);
    }
    return import.meta.dir;
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

function escapeXml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function buildTaskXml({ supervisorPath, directory }) {
    const command = escapeXml(supervisorPath);
    const workingDirectory = escapeXml(directory);
    // Boot + 60s delay so networking is usually up; restart if the process dies.
    return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>HammerByte Server Monitor Supervisor</Description>
  </RegistrationInfo>
  <Triggers>
    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT1M</Delay>
    </BootTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>999</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${command}</Command>
      <WorkingDirectory>${workingDirectory}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
`;
}

async function ensureScheduledTask({ directory }) {
    if (process.platform !== "win32") {
        await log("skip task scheduler (not Windows)");
        return;
    }

    const elevated = await isElevated();
    if (!elevated) {
        await log(
            "not elevated; Task Scheduler NOT registered — re-run supervisor.exe as Administrator once",
        );
        return;
    }

    const supervisorPath = join(directory, "supervisor.exe");
    if (!(await fileExists(supervisorPath))) {
        await log(`cannot register task; missing ${supervisorPath}`);
        return;
    }

    const xmlPath = join(directory, TASK_XML_FILE);
    const xml = buildTaskXml({ supervisorPath, directory });
    // schtasks expects UTF-16 LE with BOM for /XML
    await writeFile(xmlPath, Buffer.from(`\ufeff${xml}`, "utf16le"));

    const processResult = Bun.spawn(
        ["schtasks", "/Create", "/TN", TASK_NAME, "/XML", xmlPath, "/F"],
        {
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const exitCode = await processResult.exited;
    const stdout = (await new Response(processResult.stdout).text()).trim();
    const stderr = (await new Response(processResult.stderr).text()).trim();

    if (exitCode === 0) {
        await log("task scheduler registered/updated (boot + 60s, SYSTEM, restart on failure)");
    } else {
        await log(
            `task scheduler registration failed: ${stderr || stdout || `exit ${exitCode}`}`,
        );
    }

    try {
        await unlink(xmlPath);
    } catch {
        // keep xml if unlink fails; harmless
    }
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

    const directory = installDirectory();
    logDirectory = directory;
    await mkdir(directory, { recursive: true });

    await log(`host ${HOST}`);
    await log(`install dir ${directory}`);

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

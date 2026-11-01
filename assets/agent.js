/**
 * HammerByte Server Agent — metrics worker (child process).
 * Spawned by supervisor with --tag.
 * Sends metrics twice (900s apart), then exits so supervisor can refresh the EXE.
 */

import { hostname } from "node:os";
import { cpus, freemem, totalmem, uptime } from "node:os";

const HOST = "https://hammerbyte.co.in";
const METRICS_URL = `${HOST}/api/servers/metrics`;
const METRICS_INTERVAL_SECONDS = Number(Bun.env.HB_METRICS_INTERVAL) || 900;
const SENDS_PER_RUN = 2;
const AGENT_VERSION = "0.1.0";

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

function collectMetrics() {
    const cpuCount = cpus()?.length || 0;
    return {
        agent_version: AGENT_VERSION,
        hostname: hostname(),
        pid: process.pid,
        uptime_seconds: Math.round(uptime()),
        memory: {
            free_mb: Math.round(freemem() / (1024 * 1024)),
            total_mb: Math.round(totalmem() / (1024 * 1024)),
        },
        cpu_count: cpuCount,
        collected_at: new Date().toISOString(),
        platform: process.platform,
    };
}

async function sendMetrics({ tag }) {
    const payload = collectMetrics();

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

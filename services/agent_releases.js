import { join } from "node:path";
import { logger } from "@hammerbyte/utils";
import {
    getAgentReleaseById,
    getAllAgentReleases,
    getLatestAgentReleases,
    setLatestAgentRelease,
    upsertAgentRelease,
} from "../db/agent_releases.js";

const MANIFEST_PATH = join(process.cwd(), "public", "agents", "manifest.build.json");
const LATEST_CACHE_MS = 30 * 1000;

let latestCache = null;
let latestCacheAt = 0;

export function invalidateLatestAgentReleases() {
    latestCache = null;
    latestCacheAt = 0;
}

/** Map of component -> latest release row (cached briefly; invalidated on change). */
export async function getLatestReleaseMap() {
    if (latestCache && Date.now() - latestCacheAt < LATEST_CACHE_MS) {
        return latestCache;
    }
    const rows = await getLatestAgentReleases();
    const map = {};
    for (const row of rows) {
        map[row.component] = {
            id: row.id,
            version: row.version,
            url: row.file_path,
            sha256: row.sha256,
        };
    }
    latestCache = map;
    latestCacheAt = Date.now();
    return map;
}

function compareSemver(a, b) {
    const parse = (value) =>
        String(value || "")
            .split(".")
            .map((part) => {
                const n = Number.parseInt(part, 10);
                return Number.isFinite(n) ? n : 0;
            });
    const left = parse(a);
    const right = parse(b);
    const count = Math.max(left.length, right.length);
    for (let i = 0; i < count; i++) {
        const x = left[i] || 0;
        const y = right[i] || 0;
        if (x < y) return -1;
        if (x > y) return 1;
    }
    return 0;
}

/**
 * Register artifacts produced by scripts/build-agents.js.
 * A newly inserted version becomes latest automatically (deploy = roll forward).
 * Use the Agent Releases page to pin an older build; the next newer insert will
 * promote again. Agents refuse downgrades even if latest points older.
 */
export async function registerBuiltAgentReleases() {
    const file = Bun.file(MANIFEST_PATH);
    if (!(await file.exists())) {
        logger.error("agent manifest missing - run `bun run build:agents`");
        return;
    }
    let manifest;
    try {
        manifest = await file.json();
    } catch (error) {
        logger.error(`agent manifest unreadable: ${error}`);
        return;
    }
    const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
    const existingLatest = await getLatestReleaseMap();

    for (const artifact of artifacts) {
        const { component, version, file_path, sha256, size_bytes } = artifact || {};
        if (!component || !version || !file_path || !/^[a-f0-9]{64}$/.test(String(sha256))) {
            logger.error(`agent manifest entry skipped: ${JSON.stringify(artifact)}`);
            continue;
        }
        const inserted = await upsertAgentRelease({
            component,
            version,
            file_path,
            sha256,
            size_bytes: Number(size_bytes) || 0,
        });
        if (inserted) {
            logger.info(`agent release registered: ${component} ${version}`);
        }
        const current = existingLatest[component];
        // New row, or nothing marked latest yet. Do not re-promote on every boot
        // (that would undo an admin pin to an older build).
        if (inserted || !current) {
            const rows = await getAllAgentReleases();
            const row = rows.find((r) => r.component === component && r.version === version);
            if (row) {
                await setLatestAgentRelease({ component, id: row.id });
                if (!current || compareSemver(version, current.version) !== 0) {
                    logger.info(`agent release latest: ${component} ${version}`);
                }
                existingLatest[component] = { id: row.id, version };
            }
        }
    }
    invalidateLatestAgentReleases();
}

export async function listAgentReleases({ set }) {
    const releases = await getAllAgentReleases();
    set.status = 200;
    return { releases };
}

export async function markAgentReleaseLatest({ params, set }) {
    const release = await getAgentReleaseById({ id: params.id });
    if (!release) {
        set.status = 404;
        return { error: "Release not found" };
    }
    await setLatestAgentRelease({ component: release.component, id: release.id });
    invalidateLatestAgentReleases();
    set.status = 200;
    return { message: `${release.component} ${release.version} is now latest` };
}

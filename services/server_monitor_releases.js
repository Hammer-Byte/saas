import { createHash } from "node:crypto";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { filer, logger } from "@hammerbyte/utils";
import {
    createServerMonitorRelease,
    deactivateServerMonitorReleasesByKind,
    getAllServerMonitorReleases,
    getLatestActiveServerMonitorReleaseByKind,
} from "../db/server_monitor_releases.js";

const RELEASE_KINDS = new Set(["agent", "supervisor"]);

function releasesDirectory() {
    return join(Bun.env.DIRECTORY_MEDIA, "server-monitor-releases");
}

function releaseDiskPath(fileName) {
    return join(releasesDirectory(), fileName);
}

export async function getLatestServerMonitorBinary({ kind, set }) {
    const release = await getLatestActiveServerMonitorReleaseByKind({ kind });
    if (!release) {
        set.status = 404;
        return { error: "Release not found" };
    }

    const diskFile = Bun.file(releaseDiskPath(release.file_name));
    if (!(await diskFile.exists())) {
        set.status = 404;
        return { error: "Release file not found" };
    }

    const downloadName = kind === "supervisor" ? "supervisor.exe" : "agent.exe";
    set.headers["Content-Disposition"] = `attachment; filename="${downloadName}"`;
    set.headers["Content-Type"] = "application/octet-stream";
    set.headers["X-Release-Version"] = release.version;
    return diskFile;
}

export async function getServerMonitorReleases({ set }) {
    const releases = await getAllServerMonitorReleases();
    const latestAgent = await getLatestActiveServerMonitorReleaseByKind({ kind: "agent" });
    const latestSupervisor = await getLatestActiveServerMonitorReleaseByKind({
        kind: "supervisor",
    });
    set.status = 200;
    return {
        releases,
        latest: {
            agent: latestAgent,
            supervisor: latestSupervisor,
        },
    };
}

export async function addServerMonitorRelease({ body, set }) {
    const kind = String(body.kind || "").trim();
    const version = String(body.version || "").trim();
    const uploadedFile = body.file;

    if (!RELEASE_KINDS.has(kind)) {
        set.status = 400;
        return { error: "kind must be agent or supervisor" };
    }

    if (!version) {
        set.status = 400;
        return { error: "version is required" };
    }

    if (!uploadedFile) {
        set.status = 400;
        return { error: "File is required" };
    }

    try {
        await mkdir(releasesDirectory(), { recursive: true });

        const safeVersion = version.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 32);
        const randomPart = filer.generateRandomFileName();
        const fileName = `${kind}-${safeVersion}-${randomPart}.exe`;
        const diskPath = releaseDiskPath(fileName);

        const fileBuffer = Buffer.from(await uploadedFile.arrayBuffer());
        const sha256 = createHash("sha256").update(fileBuffer).digest("hex");
        await Bun.write(diskPath, fileBuffer);

        await deactivateServerMonitorReleasesByKind({ kind });
        const id = await createServerMonitorRelease({
            kind,
            version: safeVersion,
            file_name: fileName,
            sha256,
            active: true,
        });

        if (!id) {
            set.status = 400;
            return { error: "Failed to create release" };
        }

        const release = await getLatestActiveServerMonitorReleaseByKind({ kind });
        logger.success(
            `addServerMonitorRelease | kind=${kind} version=${safeVersion} file=${fileName}`,
        );
        set.status = 201;
        return { message: "Release published", release };
    } catch (error) {
        logger.error(`addServerMonitorRelease failed: ${error?.message || error}`);
        set.status = 500;
        return { error: error?.message || "Failed to publish release" };
    }
}

export async function getLatestServerAgentBinary({ set }) {
    return getLatestServerMonitorBinary({ kind: "agent", set });
}

export async function getLatestServerSupervisorBinary({ set }) {
    return getLatestServerMonitorBinary({ kind: "supervisor", set });
}

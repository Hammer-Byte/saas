import { copyFile, rename, unlink } from "fs/promises";
import { join } from "path";
import { filer, logger } from "@hammerbyte/utils";
import { createMedia, deleteMediaById, getMediaById } from "../db/media.js";
import {
    clearGemTenderCachedSourceMedia,
    getGemTendersWithCachedSourceMediaForCleanup,
} from "../db/gem_tenders.js";

const GEM_URL = "https://bidplus.gem.gov.in";

function mediaDirectory() {
    return String(Bun.env.DIRECTORY_MEDIA || "").trim();
}

function extensionFromNameOrUrl(name, url) {
    const fromName = filer.getExtensionByFileName(String(name || ""));
    if (fromName) return fromName;
    try {
        const path = new URL(url).pathname;
        const fromUrl = filer.getExtensionByFileName(path);
        if (fromUrl) return fromUrl;
    } catch {
        // ignore
    }
    return "pdf";
}

/**
 * Persist a downloaded buffer into MEDIA. Returns media id or null.
 */
export async function saveGemSourceBufferToMedia({
    name,
    buffer,
    extension = "pdf",
}) {
    const dir = mediaDirectory();
    if (!dir) {
        logger.error("saveGemSourceBufferToMedia: DIRECTORY_MEDIA is not set");
        return null;
    }
    if (!buffer?.length) {
        return null;
    }

    const safeName = String(name || "document").slice(0, 64) || "document";
    const ext = String(extension || "pdf").replace(/^\./, "") || "pdf";
    const file = `${filer.generateRandomFileName()}.${ext}`;
    const diskPath = join(dir, file);

    try {
        await Bun.write(diskPath, buffer);
        const id = await createMedia({ name: safeName, file });
        if (!id) {
            await unlink(diskPath).catch(() => {});
            return null;
        }
        return Number(id);
    } catch (error) {
        logger.error(`saveGemSourceBufferToMedia: ${error}`);
        await unlink(diskPath).catch(() => {});
        return null;
    }
}

/** Delete MEDIA row and disk file. */
export async function deleteGemSourceMediaById(mediaId) {
    const id = Number(mediaId);
    if (!(id >= 1)) {
        return false;
    }
    const media = await getMediaById({ id });
    if (media?.file) {
        const dir = mediaDirectory();
        if (dir) {
            await unlink(join(dir, media.file)).catch(() => {});
        }
    }
    await deleteMediaById({ id });
    return true;
}

export async function fetchGemUrlBuffer({ url, cookieHeader }) {
    const absolute = new URL(String(url || "").trim(), GEM_URL).href;
    const response = await fetch(absolute, {
        headers: {
            Cookie: cookieHeader || "",
            "User-Agent": "Mozilla/5.0",
            Referer: GEM_URL,
        },
        redirect: "follow",
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
        throw new Error("empty body");
    }
    return { buffer, absolute };
}

/**
 * Download every specification link that lacks media_id; keep existing media_id when URL matches.
 */
export async function enrichSpecificationLinksWithMedia({
    specificationLinks,
    existingLinks = [],
    cookieHeader,
    tenderId,
}) {
    const existingByUrl = new Map();
    for (const item of existingLinks || []) {
        if (!item?.url) continue;
        const mediaId = Number(item.media_id);
        if (mediaId >= 1) {
            existingByUrl.set(String(item.url).trim(), mediaId);
        }
    }

    const enriched = [];
    for (const item of specificationLinks || []) {
        const url = String(item?.url || "").trim();
        if (!url) continue;
        const label = item?.label != null ? String(item.label).trim() : "";
        let mediaId = Number(item?.media_id) >= 1 ? Number(item.media_id) : null;
        if (!mediaId) {
            mediaId = existingByUrl.get(url) || null;
        }

        if (!mediaId && cookieHeader) {
            try {
                const { buffer } = await fetchGemUrlBuffer({ url, cookieHeader });
                const ext = extensionFromNameOrUrl(label || url, url);
                const nameBase = (label || `spec-${tenderId || "doc"}`)
                    .replace(/[^\w.\- ]+/g, "_")
                    .slice(0, 48);
                mediaId = await saveGemSourceBufferToMedia({
                    name: `${nameBase}.${ext}`,
                    buffer,
                    extension: ext,
                });
                if (mediaId) {
                    logger.info(
                        `Cached specification media for ${tenderId || "tender"}: ${label || url}`,
                    );
                }
            } catch (error) {
                logger.error(
                    `Failed to cache specification ${url} for ${tenderId || "tender"}: ${error}`,
                );
            }
        }

        const link = { url, label };
        if (mediaId >= 1) {
            link.media_id = mediaId;
        }
        enriched.push(link);
    }
    return enriched;
}

/**
 * Promote a downloaded bid PDF into MEDIA (rename/move preferred; buffer fallback).
 * Returns { mediaId, promoted } — promoted=true means tenderFile was moved into DIRECTORY_MEDIA.
 */
export async function ensureBidDocumentMedia({
    buffer = null,
    tenderFile = null,
    tenderId,
    existingMediaId = null,
}) {
    const existing = Number(existingMediaId);
    if (existing >= 1) {
        return { mediaId: existing, promoted: false };
    }

    const safeId = String(tenderId || "bid").replace(/[^\w.\-/]+/g, "_").slice(0, 48);
    const mediaName = `${safeId}.pdf`;
    const dir = mediaDirectory();

    if (tenderFile && dir) {
        const file = `${filer.generateRandomFileName()}.pdf`;
        const diskPath = join(dir, file);
        try {
            try {
                await rename(tenderFile, diskPath);
            } catch (renameError) {
                // Cross-device or other rename failure: copy then remove source.
                await copyFile(tenderFile, diskPath);
                await unlink(tenderFile).catch(() => {});
            }
            const id = await createMedia({ name: mediaName, file });
            if (!id) {
                await unlink(diskPath).catch(() => {});
            } else {
                logger.info(`Cached bid PDF media for ${tenderId} (promoted download)`);
                return { mediaId: Number(id), promoted: true };
            }
        } catch (error) {
            logger.error(`ensureBidDocumentMedia promote failed for ${tenderId}: ${error}`);
            await unlink(diskPath).catch(() => {});
        }
    }

    if (!buffer?.length) {
        return { mediaId: null, promoted: false };
    }
    const mediaId = await saveGemSourceBufferToMedia({
        name: mediaName,
        buffer,
        extension: "pdf",
    });
    if (mediaId) {
        logger.info(`Cached bid PDF media for ${tenderId}`);
    }
    return { mediaId: mediaId || null, promoted: false };
}

/**
 * Before scan: remove cached bid + specification MEDIA (disk + SQL) for closed tenders.
 */
export async function cleanupCachedSourceMediaForClosedTenders() {
    const tenders = await getGemTendersWithCachedSourceMediaForCleanup();
    let mediaDeleted = 0;
    let tendersCleared = 0;

    for (const tender of tenders) {
        const mediaIds = new Set();
        const bidMediaId = Number(tender.document_media_id);
        if (bidMediaId >= 1) {
            mediaIds.add(bidMediaId);
        }

        let links = [];
        try {
            const raw = tender.specification_links;
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) {
                links = parsed;
            }
        } catch {
            links = [];
        }

        for (const item of links) {
            const mediaId = Number(item?.media_id);
            if (mediaId >= 1) {
                mediaIds.add(mediaId);
            }
        }

        for (const mediaId of mediaIds) {
            const ok = await deleteGemSourceMediaById(mediaId);
            if (ok) mediaDeleted += 1;
        }

        const strippedLinks = links.map((item) => {
            if (!item || typeof item !== "object") return item;
            const { media_id: _removed, ...rest } = item;
            return rest;
        });

        await clearGemTenderCachedSourceMedia({
            id: tender.id,
            specification_links: strippedLinks.length ? strippedLinks : null,
        });
        tendersCleared += 1;
    }

    logger.info(
        `Pre-scan source media cleanup: ${mediaDeleted} MEDIA row(s)/file(s) removed across ${tendersCleared} tender(s)`,
    );
    return { mediaDeleted, tendersCleared };
}

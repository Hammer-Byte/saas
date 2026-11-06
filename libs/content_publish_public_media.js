import { createHmac, timingSafeEqual } from "node:crypto";
import { join } from "node:path";
import { getMediaById } from "../db/media.js";

function mediaSecret() {
    return (
        String(Bun.env.CONTENT_PUBLISH_MEDIA_SECRET || "").trim()
        || String(Bun.env.MYSQL_PASSWORD || "").trim()
        || "content-publish-media"
    );
}

export function getContentPublishPublicBaseUrl() {
    const raw = String(
        Bun.env.CONTENT_PUBLISH_PUBLIC_BASE_URL
            || Bun.env.PUBLIC_BASE_URL
            || "https://hammerbyte.co.in",
    ).trim();
    return raw.replace(/\/+$/, "");
}

/** Signed token mediaId.exp.sig — Meta must fetch image_url without session cookies. */
export function createContentPublishPublicMediaToken(mediaId, ttlSeconds = 3600) {
    const id = Number(mediaId);
    if (!(id >= 1)) {
        throw new Error("Invalid media id for public token");
    }
    const exp = Math.floor(Date.now() / 1000) + Math.max(300, Number(ttlSeconds) || 3600);
    const payload = `${id}.${exp}`;
    const sig = createHmac("sha256", mediaSecret()).update(payload).digest("hex").slice(0, 32);
    return `${payload}.${sig}`;
}

export function verifyContentPublishPublicMediaToken(token) {
    const parts = String(token || "").trim().split(".");
    if (parts.length !== 3) {
        return null;
    }
    const [idText, expText, sig] = parts;
    const mediaId = Number(idText);
    const exp = Number(expText);
    if (!(mediaId >= 1) || !Number.isFinite(exp) || exp * 1000 < Date.now()) {
        return null;
    }
    const payload = `${mediaId}.${exp}`;
    const expected = createHmac("sha256", mediaSecret()).update(payload).digest("hex").slice(0, 32);
    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return null;
        }
    } catch {
        return null;
    }
    return mediaId;
}

export function buildContentPublishPublicMediaUrl(mediaId, ttlSeconds = 3600) {
    const token = createContentPublishPublicMediaToken(mediaId, ttlSeconds);
    return `${getContentPublishPublicBaseUrl()}/api/content-publish/public-media/${encodeURIComponent(token)}`;
}

export async function resolveContentPublishPublicMediaFile(token) {
    const mediaId = verifyContentPublishPublicMediaToken(token);
    if (!mediaId) {
        return null;
    }
    const media = await getMediaById({ id: mediaId });
    if (!media?.file) {
        return null;
    }
    const diskFile = Bun.file(join(Bun.env.DIRECTORY_MEDIA || "media", media.file));
    if (!(await diskFile.exists())) {
        return null;
    }
    return { media, diskFile };
}

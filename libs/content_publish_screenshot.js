import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

const SCREENSHOT_DIR_NAME = "content-publish-screenshots";
const SAFE_SCREENSHOT_NAME = /^[a-zA-Z0-9._-]+\.png$/;

export function getContentPublishScreenshotDir() {
    return join(Bun.env.DIRECTORY_MEDIA || "media", SCREENSHOT_DIR_NAME);
}

export function resolveContentPublishScreenshotPath(fileName) {
    const safeName = basename(String(fileName || ""));
    if (!SAFE_SCREENSHOT_NAME.test(safeName)) {
        return null;
    }
    return join(getContentPublishScreenshotDir(), safeName);
}

export async function captureContentPublishScreenshot(driver, label = "fail") {
    const dir = getContentPublishScreenshotDir();
    await mkdir(dir, { recursive: true });

    const safeLabel = String(label || "fail")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "fail";
    const fileName = `${safeLabel}-${Date.now()}.png`;
    const base64 = await driver.takeScreenshot();
    await Bun.write(join(dir, fileName), Buffer.from(base64, "base64"));
    return fileName;
}

export function normalizeScreenshotFiles(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    const text = String(value || "").trim();
    if (!text) {
        return [];
    }
    if (text.startsWith("[")) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return parsed.map((item) => String(item || "").trim()).filter(Boolean);
            }
        } catch {
            // fall through
        }
    }
    return text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

export function serializeScreenshotFiles(files) {
    const list = normalizeScreenshotFiles(files);
    return list.length ? JSON.stringify(list) : null;
}

export function attachScreenshotToError(error, screenshotFile, screenshotFiles = null) {
    if (!error) {
        return error;
    }
    const collected = [
        ...normalizeScreenshotFiles(error.screenshotFiles),
        ...normalizeScreenshotFiles(screenshotFiles),
    ];
    if (screenshotFile) {
        collected.push(String(screenshotFile));
    }
    const unique = [...new Set(collected.filter(Boolean))];
    if (unique.length) {
        error.screenshotFiles = unique;
        error.screenshotFile = unique[unique.length - 1];
    }
    return error;
}

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

export function attachScreenshotToError(error, screenshotFile) {
    if (!error || !screenshotFile) {
        return error;
    }
    error.screenshotFile = screenshotFile;
    return error;
}

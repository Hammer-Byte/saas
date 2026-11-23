import { logger } from "@hammerbyte/utils";

/**
 * Parse HTTP Basic credentials from Backuprer Configurer.
 * Used only to capture/display utility operator creds — not for API authorization.
 * Security for ingest remains TAG (and OTP for CREATE_TAG).
 */
export function parseServersBasicCredentials(headers) {
    const authorization = headers?.authorization ?? headers?.Authorization ?? "";
    const raw = String(authorization || "").trim();
    if (!raw.toLowerCase().startsWith("basic ")) {
        return null;
    }

    const encoded = raw.slice(6).trim();
    if (!encoded) {
        return null;
    }

    try {
        const decoded = Buffer.from(encoded, "base64").toString("utf8");
        const separator = decoded.indexOf(":");
        if (separator < 0) {
            return null;
        }
        const username = decoded.slice(0, separator).trim();
        const password = decoded.slice(separator + 1);
        if (!username && !password) {
            return null;
        }
        return {
            username: username.slice(0, 128),
            password: password.slice(0, 255),
        };
    } catch (error) {
        logger.error(`parseServersBasicCredentials: ${error}`);
        return null;
    }
}

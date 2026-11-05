import http from "node:http";
import net from "node:net";
import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { logger } from "@hammerbyte/utils";

export let processing = false;

const FIREFOX_BINARY = "/usr/bin/firefox";

export function acquireContentPublishProcessing() {
    if (processing) {
        return false;
    }
    processing = true;
    return true;
}

export function releaseContentPublishProcessing() {
    processing = false;
}

/**
 * Opt-in via CONTENT_PUBLISH_PROXY=http://user:pass@host:port
 * Optional CONTENT_PUBLISH_PROXY_PLATFORMS=instagram,facebook (default: all)
 */
export function shouldUseContentPublishProxy(platform) {
    if (!parseContentPublishProxyEnv()) {
        return false;
    }
    const raw = String(Bun.env.CONTENT_PUBLISH_PROXY_PLATFORMS || "").trim();
    if (!raw) {
        return true;
    }
    const allowed = raw
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    return allowed.includes(String(platform || "").trim().toLowerCase());
}

function parseContentPublishProxyEnv() {
    const raw = String(Bun.env.CONTENT_PUBLISH_PROXY || "").trim();
    if (!raw) {
        return null;
    }
    let url;
    try {
        url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    } catch {
        throw new Error(`Invalid CONTENT_PUBLISH_PROXY: ${raw}`);
    }
    const host = url.hostname;
    const port = Number(url.port) || (url.protocol === "https:" ? 443 : 80);
    if (!host || !port) {
        throw new Error(`Invalid CONTENT_PUBLISH_PROXY host/port: ${raw}`);
    }
    return {
        host,
        port,
        username: decodeURIComponent(url.username || ""),
        password: decodeURIComponent(url.password || ""),
    };
}

/** Local HTTP proxy that injects upstream Basic auth (Firefox cannot). */
function startLocalProxyForwarder({ host, port, username, password }) {
    const authHeader =
        username || password
            ? `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
            : null;

    const server = http.createServer((clientReq, clientRes) => {
        const headers = { ...clientReq.headers };
        if (authHeader) {
            headers["Proxy-Authorization"] = authHeader;
        }
        delete headers["proxy-connection"];

        const upstreamReq = http.request(
            {
                host,
                port,
                path: clientReq.url,
                method: clientReq.method,
                headers,
            },
            (upstreamRes) => {
                clientRes.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
                upstreamRes.pipe(clientRes);
            },
        );
        upstreamReq.on("error", () => {
            if (!clientRes.headersSent) {
                clientRes.writeHead(502);
            }
            clientRes.end();
        });
        clientReq.pipe(upstreamReq);
    });

    server.on("connect", (req, clientSocket, head) => {
        const upstreamSocket = net.connect(port, host, () => {
            let connectReq =
                `CONNECT ${req.url} HTTP/1.1\r\n` +
                `Host: ${req.url}\r\n` +
                `Proxy-Connection: keep-alive\r\n`;
            if (authHeader) {
                connectReq += `Proxy-Authorization: ${authHeader}\r\n`;
            }
            connectReq += `\r\n`;
            upstreamSocket.write(connectReq);

            let buf = Buffer.alloc(0);
            const onData = (chunk) => {
                buf = Buffer.concat([buf, chunk]);
                const headerEnd = buf.indexOf("\r\n\r\n");
                if (headerEnd < 0) {
                    return;
                }
                upstreamSocket.off("data", onData);
                const statusLine = buf.slice(0, buf.indexOf("\r\n")).toString("utf8");
                const rest = buf.slice(headerEnd + 4);
                if (!/^HTTP\/1\.[01] 200\b/i.test(statusLine)) {
                    clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
                    clientSocket.destroy();
                    upstreamSocket.destroy();
                    return;
                }
                clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
                if (rest.length) {
                    clientSocket.write(rest);
                }
                if (head?.length) {
                    upstreamSocket.write(head);
                }
                upstreamSocket.pipe(clientSocket);
                clientSocket.pipe(upstreamSocket);
            };
            upstreamSocket.on("data", onData);
        });

        const fail = () => {
            try {
                clientSocket.destroy();
            } catch {
                // ignore
            }
            try {
                upstreamSocket.destroy();
            } catch {
                // ignore
            }
        };
        upstreamSocket.on("error", fail);
        clientSocket.on("error", fail);
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            resolve({
                port: address.port,
                close: () =>
                    new Promise((done) => {
                        server.close(() => done());
                    }),
            });
        });
    });
}

function applyFirefoxManualProxy(options, host, port) {
    options.setPreference("network.proxy.type", 1);
    options.setPreference("network.proxy.http", host);
    options.setPreference("network.proxy.http_port", port);
    options.setPreference("network.proxy.ssl", host);
    options.setPreference("network.proxy.ssl_port", port);
    options.setPreference("network.proxy.share_proxy_settings", true);
    options.setPreference("network.proxy.no_proxies_on", "localhost, 127.0.0.1");
    options.setPreference("network.proxy.allow_hijacking_localhost", false);
}

export async function openFirefox({ useProxy = false } = {}) {
    logger.info(
        `content-publish browser launch binary=${FIREFOX_BINARY} moz_headless=${Bun.env.MOZ_HEADLESS || "0"} use_proxy=${useProxy ? "1" : "0"}`,
    );
    const options = new firefox.Options()
        .setBinary(FIREFOX_BINARY)
        .setPageLoadStrategy("eager")
        .windowSize({ width: 1440, height: 1000 });

    let proxyCleanup = null;
    if (useProxy) {
        const upstream = parseContentPublishProxyEnv();
        if (!upstream) {
            throw new Error("CONTENT_PUBLISH_PROXY is required when useProxy=true");
        }
        const forwarder = await startLocalProxyForwarder(upstream);
        proxyCleanup = forwarder.close;
        applyFirefoxManualProxy(options, "127.0.0.1", forwarder.port);
        logger.info(
            `content-publish browser proxy local=127.0.0.1:${forwarder.port} upstream=${upstream.host}:${upstream.port} auth=${upstream.username ? "yes" : "no"}`,
        );
    }

    const driver = await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(options)
        .build();

    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 20_000 });

    const originalQuit = driver.quit.bind(driver);
    driver.quit = async () => {
        try {
            return await originalQuit();
        } finally {
            if (proxyCleanup) {
                try {
                    await proxyCleanup();
                } catch (error) {
                    logger.error(`content-publish proxy forwarder close: ${error}`);
                }
                proxyCleanup = null;
            }
        }
    };

    logger.info("content-publish browser ready");
    return driver;
}

export async function openUrl(driver, url) {
    try {
        await driver.get(url);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/timeout/i.test(message)) {
            throw error;
        }
    }
}

export function contentPublishSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginLinkedinWithCookie(driver, cookie) {
    logger.info("content-publish linkedin login start");
    await openUrl(driver, "https://www.linkedin.com");
    await driver.manage().addCookie({
        name: "li_at",
        value: cookie,
        domain: ".linkedin.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "None",
    });
    await openUrl(driver, "https://www.linkedin.com/feed/");
    await waitForLinkedinLogin(driver);
    logger.info("content-publish linkedin login ok");
}

async function waitForLinkedinLogin(driver) {
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline) {
        const url = await driver.getCurrentUrl();
        if (/https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(feed|in|mynetwork)\b/.test(url)) {
            return;
        }
        if (/login|checkpoint|challenge|authwall|uas\/login/i.test(url)) {
            break;
        }
        await contentPublishSleep(1000);
    }

    const url = await driver.getCurrentUrl();
    throw new Error(`LinkedIn login failed at ${url}`);
}

export async function loginFacebookWithCookie(driver, cookieValue) {
    logger.info("content-publish facebook login start");
    await openUrl(driver, "https://www.facebook.com/");
    const parts = parseFacebookCookieBlob(cookieValue);
    logger.info(`content-publish facebook cookies applied count=${parts.length}`);
    for (const part of parts) {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain: ".facebook.com",
            path: "/",
            secure: true,
        });
    }
    await openUrl(driver, "https://www.facebook.com/");
    await contentPublishSleep(2000);
    const url = await driver.getCurrentUrl();
    if (/login|checkpoint/i.test(url)) {
        throw new Error(`Facebook login failed at ${url}`);
    }
    logger.info("content-publish facebook login ok");
}

export async function loginInstagramWithCookie(driver, cookieValue) {
    logger.info("content-publish instagram login start");
    await openUrl(driver, "https://www.instagram.com/");
    const parts = normalizeInstagramCookies(cookieValue);
    if (!parts.some((part) => part.name === "sessionid" && part.value)) {
        throw new Error("Instagram cookie must include sessionid");
    }
    logger.info(
        `content-publish instagram cookies applied names=${parts.map((part) => part.name).join(",")}`,
    );
    for (const part of parts) {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain: ".instagram.com",
            path: "/",
            secure: true,
            httpOnly: part.name === "sessionid",
        });
    }
    await openUrl(driver, "https://www.instagram.com/");
    await contentPublishSleep(2500);
    await waitForInstagramLogin(driver);
    logger.info("content-publish instagram login ok");
}

async function waitForInstagramLogin(driver) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const state = await driver.executeScript(`
          return {
            url: location.href,
            hasCreate: !!(
              document.querySelector("svg[aria-label='New post']")
              || document.querySelector("svg[aria-label='Create']")
              || document.querySelector("a[href*='/create']")
            ),
            hasHome: !!(
              document.querySelector("svg[aria-label='Home']")
              || document.querySelector("a[href='/']")
            ),
          };
        `);
        if (/accounts\/login|challenge|two_factor|auth_platform/i.test(state.url)) {
            break;
        }
        if (state.hasCreate || state.hasHome || /instagram\.com\/?$|instagram\.com\/(reels|direct|explore)/i.test(state.url)) {
            return;
        }
        await contentPublishSleep(1000);
    }
    const url = await driver.getCurrentUrl();
    throw new Error(`Instagram login failed at ${url}`);
}

function normalizeInstagramCookies(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    let parts = [];
    if (!trimmed.includes("=")) {
        parts = [{ name: "sessionid", value: trimmed }];
    } else {
        parts = parseNameValueCookieBlob(trimmed);
    }
    return parts
        .map((part) => {
            let value = String(part.value || "").trim();
            try {
                value = decodeURIComponent(value);
            } catch {
                // keep raw value
            }
            return { name: part.name, value };
        })
        .filter((part) => part.name && part.value);
}

export async function loginYoutubeWithCookie(driver, cookieValue) {
    logger.info("content-publish youtube login start");
    const parts = parseYoutubeCookieBlob(cookieValue);
    if (!parts.length) {
        throw new Error("YouTube cookie blob is empty");
    }

    const names = new Set(parts.map((part) => part.name));
    const hasModernSession = [...names].some((name) =>
        /^(__Secure-1PSID|__Secure-3PSID|LOGIN_INFO)$/i.test(name),
    );
    if (!hasModernSession) {
        throw new Error(
            "YouTube cookie needs __Secure-1PSID / __Secure-3PSID / LOGIN_INFO (Netscape export from youtube.com)",
        );
    }

    logger.info(`content-publish youtube cookies applied count=${parts.length}`);
    // Community posts run on www.youtube.com; Netscape exports are usually .youtube.com only.
    await openUrl(driver, "https://www.youtube.com/");
    for (const part of parts) {
        await addCookieBestEffort(driver, part, ".youtube.com");
    }
    await openUrl(driver, "https://www.youtube.com/");
    await contentPublishSleep(2500);
    await waitForYoutubeLogin(driver);
    logger.info("content-publish youtube login ok");
}

async function addCookieBestEffort(driver, part, domain) {
    const secure = part.secure !== false;
    try {
        await driver.manage().addCookie({
            name: part.name,
            value: part.value,
            domain,
            path: part.path || "/",
            secure,
            sameSite: "None",
        });
    } catch {
        try {
            await driver.manage().addCookie({
                name: part.name,
                value: part.value,
                domain,
                path: part.path || "/",
                secure,
            });
        } catch {
            // Ignore cookies this host rejects.
        }
    }
}

function parseYoutubeCookieBlob(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    if (!trimmed) {
        return [];
    }
    if (isNetscapeCookieFile(trimmed)) {
        return parseNetscapeCookieFile(trimmed);
    }
    return parseNameValueCookieBlob(trimmed).map((part) => ({
        ...part,
        secure: true,
        path: "/",
    }));
}

function isNetscapeCookieFile(text) {
    return (
        /^#\s*Netscape HTTP Cookie File/im.test(text)
        || /^#HttpOnly_/m.test(text)
        || /^\.[a-z0-9.-]+\t/im.test(text)
    );
}

function parseNetscapeCookieFile(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
            const cols = line.split("\t");
            if (cols.length < 7) {
                return null;
            }
            const domain = cols[0].replace(/^#HttpOnly_/i, "");
            const path = cols[2] || "/";
            const secure = String(cols[3]).toUpperCase() === "TRUE";
            const name = cols[5];
            const value = cols.slice(6).join("\t");
            if (!name || !value) {
                return null;
            }
            // Skip short-lived Studio transit cookies.
            if (/^ST-/i.test(name) || name === "GPS") {
                return null;
            }
            return { name, value, domain, path, secure };
        })
        .filter(Boolean);
}

async function waitForYoutubeLogin(driver) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        const state = await driver.executeScript(`
          const text = String(document.body?.innerText || "");
          const url = location.href;
          const avatar = !!document.querySelector("#avatar-btn, button#avatar-btn, img.yt-spec-avatar-shape__image");
          return {
            avatar,
            create: !![...document.querySelectorAll("button")].find((el) =>
              (el.getAttribute("aria-label") || "").trim() === "Create"
            ),
            createChannel: /create channel/i.test(text.slice(0, 3000)),
            signedOut: /accounts\\.google\\.com\\/v3\\/signin|ServiceLogin/i.test(url)
              || (!avatar && /sign in to youtube|^sign in$/i.test(text.slice(0, 500))),
          };
        `);
        if (state.signedOut) {
            break;
        }
        if (state.createChannel && !state.avatar) {
            throw new Error(
                "YouTube account has no channel yet (Create channel). Community posts need an existing channel.",
            );
        }
        if (state.avatar || state.create) {
            return;
        }
        await contentPublishSleep(1000);
    }
    const url = await driver.getCurrentUrl();
    throw new Error(`YouTube login failed at ${url}`);
}

function parseFacebookCookieBlob(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    if (trimmed.includes("=") && (trimmed.includes("c_user") || trimmed.includes(";"))) {
        return parseNameValueCookieBlob(trimmed);
    }
    return [{ name: "c_user", value: trimmed }];
}

function parseNameValueCookieBlob(cookieValue) {
    const trimmed = String(cookieValue || "").trim();
    if (!trimmed.includes("=")) {
        return [{ name: "sessionid", value: trimmed }];
    }
    return trimmed
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const index = part.indexOf("=");
            if (index < 0) {
                return null;
            }
            return {
                name: part.slice(0, index).trim(),
                value: part.slice(index + 1).trim(),
            };
        })
        .filter(Boolean);
}

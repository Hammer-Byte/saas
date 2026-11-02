import { Builder, Browser } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

/** Match this system's Debian Firefox ESR (153.x) desktop UA. */
const DEFAULT_FIREFOX_USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0";

function envFlag(name, fallback = false) {
    const raw = Bun.env[name];
    if (raw == null || raw === "") {
        return fallback;
    }
    return /^(1|true|yes|on)$/i.test(String(raw));
}

export function buildFirefoxOptions({
    width = 1440,
    height = 1000,
    pageLoadStrategy = "eager",
    headless = null,
} = {}) {
    const binary = Bun.env.FIREFOX_BINARY || "/usr/bin/firefox";
    const userAgent = Bun.env.FIREFOX_USER_AGENT || DEFAULT_FIREFOX_USER_AGENT;
    const useHeadless =
        headless == null ? envFlag("FIREFOX_HEADLESS", false) : !!headless;

    const options = new firefox.Options()
        .setBinary(binary)
        .setPageLoadStrategy(pageLoadStrategy)
        .windowSize({ width, height });

    if (useHeadless) {
        options.addArguments("-headless");
    }

    // Keep automation browser fingerprint close to a normal desktop Firefox
    // so cookies copied from this system are less likely to trip platform checks.
    options.setPreference("general.useragent.override", userAgent);
    options.setPreference("intl.accept_languages", "en-US, en");
    options.setPreference("browser.shell.checkDefaultBrowser", false);
    options.setPreference("dom.webnotifications.enabled", false);
    options.setPreference("media.navigator.enabled", false);
    options.setPreference("network.cookie.sameSite.laxByDefault", false);
    options.setPreference("network.cookie.sameSite.noneRequiresSecure", true);

    return options;
}

export async function openConfiguredFirefox(options = {}) {
    const driver = await new Builder()
        .forBrowser(Browser.FIREFOX)
        .setFirefoxOptions(buildFirefoxOptions(options))
        .build();

    await driver.manage().setTimeouts({
        implicit: 0,
        pageLoad: options.pageLoadTimeoutMs ?? 20_000,
    });
    return driver;
}

import { By, Key } from "selenium-webdriver";
import { linkedinSleep, openLinkedinUrl } from "../linkedin_browser.js";

export const CONNECTIONS_URL =
    "https://www.linkedin.com/mynetwork/invite-connect/connections/";

/**
 * Current LinkedIn Connections UI (hashed classes):
 *   <a aria-label="Send a message to Jane Doe"
 *      href="/messaging/compose/?profileUrn=...&recipient=...&interop=msgOverlay">Message</a>
 * Opening that href loads Messaging with:
 *   .msg-form__contenteditable[aria-label="Write a message…"]
 *   button.msg-form__send-button
 */
const PAGE_HELPERS = `
function normalize(text) {
  return String(text || "").replace(/\\s+/g, " ").trim();
}

function messageAnchors() {
  return [...document.querySelectorAll("a[href*='/messaging/compose']")].filter((a) => {
    const aria = (a.getAttribute("aria-label") || "").toLowerCase();
    return aria.includes("send a message to") || aria.includes("send message to");
  });
}

function nameFromAria(aria) {
  const match =
    String(aria || "").match(/send(?:\\s+a)?\\s+message\\s+to\\s+(.+)$/i);
  return match ? normalize(match[1]) : "";
}

function rowForAnchor(anchor) {
  let node = anchor.parentElement;
  for (let depth = 0; depth < 10 && node; depth++) {
    if (node.querySelector && node.querySelector('a[href*="/in/"]')) {
      return node;
    }
    node = node.parentElement;
  }
  return anchor.parentElement;
}

function parseCardFromAnchor(anchor) {
  const aria = anchor.getAttribute("aria-label") || "";
  const name = nameFromAria(aria);
  const composeUrl = anchor.href || "";
  const row = rowForAnchor(anchor);
  const profileLink = [...(row ? row.querySelectorAll('a[href*="/in/"]') : [])].find(
    (link) => normalize(link.innerText || "").length > 0
  );
  const profileUrl = profileLink ? profileLink.href.split("?")[0] : "";
  const profileText = normalize((profileLink && profileLink.innerText) || "");

  let headline = profileText;
  if (name && headline.toLowerCase().startsWith(name.toLowerCase())) {
    headline = normalize(headline.slice(name.length));
  }

  if (!headline && row) {
    const lines = String(row.innerText || "")
      .split(/\\n+/)
      .map((line) => normalize(line))
      .filter(Boolean);
    for (const line of lines) {
      if (!line) continue;
      if (name && line.toLowerCase() === name.toLowerCase()) continue;
      if (/^message$/i.test(line)) continue;
      if (/^connected on /i.test(line)) continue;
      headline = line;
      break;
    }
  }

  return {
    name,
    headline,
    profileUrl,
    composeUrl,
    messageAriaLabel: aria,
  };
}

function getCards() {
  const cards = [];
  const seen = new Set();
  for (const anchor of messageAnchors()) {
    const parsed = parseCardFromAnchor(anchor);
    const key = parsed.composeUrl || parsed.profileUrl || parsed.messageAriaLabel;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push(parsed);
  }
  return cards;
}

function diagnoseConnectionsPage() {
  const cards = getCards();
  return {
    url: location.href,
    messageAnchorCount: messageAnchors().length,
    parsedCardCount: cards.length,
    sampleCards: cards.slice(0, 5),
    sampleAnchors: messageAnchors().slice(0, 3).map((a) => ({
      aria: a.getAttribute("aria-label") || "",
      href: a.getAttribute("href") || "",
      text: normalize(a.innerText),
    })),
  };
}

function inspectComposer() {
  const compose =
    document.querySelector(".msg-form__contenteditable") ||
    document.querySelector("[contenteditable='true'][role='textbox']") ||
    document.querySelector("[contenteditable='true']");
  if (!compose) {
    return { open: false, isNew: false, title: "", headline: "", eventCount: 0 };
  }

  const events = document.querySelectorAll(
    ".msg-s-event-listitem, .msg-s-message-list__event, li.msg-s-message-list__event, .msg-s-message-group"
  );
  const titleNode =
    document.querySelector(".msg-overlay-bubble-header__title") ||
    document.querySelector(".msg-entity-lockup__entity-title") ||
    document.querySelector("h2.msg-title");
  const title = normalize((titleNode && titleNode.innerText) || "");
  const isNew = events.length === 0 || /new message/i.test(title);

  return {
    open: true,
    isNew,
    title,
    headline: "",
    eventCount: events.length,
  };
}
`;

export const LinkedinMessagePage = {
    async open(driver) {
        await openLinkedinUrl(driver, CONNECTIONS_URL);
        await linkedinSleep(2500);
    },

    async sleep(ms) {
        await linkedinSleep(ms);
    },

    async waitForCards(driver, timeoutMs = 30000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const count = await driver.executeScript(`
                ${PAGE_HELPERS}
                return messageAnchors().length;
            `);
            if (count > 0) {
                return true;
            }
            await linkedinSleep(700);
        }
        return false;
    },

    async diagnose(driver) {
        return await driver.executeScript(`
            ${PAGE_HELPERS}
            return diagnoseConnectionsPage();
        `);
    },

    async readCards(driver) {
        const cards = await driver.executeScript(`
            ${PAGE_HELPERS}
            return getCards();
        `);
        return Array.isArray(cards) ? cards : [];
    },

    async scrollConnections(driver) {
        await driver.executeScript(`
            const anchors = [...document.querySelectorAll("a[href*='/messaging/compose']")];
            const last = anchors[anchors.length - 1];
            if (last) last.scrollIntoView({ block: "end", behavior: "instant" });
            const scroller =
              document.querySelector("main") ||
              document.scrollingElement;
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
            window.scrollBy(0, Math.max(1000, window.innerHeight));
        `);
    },

    async openComposeUrl(driver, composeUrl) {
        const url = String(composeUrl || "").trim();
        if (!url) {
            return false;
        }
        try {
            await openLinkedinUrl(driver, url);
        } catch (error) {
            // LinkedIn messaging often keeps loading after the composer is usable.
            const message = error instanceof Error ? error.message : String(error);
            if (!/timeout/i.test(message)) {
                throw error;
            }
        }
        return true;
    },

    async waitForMessageDialog(driver, timeoutMs = 20000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const ready = await driver.executeScript(`
                return Boolean(
                  document.querySelector(".msg-form__contenteditable") ||
                  document.querySelector("[contenteditable='true'][role='textbox']")
                );
            `);
            if (ready) {
                return true;
            }
            await linkedinSleep(500);
        }
        return false;
    },

    async inspectOpenDialog(driver) {
        return await driver.executeScript(`
            ${PAGE_HELPERS}
            return inspectComposer();
        `);
    },

    async closeDialog(driver) {
        // Compose is a full messaging page now — return to connections list.
        try {
            await openLinkedinUrl(driver, CONNECTIONS_URL);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/timeout/i.test(message)) {
                throw error;
            }
        }
        await linkedinSleep(1500);
    },

    async typeAndSend(driver, message) {
        const text = String(message || "");
        if (!text) {
            return "missing";
        }

        const composeSelectors = [
            ".msg-form__contenteditable",
            "[contenteditable='true'][role='textbox']",
            "[contenteditable='true']",
        ];

        let compose = null;
        for (const selector of composeSelectors) {
            const elements = await driver.findElements(By.css(selector));
            if (elements.length) {
                compose = elements[elements.length - 1];
                break;
            }
        }
        if (!compose) {
            return "no-compose";
        }

        await driver.executeScript(
            "arguments[0].scrollIntoView({block:'center'}); arguments[0].focus();",
            compose,
        );
        await linkedinSleep(200);
        try {
            await compose.click();
        } catch {
            // focused
        }
        await compose.sendKeys(Key.chord(Key.CONTROL, "a"));
        await compose.sendKeys(Key.BACK_SPACE);

        // LinkedIn contenteditable collapses plain \\n from sendKeys.
        // Use Shift+Enter between lines (Enter alone can send the message).
        const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
        for (let index = 0; index < lines.length; index++) {
            if (lines[index].length) {
                await compose.sendKeys(lines[index]);
            }
            if (index < lines.length - 1) {
                await compose.sendKeys(Key.chord(Key.SHIFT, Key.ENTER));
            }
        }
        await linkedinSleep(600);

        const sendButtons = await driver.findElements(
            By.css("button.msg-form__send-button"),
        );
        if (sendButtons.length) {
            const send = sendButtons[sendButtons.length - 1];
            try {
                await send.click();
            } catch {
                await driver.executeScript("arguments[0].click();", send);
            }
            await linkedinSleep(800);
            return "sent";
        }

        const clicked = await driver.executeScript(`
            const send = [...document.querySelectorAll("button")].find((button) => {
              const label = ((button.getAttribute("aria-label") || "") + " " + (button.innerText || ""))
                .replace(/\\s+/g, " ")
                .trim()
                .toLowerCase();
              return label === "send" || label.includes("send");
            });
            if (!send) return false;
            send.disabled = false;
            send.removeAttribute("disabled");
            send.click();
            return true;
        `);
        await linkedinSleep(800);
        return clicked ? "sent" : "no-send";
    },
};

export function matchDesignationPool(headline, designationPools) {
    const haystack = String(headline || "").toLowerCase();
    if (!haystack) {
        return null;
    }
    for (const pool of designationPools || []) {
        const needle = String(pool?.name || "").toLowerCase();
        if (!needle) {
            continue;
        }
        if (haystack.includes(needle) && pool.messages?.length) {
            return pool;
        }
    }
    return null;
}

export function pickRandomMessage(messages) {
    const list = (messages || []).filter(Boolean);
    if (!list.length) {
        return "";
    }
    return list[Math.floor(Math.random() * list.length)];
}

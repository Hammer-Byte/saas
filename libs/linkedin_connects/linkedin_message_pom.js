import { By, Key } from "selenium-webdriver";
import { linkedinSleep, openLinkedinUrl } from "../linkedin_browser.js";

export const CONNECTIONS_URL =
    "https://www.linkedin.com/mynetwork/invite-connect/connections/";

const PAGE_HELPERS = `
function normalize(text) {
  return String(text || "").replace(/\\s+/g, " ").trim();
}

function messageButtons() {
  return [...document.querySelectorAll("button, a")].filter((button) => {
    if (button.closest("aside, header, .msg-overlay-list-bubble, [class*='msg-overlay']")) {
      return false;
    }
    const label = normalize((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).toLowerCase();
    return label === "message" || /^message /.test(label);
  });
}

function cardForButton(button) {
  const root = document.querySelector("main") || document.body;
  let node = button.parentElement;
  let card = node;
  for (let depth = 0; depth < 14 && node && node !== root; depth++) {
    const text = node.innerText || "";
    if (text.length > 20 && text.length < 1200 && /message/i.test(text)) {
      card = node;
    }
    node = node.parentElement;
  }
  return card;
}

function profileUrlOf(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link || !link.href) return "";
  return link.href.split("?")[0];
}

function parseCard(card, button) {
  const profileUrl = profileUrlOf(card);
  const nameNode =
    card.querySelector('a[href*="/in/"] span[aria-hidden="true"]') ||
    card.querySelector('a[href*="/in/"]');
  const name = normalize((nameNode && nameNode.innerText) || "")
    .split("\\n")[0]
    .replace(/\\s*[•·]\\s*(1st|2nd|3rd)\\+?.*$/i, "")
    .trim();

  const lines = normalize(card.innerText)
    .split(/\\n+/)
    .map((line) => normalize(line))
    .filter(Boolean);

  let headline = "";
  for (const line of lines) {
    if (!line || line.toLowerCase() === "message") continue;
    if (name && line.toLowerCase() === name.toLowerCase()) continue;
    if (/^connected on /i.test(line)) continue;
    if (/^(1st|2nd|3rd)\\+?$/i.test(line)) continue;
    if (name && line.toLowerCase().startsWith(name.toLowerCase())) continue;
    headline = line;
    break;
  }

  const subtitle =
    card.querySelector(".mn-connection-card__occupation") ||
    card.querySelector('[class*="occupation"]') ||
    card.querySelector('[class*="headline"]') ||
    card.querySelector(".entity-result__primary-subtitle");
  if (subtitle && normalize(subtitle.innerText)) {
    headline = normalize(subtitle.innerText);
  }

  return {
    profileUrl,
    name,
    headline,
  };
}

function getCards() {
  const cards = [];
  const seen = new Set();
  for (const button of messageButtons()) {
    const card = cardForButton(button);
    if (!card) continue;
    const parsed = parseCard(card, button);
    const key = parsed.profileUrl || (parsed.name + "|" + parsed.headline);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push(parsed);
  }
  return cards;
}

function findMessageDialog() {
  const dialogs = [...document.querySelectorAll('div[role="dialog"], .msg-form, .msg-overlay-conversation-bubble')];
  for (const dialog of dialogs) {
    const text = normalize(dialog.innerText || "");
    if (/write a message/i.test(text) || /new message/i.test(text) || dialog.querySelector(".msg-form__contenteditable, textarea")) {
      return dialog;
    }
  }
  return document.querySelector(".msg-overlay-conversation-bubble") ||
    document.querySelector('div[role="dialog"]');
}

function dialogTitle(dialog) {
  if (!dialog) return "";
  const heading =
    dialog.querySelector("h2, h3, .msg-overlay-bubble-header__title, [class*='title']");
  return normalize((heading && heading.innerText) || "");
}

function isNewConversation(dialog) {
  if (!dialog) return false;
  const title = dialogTitle(dialog).toLowerCase();
  if (title.includes("new message")) return true;

  const hasHistory = Boolean(
    dialog.querySelector(".msg-s-message-list, .msg-s-event-listitem, .msg-s-message-group, [class*='message-list']")
  );
  if (hasHistory) return false;

  const bodyText = normalize(dialog.innerText || "").toLowerCase();
  if (/\\bnew\\b/.test(bodyText) && /write a message/.test(bodyText) && !/connected on/.test(bodyText)) {
    // Prefer empty compose: no prior bubbles often means new.
  }

  const eventItems = dialog.querySelectorAll(".msg-s-event-listitem, .msg-s-message-group__meta");
  if (eventItems.length > 0) return false;

  return Boolean(dialog.querySelector(".msg-form__contenteditable, textarea, [placeholder*='Write a message']"));
}

function dialogHeadline(dialog) {
  if (!dialog) return "";
  const profileBits = [...dialog.querySelectorAll("p, span, div")]
    .map((node) => normalize(node.innerText))
    .filter((text) => text.length > 12 && text.length < 220);
  // Prefer a line that looks like a headline under the name chip.
  for (const text of profileBits) {
    if (/^new message$/i.test(text)) continue;
    if (/write a message/i.test(text)) continue;
    if (/^send$/i.test(text)) continue;
    if (/messaging/i.test(text)) continue;
    return text;
  }
  return "";
}

function closeMessageDialog(dialog) {
  const root = dialog || findMessageDialog() || document;
  const close = [...root.querySelectorAll("button")].find((button) => {
    const label = normalize((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).toLowerCase();
    return label.includes("close") || label.includes("dismiss");
  });
  if (close) {
    close.click();
    return true;
  }
  return false;
}

function findCompose(dialog) {
  if (!dialog) return null;
  return (
    dialog.querySelector(".msg-form__contenteditable") ||
    dialog.querySelector('[role="textbox"]') ||
    dialog.querySelector("textarea") ||
    dialog.querySelector('[placeholder*="Write a message"]')
  );
}

function findSendButton(dialog) {
  if (!dialog) return null;
  return [...dialog.querySelectorAll("button")].find((button) => {
    const label = normalize((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).toLowerCase();
    return label === "send" || label.includes("send message");
  });
}
`;

export const LinkedinMessagePage = {
    async open(driver) {
        await openLinkedinUrl(driver, CONNECTIONS_URL);
    },

    async sleep(ms) {
        await linkedinSleep(ms);
    },

    async waitForCards(driver, timeoutMs = 15000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const count = await driver.executeScript(`
                ${PAGE_HELPERS}
                return messageButtons().length;
            `);
            if (count > 0) {
                return true;
            }
            await linkedinSleep(500);
        }
        return false;
    },

    async readCards(driver) {
        return await driver.executeScript(`
            ${PAGE_HELPERS}
            return getCards();
        `);
    },

    async scrollConnections(driver) {
        await driver.executeScript(`
            window.scrollBy(0, Math.max(700, window.innerHeight * 0.9));
            const main = document.querySelector("main");
            if (main) main.scrollBy(0, Math.max(700, window.innerHeight * 0.9));
        `);
    },

    async openMessageForProfile(driver, profileUrl, name) {
        return await driver.executeScript(
            `
            ${PAGE_HELPERS}
            const profileUrl = arguments[0] || "";
            const name = (arguments[1] || "").toLowerCase();
            for (const button of messageButtons()) {
              const card = cardForButton(button);
              if (!card) continue;
              const parsed = parseCard(card, button);
              if (profileUrl && parsed.profileUrl === profileUrl) {
                button.click();
                return true;
              }
              if (!profileUrl && name && parsed.name.toLowerCase() === name) {
                button.click();
                return true;
              }
            }
            return false;
            `,
            profileUrl,
            name,
        );
    },

    async waitForMessageDialog(driver, timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const ready = await driver.executeScript(`
                ${PAGE_HELPERS}
                return Boolean(findMessageDialog());
            `);
            if (ready) {
                return true;
            }
            await linkedinSleep(300);
        }
        return false;
    },

    async inspectOpenDialog(driver) {
        return await driver.executeScript(`
            ${PAGE_HELPERS}
            const dialog = findMessageDialog();
            if (!dialog) {
              return { open: false, isNew: false, title: "", headline: "" };
            }
            return {
              open: true,
              isNew: isNewConversation(dialog),
              title: dialogTitle(dialog),
              headline: dialogHeadline(dialog),
            };
        `);
    },

    async closeDialog(driver) {
        await driver.executeScript(`
            ${PAGE_HELPERS}
            closeMessageDialog(findMessageDialog());
        `);
        await linkedinSleep(400);
    },

    async typeAndSend(driver, message) {
        const text = String(message || "");
        if (!text) {
            return "missing";
        }

        const composeSelectors = [
            ".msg-form__contenteditable",
            "div[role='dialog'] [role='textbox']",
            ".msg-overlay-conversation-bubble [role='textbox']",
            "div[role='dialog'] textarea",
            "[placeholder*='Write a message']",
        ];

        let compose = null;
        for (const selector of composeSelectors) {
            const elements = await driver.findElements(By.css(selector));
            if (elements.length) {
                compose = elements[0];
                break;
            }
        }
        if (!compose) {
            return "no-compose";
        }

        await compose.click();
        await compose.sendKeys(Key.chord(Key.CONTROL, "a"));
        await compose.sendKeys(Key.BACK_SPACE);
        await compose.sendKeys(text);
        await linkedinSleep(400);

        const clicked = await driver.executeScript(`
            ${PAGE_HELPERS}
            const dialog = findMessageDialog();
            const send = findSendButton(dialog);
            if (!send) return false;
            if (send.disabled) send.removeAttribute("disabled");
            send.click();
            return true;
        `);

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

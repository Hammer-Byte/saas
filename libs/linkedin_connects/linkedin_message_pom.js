import { By, Key } from "selenium-webdriver";
import { linkedinSleep, openLinkedinUrl } from "../linkedin_browser.js";

export const CONNECTIONS_URL =
    "https://www.linkedin.com/mynetwork/invite-connect/connections/";

const PAGE_HELPERS = `
function normalize(text) {
  return String(text || "").replace(/\\s+/g, " ").trim();
}

function isMessengerChrome(el) {
  return Boolean(
    el &&
      el.closest(
        ".msg-overlay-list-bubble, .msg-overlay-conversation-bubble, .msg-overlay-bubble-header, aside.msg-overlay-list-bubble-search"
      )
  );
}

function controlLabel(el) {
  return normalize(
    (el.getAttribute("aria-label") || "") +
      " " +
      (el.getAttribute("title") || "") +
      " " +
      (el.innerText || "") +
      " " +
      (el.textContent || "")
  ).toLowerCase();
}

function isMessageControl(el) {
  if (!el || isMessengerChrome(el)) return false;
  const className = String(el.className || "").toLowerCase();
  if (className.includes("message-anywhere")) return true;
  const label = controlLabel(el);
  if (!label) return false;
  if (label === "message") return true;
  if (/^message\\b/.test(label)) return true;
  if (label.includes("send a message")) return true;
  if (label.includes("message ") && !label.includes("messaging")) return true;
  return false;
}

function messageControls(root) {
  const scope = root || document;
  return [...scope.querySelectorAll("button, a, [role='button']")].filter(isMessageControl);
}

function connectionCardNodes() {
  const selectors = [
    ".mn-connection-card",
    "li.mn-connection-card",
    "[class*='mn-connection-card']",
    "li.artdeco-list__item",
    ".scaffold-finite-scroll__content li",
    "main ul li",
  ];
  const nodes = [];
  const seen = new Set();
  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (seen.has(node) || isMessengerChrome(node)) continue;
      if (!node.querySelector('a[href*="/in/"]')) continue;
      if (!messageControls(node).length) continue;
      seen.add(node);
      nodes.push(node);
    }
  }
  return nodes;
}

function cardForControl(control) {
  const known = control.closest(
    ".mn-connection-card, [class*='mn-connection-card'], li.artdeco-list, li"
  );
  if (known && known.querySelector('a[href*="/in/"]')) return known;

  const root = document.querySelector("main") || document.body;
  let node = control.parentElement;
  let card = node;
  for (let depth = 0; depth < 16 && node && node !== root; depth++) {
    const text = node.innerText || "";
    if (
      node.querySelector('a[href*="/in/"]') &&
      text.length > 20 &&
      text.length < 1600 &&
      /message/i.test(text)
    ) {
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

function parseCard(card) {
  const profileUrl = profileUrlOf(card);
  const nameNode =
    card.querySelector(".mn-connection-card__name") ||
    card.querySelector('a[href*="/in/"] span[aria-hidden="true"]') ||
    card.querySelector('a[href*="/in/"] span') ||
    card.querySelector('a[href*="/in/"]');
  const name = normalize((nameNode && (nameNode.innerText || nameNode.textContent)) || "")
    .split("\\n")[0]
    .replace(/\\s*[•·]\\s*(1st|2nd|3rd)\\+?.*$/i, "")
    .trim();

  const occupation =
    card.querySelector(".mn-connection-card__occupation") ||
    card.querySelector('[class*="occupation"]') ||
    card.querySelector('[class*="headline"]') ||
    card.querySelector(".entity-result__primary-subtitle");

  let headline = occupation ? normalize(occupation.innerText || occupation.textContent || "") : "";

  if (!headline) {
    const lines = String(card.innerText || "")
      .split(/\\n+/)
      .map((line) => normalize(line))
      .filter(Boolean);
    for (const line of lines) {
      if (!line || line.toLowerCase() === "message") continue;
      if (name && line.toLowerCase() === name.toLowerCase()) continue;
      if (/^connected on /i.test(line)) continue;
      if (/^(1st|2nd|3rd)\\+?$/i.test(line)) continue;
      if (/^\\d[,\\d]* connections?$/i.test(line)) continue;
      headline = line;
      break;
    }
  }

  return {
    profileUrl,
    name,
    headline,
    hasMessage: messageControls(card).length > 0,
  };
}

function getCards() {
  const cards = [];
  const seen = new Set();

  for (const node of connectionCardNodes()) {
    const parsed = parseCard(node);
    const key = parsed.profileUrl || (parsed.name + "|" + parsed.headline);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push(parsed);
  }

  if (cards.length) return cards;

  for (const control of messageControls(document)) {
    const card = cardForControl(control);
    if (!card) continue;
    const parsed = parseCard(card);
    const key = parsed.profileUrl || (parsed.name + "|" + parsed.headline);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push(parsed);
  }
  return cards;
}

function diagnoseConnectionsPage() {
  const cards = getCards();
  const sampleButtons = messageControls(document).slice(0, 8).map((el) => ({
    tag: el.tagName,
    className: String(el.className || "").slice(0, 120),
    label: controlLabel(el).slice(0, 120),
  }));
  return {
    url: location.href,
    connectionCardCount: document.querySelectorAll(".mn-connection-card, [class*='mn-connection-card']").length,
    messageControlCount: messageControls(document).length,
    parsedCardCount: cards.length,
    sampleCards: cards.slice(0, 5),
    sampleButtons,
    bodySnippet: normalize(document.body && document.body.innerText).slice(0, 240),
  };
}

function clickMessageForProfile(profileUrl, name) {
  const wantedUrl = (profileUrl || "").split("?")[0];
  const wantedName = (name || "").toLowerCase();

  for (const node of connectionCardNodes()) {
    const parsed = parseCard(node);
    if (wantedUrl && parsed.profileUrl === wantedUrl) {
      const control = messageControls(node)[0];
      if (control) {
        control.click();
        return true;
      }
    }
    if (!wantedUrl && wantedName && parsed.name.toLowerCase() === wantedName) {
      const control = messageControls(node)[0];
      if (control) {
        control.click();
        return true;
      }
    }
  }

  for (const control of messageControls(document)) {
    const card = cardForControl(control);
    if (!card) continue;
    const parsed = parseCard(card);
    if (wantedUrl && parsed.profileUrl === wantedUrl) {
      control.click();
      return true;
    }
    if (!wantedUrl && wantedName && parsed.name.toLowerCase() === wantedName) {
      control.click();
      return true;
    }
  }
  return false;
}

function findMessageDialog() {
  const dialogs = [
    ...document.querySelectorAll(
      ".msg-overlay-conversation-bubble, div[role='dialog'], .msg-form"
    ),
  ];
  for (const dialog of dialogs) {
    const text = normalize(dialog.innerText || "");
    if (
      /write a message/i.test(text) ||
      /new message/i.test(text) ||
      dialog.querySelector(".msg-form__contenteditable, textarea, [role='textbox']")
    ) {
      return dialog;
    }
  }
  return (
    document.querySelector(".msg-overlay-conversation-bubble") ||
    document.querySelector("div[role='dialog']")
  );
}

function dialogTitle(dialog) {
  if (!dialog) return "";
  const heading = dialog.querySelector(
    "h2, h3, .msg-overlay-bubble-header__title, [class*='msg-overlay-bubble-header']"
  );
  return normalize((heading && heading.innerText) || "");
}

function isNewConversation(dialog) {
  if (!dialog) return false;
  const title = dialogTitle(dialog).toLowerCase();
  if (title.includes("new message")) return true;

  const eventItems = dialog.querySelectorAll(
    ".msg-s-event-listitem, .msg-s-message-group, .msg-s-message-list__event, [class*='msg-s-event']"
  );
  if (eventItems.length > 0) return false;

  return Boolean(
    dialog.querySelector(
      ".msg-form__contenteditable, textarea, [role='textbox'], [placeholder*='Write a message']"
    )
  );
}

function dialogHeadline(dialog) {
  if (!dialog) return "";
  const profileBits = [...dialog.querySelectorAll("p, span, div")]
    .map((node) => normalize(node.innerText))
    .filter((text) => text.length > 12 && text.length < 220);
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
    const label = controlLabel(button);
    return label.includes("close") || label.includes("dismiss");
  });
  if (close) {
    close.click();
    return true;
  }
  return false;
}

function findSendButton(dialog) {
  if (!dialog) return null;
  return [...dialog.querySelectorAll("button")].find((button) => {
    const label = controlLabel(button);
    return label === "send" || label.includes("send message");
  });
}
`;

export const LinkedinMessagePage = {
    async open(driver) {
        await openLinkedinUrl(driver, CONNECTIONS_URL);
        await linkedinSleep(1500);
    },

    async sleep(ms) {
        await linkedinSleep(ms);
    },

    async waitForCards(driver, timeoutMs = 30000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const count = await driver.executeScript(`
                ${PAGE_HELPERS}
                return Math.max(
                  getCards().length,
                  document.querySelectorAll(".mn-connection-card, [class*='mn-connection-card']").length,
                  messageControls(document).length
                );
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
            const lastCard =
              document.querySelector(".mn-connection-card:last-of-type, [class*='mn-connection-card']:last-of-type") ||
              document.querySelector("main li:last-of-type");
            if (lastCard) lastCard.scrollIntoView({ block: "end", behavior: "instant" });
            const scroller =
              document.querySelector(".scaffold-finite-scroll__content") ||
              document.querySelector("main") ||
              document.scrollingElement;
            if (scroller) {
              scroller.scrollTop = scroller.scrollHeight;
            }
            window.scrollBy(0, Math.max(900, window.innerHeight));
        `);
    },

    async openMessageForProfile(driver, profileUrl, name) {
        return await driver.executeScript(
            `
            ${PAGE_HELPERS}
            return clickMessageForProfile(arguments[0], arguments[1]);
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
            ".msg-overlay-conversation-bubble [role='textbox']",
            "div[role='dialog'] [role='textbox']",
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

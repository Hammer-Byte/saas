import { By } from "selenium-webdriver";
import {
    finishLinkedinInvite,
    humanClick,
    humanPause,
    linkedinSleep,
    openLinkedinUrl,
} from "../linkedin_browser.js";
import { connectViaProfileMoreMenu } from "./linkedin_invite.js";

const GROW_URL = "https://www.linkedin.com/mynetwork/grow/";

const PAGE_HELPERS = `
function buttonText(button) {
  return (((button.getAttribute("aria-label") || "") + " " + (button.innerText || ""))
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase());
}

function isDirectConnect(button) {
  const text = buttonText(button);
  if (text.includes("connected") || text.includes("pending") || text.includes("disconnect")) return false;
  return text === "connect" || (text.includes("invite") && text.includes("connect"));
}

function isMore(button) {
  const text = buttonText(button);
  return text === "more" || text.includes("more actions");
}

function inviteButtons() {
  return [...document.querySelectorAll("button")].filter((button) => {
    const label = (button.getAttribute("aria-label") || "").trim();
    return /^invite .+ to connect$/i.test(label) && !button.closest("aside, header, .msg-overlay-list-bubble");
  });
}

function cardForButton(button) {
  const name = (button.getAttribute("aria-label") || "").replace(/^invite /i, "").replace(/ to connect$/i, "").trim();
  const root = document.querySelector("main") || document.body;
  let node = button.parentElement;
  let card = node;
  for (let depth = 0; depth < 12 && node && node !== root; depth++) {
    const text = node.innerText || "";
    if (name && text.includes(name) && text.length < 900) card = node;
    node = node.parentElement;
  }
  return card;
}

function profileUrlOf(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link || !link.href) return "";
  return link.href.split("?")[0];
}

function discoverCards() {
  const cards = [];
  const seen = new Set();
  for (const button of inviteButtons()) {
    const card = cardForButton(button);
    if (!card || seen.has(card)) continue;
    seen.add(card);
    cards.push(card);
  }
  // Also pick up Follow/More-only cards that have no Invite button.
  const selectors = [
    "li.discover-person-card-list__card",
    "div.discover-entity-card",
    "div[role='listitem']",
    "ul.artdeco-list > li",
  ];
  for (const selector of selectors) {
    for (const card of document.querySelectorAll(selector)) {
      if (seen.has(card)) continue;
      if (!card.querySelector('a[href*="/in/"]')) continue;
      seen.add(card);
      cards.push(card);
    }
  }
  return cards;
}

function getCards() {
  return discoverCards();
}

function parseCard(card) {
  const profileUrl = profileUrlOf(card);
  const nameNode =
    card.querySelector('a[href*="/in/"] span[aria-hidden="true"]') ||
    card.querySelector('a[href*="/in/"]');
  const name = ((nameNode && nameNode.innerText) || "")
    .trim()
    .split("\\n")[0]
    .replace(/\\s*[•·]\\s*(1st|2nd|3rd)\\+?.*$/i, "")
    .trim();
  const subtitle =
    card.querySelector(".discover-person-card__occupation") ||
    card.querySelector(".entity-result__primary-subtitle") ||
    card.querySelector('[class*="occupation"]') ||
    card.querySelector('[class*="headline"]');
  let designation = ((subtitle && subtitle.innerText) || "").trim();
  if (!designation) {
    const ignored = /^(connect|follow|message|pending|more|1st|2nd|3rd|[•·]\\s*(1st|2nd|3rd)\\+?|based on your profile)$/i;
    const lines = (card.innerText || "")
      .split("\\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => line !== name && !ignored.test(line) && !/mutual connection/i.test(line));
    designation = lines[0] || "";
  }
  const buttons = [...card.querySelectorAll("button")];
  const pending = buttons.some((button) => buttonText(button).includes("pending"));
  const hasDirect = buttons.some(isDirectConnect);
  const hasMore = buttons.some(isMore);
  const hasFollow = buttons.some((button) => {
    const text = buttonText(button);
    return text === "follow" || text.startsWith("follow ");
  });
  return {
    name,
    designation,
    profileUrl,
    // Direct Connect, card More, or Follow-only (profile → More → Connect).
    canConnect: !pending && (hasDirect || hasMore || hasFollow),
  };
}

function findCard(profileUrl) {
  return getCards().find((card) => profileUrlOf(card) === profileUrl) || null;
}
`;

export class LinkedinGrowPage {
    static path = GROW_URL;

    static async openUrl(driver, url) {
        await openLinkedinUrl(driver, url);
    }

    static async open(driver) {
        await openLinkedinUrl(driver, GROW_URL);
    }

    static async waitForInviteButtons(driver) {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const count = await driver.executeScript(`
                ${PAGE_HELPERS}
                const invites = [...document.querySelectorAll("button")].filter((button) =>
                    /^invite .+ to connect$/i.test((button.getAttribute("aria-label") || "").trim())
                ).length;
                return Math.max(invites, getCards().length);
            `);
            if (count > 0) {
                return;
            }
            await linkedinSleep(500);
        }
    }

    static async ensureGrowPage(driver) {
        const url = await driver.getCurrentUrl();
        if (!url.includes("/mynetwork/grow")) {
            throw new Error(`Grow page did not open. Current page: ${url}`);
        }
    }

    static async readCards(driver) {
        const cards = await driver.executeScript(`
            ${PAGE_HELPERS}
            return getCards().map(parseCard).filter((card) => card.profileUrl);
        `);
        return Array.isArray(cards) ? cards : [];
    }

    static async scrollGrowPage(driver) {
        await driver.executeScript(`
            const buttons = [...document.querySelectorAll("button")].filter((button) =>
                /^invite .+ to connect$/i.test((button.getAttribute("aria-label") || "").trim())
            );
            const last = buttons[buttons.length - 1];
            if (last) last.scrollIntoView({ block: "end", behavior: "instant" });

            const main = document.querySelector("main");
            if (main && main.scrollHeight > main.clientHeight) {
                main.scrollTop = main.scrollHeight;
                return;
            }

            let node = last ? last.parentElement : null;
            while (node) {
                const style = getComputedStyle(node);
                if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 20) {
                    node.scrollTop = node.scrollHeight;
                    return;
                }
                node = node.parentElement;
            }

            window.scrollTo(0, document.body.scrollHeight);
        `);
    }

    static async sendConnect(driver, profileUrl, name) {
        const growUrl = await driver.getCurrentUrl();
        const marked = await driver.executeScript(
            `
                ${PAGE_HELPERS}
                document.querySelectorAll("[data-li-grow-action]").forEach((el) => el.removeAttribute("data-li-grow-action"));
                const card = findCard(arguments[0]);
                if (!card) return "missing";
                card.scrollIntoView({ block: "center" });
                const buttons = [...card.querySelectorAll("button")];
                const connect = buttons.find(isDirectConnect);
                if (connect) {
                    connect.setAttribute("data-li-grow-action", "1");
                    return "connect";
                }
                const more = buttons.find(isMore);
                if (more) {
                    more.setAttribute("data-li-grow-action", "1");
                    return "more";
                }
                return "none";
            `,
            profileUrl,
        );

        if (marked === "connect" || marked === "more") {
            try {
                const actionEl = await driver.findElement(By.css('[data-li-grow-action="1"]'));
                await humanClick(driver, actionEl);
                await humanPause(1500, 3000);

                if (marked === "more") {
                    const opened = await driver.executeScript(`
                        document.querySelectorAll("[data-li-grow-menu-connect]").forEach((el) => el.removeAttribute("data-li-grow-menu-connect"));
                        const items = [...document.querySelectorAll('[role="menuitem"], [role="menu"] button, [role="menu"] [role="button"], .artdeco-dropdown__content button, .artdeco-dropdown__content li, .artdeco-dropdown__content span')];
                        const item = items.find((entry) => (entry.innerText || "").trim().toLowerCase() === "connect");
                        if (!item) return false;
                        const target = item.closest("button, [role='menuitem']") || item;
                        target.setAttribute("data-li-grow-menu-connect", "1");
                        return true;
                    `);
                    if (!opened) {
                        return connectViaProfileMoreMenu(driver, profileUrl, name, growUrl);
                    }
                    const menuConnect = await driver.findElement(By.css('[data-li-grow-menu-connect="1"]'));
                    await humanClick(driver, menuConnect);
                    await humanPause(1500, 3000);
                }

                const result = await finishLinkedinInvite(driver, name);
                if (result !== "skipped") {
                    return result;
                }
            } catch {
                // Fall through to profile path.
            }
        }

        // No Connect on card (or dialog did not open) → click profile → Connect / More → Connect
        return connectViaProfileMoreMenu(driver, profileUrl, name, growUrl);
    }

    static sleep(ms) {
        return linkedinSleep(ms);
    }
}

export function designationMatches(designation, keywords) {
    const haystack = String(designation || "").toLowerCase();
    return (keywords || []).some((keyword) => {
        const needle = String(keyword || "").trim().toLowerCase();
        return needle && haystack.includes(needle);
    });
}

import {
    finishLinkedinInvite,
    linkedinSleep,
    openLinkedinUrl,
} from "../linkedin_browser.js";

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

function getCards() {
  const cards = [];
  const seen = new Set();
  for (const button of inviteButtons()) {
    const card = cardForButton(button);
    if (!card || seen.has(card)) continue;
    seen.add(card);
    cards.push(card);
  }
  return cards;
}

function profileUrlOf(card) {
  const link = card.querySelector('a[href*="/in/"]');
  if (!link || !link.href) return "";
  return link.href.split("?")[0];
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
  return {
    name,
    designation,
    profileUrl,
    canConnect: buttons.some((button) => isDirectConnect(button) || isMore(button)),
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
                return [...document.querySelectorAll("button")].filter((button) =>
                    /^invite .+ to connect$/i.test((button.getAttribute("aria-label") || "").trim())
                ).length;
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
        const click = await driver.executeScript(
            `
                ${PAGE_HELPERS}
                const card = findCard(arguments[0]);
                if (!card) return "missing";
                card.scrollIntoView({ block: "center" });
                const buttons = [...card.querySelectorAll("button")];
                const connect = buttons.find(isDirectConnect);
                if (connect) {
                    connect.click();
                    return "connect";
                }
                const more = buttons.find(isMore);
                if (more) {
                    more.click();
                    return "more";
                }
                return "none";
            `,
            profileUrl,
        );

        if (click === "missing" || click === "none") {
            return "skipped";
        }

        if (click === "more") {
            await linkedinSleep(600);
            const opened = await driver.executeScript(`
                const items = [...document.querySelectorAll('[role="menuitem"], [role="menu"] button, [role="menu"] [role="button"], .artdeco-dropdown__content button, .artdeco-dropdown__content li, .artdeco-dropdown__content span')];
                const item = items.find((entry) => (entry.innerText || "").trim().toLowerCase() === "connect");
                if (!item) return false;
                (item.closest("button, [role='menuitem']") || item).click();
                return true;
            `);
            if (!opened) {
                return "skipped";
            }
        }

        await linkedinSleep(800);
        return finishLinkedinInvite(driver, name);
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

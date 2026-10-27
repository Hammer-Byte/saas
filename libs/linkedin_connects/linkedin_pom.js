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
        try {
            await driver.get(url);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/timeout/i.test(message)) {
                throw error;
            }
        }
    }

    static async open(driver) {
        await LinkedinGrowPage.openUrl(driver, GROW_URL);
    }

    static async loginWithCookie(driver, cookie) {
        await LinkedinGrowPage.openUrl(driver, "https://www.linkedin.com");
        await driver.manage().addCookie({
            name: "li_at",
            value: cookie,
            domain: ".linkedin.com",
            path: "/",
            secure: true,
            httpOnly: true,
            sameSite: "None",
        });
        await LinkedinGrowPage.openUrl(driver, "https://www.linkedin.com/feed/");
        await LinkedinGrowPage.waitForLogin(driver);
    }

    static async waitForLogin(driver) {
        const deadline = Date.now() + 20_000;

        while (Date.now() < deadline) {
            const url = await driver.getCurrentUrl();
            if (LinkedinGrowPage.isLoggedIn(url)) {
                return;
            }
            if (/login|checkpoint|challenge|authwall|uas\/login/i.test(url)) {
                break;
            }
            await LinkedinGrowPage.sleep(1000);
        }

        throw new Error(
            "LinkedIn did not accept this li_at cookie. Export a new one while that account is still logged in, and do not log out afterwards.",
        );
    }

    static isLoggedIn(url) {
        return /https:\/\/([a-z]{2,3}\.)?linkedin\.com\/(feed|search|mynetwork|in)\b/.test(url);
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
            await LinkedinGrowPage.sleep(500);
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
            await LinkedinGrowPage.sleep(600);
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

        await LinkedinGrowPage.sleep(800);
        return LinkedinGrowPage.finishInvite(driver, name);
    }

    static async finishInvite(driver, name) {
        const outcome = await driver.executeScript(`
            const bodyText = document.body.innerText || "";
            if (/weekly invitation limit|invitation limit/i.test(bodyText)) return "limit";
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return "none";
            const text = dialog.innerText || "";
            if (/enter their email to connect/i.test(text)) return "email";
            const buttons = [...dialog.querySelectorAll("button")];
            const labelOf = (button) => ((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).replace(/\\s+/g, " ").trim();
            const sendWithout = buttons.find((button) => /send without a note/i.test(labelOf(button)));
            const send = buttons.find((button) => /^(send|send now|send invitation)$/i.test(labelOf(button)));
            const target = sendWithout || send;
            if (!target) return "none";
            target.click();
            return "sent";
        `);

        if (outcome === "limit") {
            return "limit";
        }
        if (outcome === "email") {
            await LinkedinGrowPage.dismissDialog(driver);
            return "skipped";
        }
        if (outcome === "sent") {
            return "sent";
        }
        if (await LinkedinGrowPage.invitationIsPending(driver, name)) {
            return "sent";
        }
        await LinkedinGrowPage.dismissDialog(driver);
        return "skipped";
    }

    static async invitationIsPending(driver, name) {
        return await driver.executeScript(
            `
                const name = (arguments[0] || "").toLowerCase();
                return [...document.querySelectorAll("a, button")].some((el) => {
                    const label = ((el.getAttribute("aria-label") || "") + " " + (el.innerText || "")).replace(/\\s+/g, " ").trim().toLowerCase();
                    return label.includes("pending") && name && label.includes(name);
                });
            `,
            name,
        );
    }

    static async dismissDialog(driver) {
        await driver.executeScript(`
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return;
            const close = [...dialog.querySelectorAll("button")].find((button) => {
                const label = ((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).toLowerCase();
                return label.includes("dismiss") || label.includes("close");
            });
            if (close) close.click();
        `);
    }

    static sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

export function designationMatches(designation, keywords) {
    const haystack = String(designation || "").toLowerCase();
    return (keywords || []).some((keyword) => {
        const needle = String(keyword || "").trim().toLowerCase();
        return needle && haystack.includes(needle);
    });
}

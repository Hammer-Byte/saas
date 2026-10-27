import {
    finishLinkedinInvite,
    linkedinSleep,
    openLinkedinUrl,
} from "../linkedin_browser.js";

const SEARCH_HELPERS = `
function buttonText(button) {
  return (((button.getAttribute("aria-label") || "") + " " + (button.innerText || ""))
    .replace(/\\s+/g, " ")
    .trim()
    .toLowerCase());
}

function isDirectConnect(button) {
  const text = buttonText(button);
  if (text.includes("connected") || text.includes("pending") || text.includes("disconnect") || text.includes("follow")) return false;
  return text === "connect" || (text.includes("invite") && text.includes("connect"));
}

function isMore(button) {
  const text = buttonText(button);
  return text === "more" || text.includes("more actions");
}

function resultCards() {
  const selectors = [
    "li.reusable-search__result-container",
    "div.entity-result",
    "li.GVmhKWYzgCNHyUXugEMhiQeWYmsCWZHZVI",
    "div[data-chameleon-result-urn]",
    "ul.reusable-search__entity-result-list > li",
  ];
  const cards = [];
  const seen = new Set();
  for (const selector of selectors) {
    for (const card of document.querySelectorAll(selector)) {
      if (seen.has(card)) continue;
      seen.add(card);
      cards.push(card);
    }
    if (cards.length) break;
  }
  if (cards.length) return cards;

  return [...document.querySelectorAll('a[href*="/in/"]')]
    .map((link) => link.closest("li, div.entity-result, div[data-chameleon-result-urn]") || link.parentElement)
    .filter(Boolean)
    .filter((card, index, list) => list.indexOf(card) === index);
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
    card.querySelector('span.entity-result__title-text a span[aria-hidden="true"]') ||
    card.querySelector('a[href*="/in/"]');
  const name = ((nameNode && nameNode.innerText) || "")
    .trim()
    .split("\\n")[0]
    .replace(/\\s*[•·]\\s*(1st|2nd|3rd)\\+?.*$/i, "")
    .trim();
  const buttons = [...card.querySelectorAll("button")];
  return {
    name,
    profileUrl,
    canConnect: buttons.some((button) => isDirectConnect(button) || isMore(button)),
  };
}

function findCard(profileUrl) {
  return resultCards().find((card) => profileUrlOf(card) === profileUrl) || null;
}
`;

export class LinkedinSearchPage {
    static peopleSearchUrl(keyword) {
        const encoded = encodeURIComponent(String(keyword || "").trim());
        return `https://www.linkedin.com/search/results/people/?keywords=${encoded}&origin=SWITCH_SEARCH_VERTICAL`;
    }

    static async openPeopleSearch(driver, keyword) {
        await openLinkedinUrl(driver, LinkedinSearchPage.peopleSearchUrl(keyword));
    }

    static async waitForResults(driver) {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const count = await driver.executeScript(`
                ${SEARCH_HELPERS}
                return resultCards().length;
            `);
            if (count > 0) {
                return;
            }
            await linkedinSleep(500);
        }
    }

    static async readCards(driver) {
        const cards = await driver.executeScript(`
            ${SEARCH_HELPERS}
            return resultCards().map(parseCard).filter((card) => card.profileUrl);
        `);
        return Array.isArray(cards) ? cards : [];
    }

    static async sendConnect(driver, profileUrl, name) {
        const click = await driver.executeScript(
            `
                ${SEARCH_HELPERS}
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

    static async goToNextPage(driver) {
        const moved = await driver.executeScript(`
            const nextButton = [...document.querySelectorAll("button, a")].find((entry) => {
                const label = (((entry.getAttribute("aria-label") || "") + " " + (entry.innerText || ""))
                    .replace(/\\s+/g, " ")
                    .trim()
                    .toLowerCase());
                if (!(label === "next" || label.includes("next"))) return false;
                if (entry.getAttribute("disabled") != null) return false;
                if (entry.getAttribute("aria-disabled") === "true") return false;
                if (entry.classList.contains("artdeco-button--disabled")) return false;
                return true;
            });
            if (!nextButton) return false;
            nextButton.scrollIntoView({ block: "center" });
            nextButton.click();
            return true;
        `);

        if (!moved) {
            return false;
        }

        await linkedinSleep(2000);
        await LinkedinSearchPage.waitForResults(driver);
        return true;
    }

    static sleep(ms) {
        return linkedinSleep(ms);
    }
}

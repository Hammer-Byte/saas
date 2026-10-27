import {
    finishLinkedinInvite,
    linkedinSleep,
    openLinkedinUrl,
} from "../linkedin_browser.js";

const SEARCH_HELPERS = `
function ariaText(entry) {
  return ((entry.getAttribute("aria-label") || "").replace(/\\s+/g, " ").trim().toLowerCase());
}

function isInviteConnectControl(entry) {
  const aria = ariaText(entry);
  return aria.includes("invite") && aria.includes("to connect");
}

function inviteConnectLinks(root) {
  const scope = root || document;
  return [...scope.querySelectorAll("a[aria-label], button[aria-label]")].filter(isInviteConnectControl);
}

function moreActions(root) {
  return [...root.querySelectorAll("button[aria-label], a[aria-label], [role='button']")].filter((entry) => {
    const aria = ariaText(entry);
    return aria === "more" || aria.includes("more actions");
  });
}

function profileUrlFromCard(card) {
  if (!card) return "";
  const links = [...card.querySelectorAll('a[href*="/in/"]')].filter((link) => !isInviteConnectControl(link));
  const link = links[0];
  if (!link || !link.href) return "";
  return link.href.split("?")[0];
}

function profileUrlFromInvite(link) {
  const href = link.getAttribute("href") || "";
  try {
    const vanity = new URL(href, location.origin).searchParams.get("vanityName");
    if (vanity) return "https://www.linkedin.com/in/" + vanity + "/";
  } catch (error) {}
  return profileUrlFromCard(link.closest("div[role='listitem'], li, div.entity-result"));
}

function nameFromInvite(link) {
  return ((link.getAttribute("aria-label") || "").replace(/^invite /i, "").replace(/ to connect$/i, "").trim());
}

function parseInviteLink(link) {
  return {
    name: nameFromInvite(link),
    profileUrl: profileUrlFromInvite(link),
    canConnect: true,
    actionLabels: [ariaText(link)],
  };
}

function resultCards() {
  const selectors = [
    "div[role='listitem']",
    "li.reusable-search__result-container",
    "div.entity-result",
    "ul.reusable-search__entity-result-list > li",
  ];
  const cards = [];
  const seen = new Set();
  for (const selector of selectors) {
    for (const card of document.querySelectorAll(selector)) {
      if (seen.has(card)) continue;
      if (!card.querySelector('a[href*="/in/"]')) continue;
      seen.add(card);
      cards.push(card);
    }
    if (cards.length) break;
  }
  return cards;
}

function readPeople() {
  const invites = inviteConnectLinks().map(parseInviteLink).filter((person) => person.profileUrl);
  if (invites.length) return invites;

  return resultCards().map((card) => {
    const profileUrl = profileUrlFromCard(card);
    const nameNode =
      card.querySelector('a[href*="/in/"] span[aria-hidden="true"]') ||
      card.querySelector('a[href*="/in/"]');
    const name = ((nameNode && nameNode.innerText) || "")
      .trim()
      .split("\\n")[0]
      .replace(/\\s*[•·]\\s*(1st|2nd|3rd)\\+?.*$/i, "")
      .trim();
    const canConnect = inviteConnectLinks(card).length > 0 || moreActions(card).length > 0;
    return {
      name,
      profileUrl,
      canConnect,
      actionLabels: [
        ...inviteConnectLinks(card).map(ariaText),
        ...moreActions(card).map(ariaText),
      ],
    };
  }).filter((person) => person.profileUrl);
}

function findInviteForProfile(profileUrl) {
  const normalized = (profileUrl || "").replace(/\\/$/, "");
  return inviteConnectLinks().find((link) => {
    const parsed = parseInviteLink(link);
    return (parsed.profileUrl || "").replace(/\\/$/, "") === normalized;
  }) || null;
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
        const deadline = Date.now() + 25_000;
        while (Date.now() < deadline) {
            const count = await driver.executeScript(`
                ${SEARCH_HELPERS}
                return Math.max(inviteConnectLinks().length, resultCards().length);
            `);
            if (count > 0) {
                return count;
            }
            await linkedinSleep(500);
        }
        return 0;
    }

    static async hydrateInviteLinks(driver) {
        for (let attempt = 0; attempt < 10; attempt++) {
            await driver.executeScript(`
                const cards = [...document.querySelectorAll("div[role='listitem'], li.reusable-search__result-container")];
                for (const card of cards.slice(0, 15)) card.scrollIntoView({ block: "center" });
            `);
            await linkedinSleep(900);
            const count = await driver.executeScript(`
                ${SEARCH_HELPERS}
                return inviteConnectLinks().length;
            `);
            if (count > 0) {
                await driver.executeScript("window.scrollTo(0, 0)");
                return count;
            }
            await driver.executeScript("window.scrollBy(0, 400)");
            await linkedinSleep(600);
        }
        return 0;
    }

    static async readCards(driver) {
        const cards = await driver.executeScript(`
            ${SEARCH_HELPERS}
            return readPeople();
        `);
        return Array.isArray(cards) ? cards : [];
    }

    static async diagnosePage(driver) {
        return await driver.executeScript(`
            ${SEARCH_HELPERS}
            const people = readPeople();
            return {
                url: location.href,
                inviteLinkCount: inviteConnectLinks().length,
                cardCount: people.length,
                connectableCount: people.filter((person) => person.canConnect).length,
                sample: people.slice(0, 5),
            };
        `);
    }

    static async sendConnect(driver, profileUrl, name) {
        // Live search Connect controls are <a href="/preload/search-custom-invite/...">.
        // In-page click does not open the invite dialog; navigating the preload URL does.
        const inviteHref = await driver.executeScript(
            `
                ${SEARCH_HELPERS}
                const profileUrl = arguments[0];
                const link = findInviteForProfile(profileUrl);
                if (!link) return "";
                const href = link.getAttribute("href") || "";
                if (!href) return "";
                try {
                  return new URL(href, location.origin).toString();
                } catch (error) {
                  return href;
                }
            `,
            profileUrl,
        );

        if (!inviteHref) {
            return "skipped";
        }

        const searchUrl = await driver.getCurrentUrl();
        await openLinkedinUrl(driver, inviteHref);
        const dialogReady = await LinkedinSearchPage.waitForInviteDialog(driver);
        if (!dialogReady) {
            await openLinkedinUrl(driver, searchUrl);
            await LinkedinSearchPage.hydrateInviteLinks(driver);
            return "skipped";
        }

        const result = await finishLinkedinInvite(driver, name);
        await openLinkedinUrl(driver, searchUrl);
        await LinkedinSearchPage.hydrateInviteLinks(driver);
        return result;
    }

    static async waitForInviteDialog(driver) {
        const deadline = Date.now() + 6_000;
        while (Date.now() < deadline) {
            const ready = await driver.executeScript(`
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return false;
                const text = ((dialog.innerText || "") + " " + [...dialog.querySelectorAll("button, [role='button'], a")].map((button) =>
                    ((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).trim()
                ).join(" ")).toLowerCase();
                if (text.includes("this is a modal window") && text.length < 40) return false;
                return /send without a note|send invitation|send now|add a note|email to connect|invitation limit|\\bsend\\b/i.test(text);
            `);
            if (ready) {
                return true;
            }
            await linkedinSleep(250);
        }
        return false;
    }

    static async goToNextPage(driver, currentPage) {
        const nextPage = currentPage + 1;
        const moved = await driver.executeScript(
            `
                const nextPage = arguments[0];
                const candidates = [...document.querySelectorAll("button, a")];
                const labelOf = (entry) => (((entry.getAttribute("aria-label") || "") + " " + (entry.innerText || ""))
                    .replace(/\\s+/g, " ")
                    .trim()
                    .toLowerCase());
                const isEnabled = (entry) =>
                    entry.getAttribute("disabled") == null &&
                    entry.getAttribute("aria-disabled") !== "true" &&
                    !entry.classList.contains("artdeco-button--disabled");

                const target =
                    candidates.find((entry) => labelOf(entry) === "next" && isEnabled(entry)) ||
                    candidates.find((entry) => labelOf(entry).includes("next") && isEnabled(entry)) ||
                    candidates.find((entry) => {
                        const label = labelOf(entry);
                        return (label === String(nextPage) || label === ("page " + nextPage)) && isEnabled(entry);
                    });

                if (!target) return false;
                target.scrollIntoView({ block: "center" });
                target.click();
                return true;
            `,
            nextPage,
        );

        if (!moved) {
            return false;
        }

        await linkedinSleep(2500);
        await LinkedinSearchPage.waitForResults(driver);
        return true;
    }

    static sleep(ms) {
        return linkedinSleep(ms);
    }
}

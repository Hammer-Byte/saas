import { By } from "selenium-webdriver";
import {
    finishLinkedinInvite,
    humanClick,
    humanPause,
    linkedinSleep,
    navigateBack,
    openLinkedinUrl,
} from "../linkedin_browser.js";
import {
    connectViaProfileMoreMenu,
    waitForInviteDialog,
} from "./linkedin_invite.js";

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

function isPendingControl(entry) {
  return ariaText(entry).includes("pending");
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
    connectPath: "invite",
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

function parseResultCard(card) {
  const profileUrl = profileUrlFromCard(card);
  const nameNode =
    card.querySelector('a[href*="/in/"] span[aria-hidden="true"]') ||
    card.querySelector('a[href*="/in/"]');
  const name = ((nameNode && nameNode.innerText) || "")
    .trim()
    .split("\\n")[0]
    .replace(/\\s*[•·]\\s*(1st|2nd|3rd)\\+?.*$/i, "")
    .trim();
  const invites = inviteConnectLinks(card);
  const mores = moreActions(card);
  const pending = [...card.querySelectorAll("a, button, [role='button']")].some(isPendingControl);
  const follow = [...card.querySelectorAll("a, button")].some((entry) => {
    const aria = ariaText(entry);
    return aria === "follow" || aria.startsWith("follow ");
  });
  let connectPath = "none";
  if (invites.length) connectPath = "invite";
  else if (mores.length) connectPath = "more";
  else if (follow) connectPath = "profile"; // Follow-only → open profile → More → Connect

  const canConnect = !pending && connectPath !== "none";
  return {
    name,
    profileUrl,
    canConnect,
    connectPath,
    actionLabels: [
      ...invites.map(ariaText),
      ...mores.map(ariaText),
      ...[...card.querySelectorAll("button, a[aria-label]")].map(ariaText).filter((label) =>
        /follow|message|pending|connect/.test(label)
      ),
    ],
  };
}

function readPeople() {
  // Always enumerate result cards so Follow-only people are included even when
  // other rows expose Invite links.
  const byUrl = new Map();
  for (const card of resultCards()) {
    const person = parseResultCard(card);
    if (!person.profileUrl) continue;
    byUrl.set(person.profileUrl.replace(/\\/$/, ""), person);
  }
  for (const link of inviteConnectLinks()) {
    const person = parseInviteLink(link);
    if (!person.profileUrl) continue;
    const key = person.profileUrl.replace(/\\/$/, "");
    byUrl.set(key, { ...(byUrl.get(key) || {}), ...person, canConnect: true, connectPath: "invite" });
  }
  return [...byUrl.values()];
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
        const searchUrl = await driver.getCurrentUrl();

        // 1) Click Connect/Invite on the card (no typed preload URL).
        const markedInvite = await driver.executeScript(
            `
                ${SEARCH_HELPERS}
                document.querySelectorAll("[data-li-card-invite]").forEach((el) => el.removeAttribute("data-li-card-invite"));
                const link = findInviteForProfile(arguments[0]);
                if (!link) return false;
                link.setAttribute("data-li-card-invite", "1");
                return true;
            `,
            profileUrl,
        );

        if (markedInvite) {
            try {
                const inviteEl = await driver.findElement(By.css('[data-li-card-invite="1"]'));
                await humanClick(driver, inviteEl);
                await humanPause(1500, 3000);
                const dialogReady = await waitForInviteDialog(driver);
                if (dialogReady) {
                    const result = await finishLinkedinInvite(driver, name);
                    const backed = await navigateBack(driver, "/search/", 4);
                    if (!backed) {
                        await openLinkedinUrl(driver, searchUrl);
                    }
                    await humanPause(1500, 3000);
                    await LinkedinSearchPage.hydrateInviteLinks(driver);
                    return result;
                }
            } catch {
                // Fall through to profile path.
            }
            const backed = await navigateBack(driver, "/search/", 3);
            if (!backed) {
                await openLinkedinUrl(driver, searchUrl);
            }
            await LinkedinSearchPage.hydrateInviteLinks(driver);
            await humanPause(1500, 3000);
        }

        // 2–3) Click into profile → Connect on profile, else More → Connect → Send without a note
        const result = await connectViaProfileMoreMenu(driver, profileUrl, name, searchUrl);
        await LinkedinSearchPage.hydrateInviteLinks(driver);
        return result;
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

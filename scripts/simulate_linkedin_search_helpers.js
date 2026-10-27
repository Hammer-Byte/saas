/**
 * Local Firefox + HTML fixture simulation for SearchNetwork helpers (no LinkedIn login).
 * Run: bun scripts/simulate_linkedin_search_helpers.js
 */
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LinkedinSearchPage } from "../libs/linkedin_connects/linkedin_search_pom.js";
import { openFirefox } from "../libs/linkedin_browser.js";

const fixturePath = join(tmpdir(), `linkedin-search-fixture-${Date.now()}.html`);
const fixture = `<!doctype html>
<html>
  <body>
    <main>
      <div role="listitem">
        <a href="https://www.linkedin.com/in/alice-ceo/">
          <span aria-hidden="true">Alice CEO</span>
        </a>
        <button aria-label="Invite Alice CEO to connect">Connect</button>
      </div>
      <div role="listitem">
        <a href="https://www.linkedin.com/in/bob-founder/">
          <span aria-hidden="true">Bob Founder</span>
        </a>
        <button>Follow</button>
        <button aria-label="More actions">More</button>
      </div>
      <div role="listitem">
        <a href="https://www.linkedin.com/in/cara-pending/">
          <span aria-hidden="true">Cara Pending</span>
        </a>
        <button aria-label="Pending">Pending</button>
      </div>
      <li class="reusable-search__result-container">
        <a href="https://www.linkedin.com/in/dan-plain/"><span aria-hidden="true">Dan Plain</span></a>
        <button>Connect</button>
      </li>
      <div role="dialog">
        <button aria-label="Send without a note">Send without a note</button>
      </div>
    </main>
  </body>
</html>`;

writeFileSync(fixturePath, fixture);

let driver = null;
try {
    driver = await openFirefox();
    await driver.get(`file://${fixturePath}`);

    const diagnosis = await LinkedinSearchPage.diagnosePage(driver);
    const cards = await LinkedinSearchPage.readCards(driver);
    const alice = cards.find((card) => card.profileUrl.includes("alice-ceo"));
    const click = alice
        ? await driver.executeScript(
              `
                const profileUrl = arguments[0];
                const card = [...document.querySelectorAll("div[role='listitem'], li.reusable-search__result-container")]
                  .find((entry) => {
                    const link = entry.querySelector('a[href*="/in/"]');
                    return link && link.href.split("?")[0] === profileUrl;
                  });
                if (!card) return "missing";
                const button = [...card.querySelectorAll("button")].find((entry) =>
                  /connect/i.test((entry.getAttribute("aria-label") || "") + " " + (entry.innerText || ""))
                );
                if (!button) return "none";
                button.click();
                return "connect";
              `,
              alice.profileUrl,
          )
        : "missing-alice";

    const dialogReady = await LinkedinSearchPage.waitForInviteDialog(driver);

    console.log(
        JSON.stringify(
            {
                diagnosis,
                cardCount: cards.length,
                connectableCount: cards.filter((card) => card.canConnect).length,
                aliceClick: click,
                dialogReady,
            },
            null,
            2,
        ),
    );

    if (!(diagnosis.cardCount >= 3)) {
        throw new Error(`expected >=3 cards, got ${diagnosis.cardCount}`);
    }
    if (!(diagnosis.connectableCount >= 2)) {
        throw new Error(`expected >=2 connectable, got ${diagnosis.connectableCount}`);
    }
    if (click !== "connect") {
        throw new Error(`expected alice click=connect, got ${click}`);
    }
    if (!dialogReady) {
        throw new Error("expected send-without-note dialog to be detected");
    }

    console.log("PASS: search helpers detect cards/connect/dialog on local fixture");
} finally {
    if (driver) {
        await driver.quit().catch(() => undefined);
    }
    try {
        unlinkSync(fixturePath);
    } catch {
        // ignore cleanup errors
    }
}

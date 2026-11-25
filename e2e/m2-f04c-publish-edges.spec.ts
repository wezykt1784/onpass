// Milestone 2 specs change the demo data (they confirm allergens, publish menus), so their files start with m2- to run after f01-f08.
// F04 edge and negative cases from the replica-test checklist.
import { test, expect, ready, appAlert, noSidewaysScroll, confirmChipotle } from "./fixtures";
import type { Page } from "@playwright/test";

const WINTER = "Winter menu 2026";

async function board(page: Page) {
  await page.goto("/app/publish/br-taverns");
  await ready(page);
}
const liveList = (page: Page) => page.getByRole("region", { name: /What guests see now/ }).getByRole("listitem");
const stagingList = (page: Page) => page.getByRole("region", { name: /Check before it goes live/ }).getByRole("listitem");
const ONLY_WINTER = new RegExp(`^${WINTER}(?! \\(copy)`);
const winterStaging = (page: Page) => stagingList(page).filter({ hasText: ONLY_WINTER });

/** Winter menu in staging, nothing else of it in staging. */
async function stageWinter(page: Page) {
  await board(page);
  const add = page.getByRole("button", { name: `Add to staging: ${WINTER}`, exact: true });
  const refresh = page.getByRole("button", { name: `Refresh staging copy of ${WINTER}`, exact: true });
  await (await add.count() ? add : refresh).click();
  await expect(stagingList(page).filter({ hasText: ONLY_WINTER })).toHaveCount(1);
}

test.describe("F04c publishing edge cases", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ signInAs }) => { await signInAs("central"); });

  test("F04-E7 long names with accents and emoji", async ({ page, signInAs }) => {
    await signInAs("admin");
    await page.goto("/app/admin/brands/new");
    await ready(page);
    const brand = "Brasserie Côté Jardin & Grill Room, Ångström Wharf 🍷 extra words to fill it";
    await page.getByLabel("Brand name").fill(brand);
    await expect(page.getByLabel("Web name")).toHaveValue(/^brasserie-cote-jardin-grill-room-angstr/);
    await page.getByRole("button", { name: "Create brand" }).click();
    await page.waitForURL(/\/app\/admin\/brands\/(?!new)/);
    await ready(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(brand);
    await page.getByLabel("Site name").fill("Ñandú Café, Wężyk Street, Brixton 🌶 (upstairs bar)");
    await page.getByRole("button", { name: "Add site" }).click();
    await expect(page.getByText(/\/s\/demo\/nandu-cafe-wezyk-street-brixton-upstairs/)).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await noSidewaysScroll(page);
  });

  test("F04-E8 a site name with no letters or numbers is refused", async ({ page, signInAs }) => {
    await signInAs("admin");
    await page.goto("/app/admin/brands/br-hotels");
    await ready(page);
    await page.getByRole("button", { name: "Add a site" }).click();
    await page.getByLabel("Site name").fill("🍺🍺");
    await page.getByRole("button", { name: "Add site" }).click();
    await expect(appAlert(page).or(page.getByText(/web name needs at least 2/))).toContainText(/at least 2 letters or numbers/);
  });

  test("F04-E9 double click on Go live makes one live menu, no error", async ({ page }) => {
    await confirmChipotle(page);
    await stageWinter(page);
    await winterStaging(page).getByRole("button", { name: "Go live now" }).dblclick();
    await expect(liveList(page).filter({ hasText: ONLY_WINTER })).toHaveCount(1);
    await expect(appAlert(page)).toHaveCount(0);
    await page.reload();
    await ready(page);
    await expect(liveList(page).filter({ hasText: ONLY_WINTER })).toHaveCount(1);
  });

  test("F04-E10 two tabs: the second Go live gets a plain answer", async ({ page, context }) => {
    await stageWinter(page);
    const other = await context.newPage();
    await other.goto("/app/publish/br-taverns");
    await ready(other);
    await winterStaging(page).getByRole("button", { name: "Go live now" }).click();
    await expect(stagingList(page).filter({ hasText: ONLY_WINTER })).toHaveCount(0);
    await winterStaging(other).getByRole("button", { name: "Go live now" }).click();
    await expect(appAlert(other)).toContainText(/already put this menu live/);
    await other.reload();
    await ready(other);
    await expect(liveList(other).filter({ hasText: ONLY_WINTER })).toHaveCount(1);
    await other.close();
  });

  test("F04-E11 a time in the past is refused", async ({ page }) => {
    await stageWinter(page);
    const row = stagingList(page).filter({ hasText: ONLY_WINTER });
    await row.getByRole("button", { name: "Schedule" }).click();
    await row.getByLabel("Go live at (London time)").fill("2020-01-01T09:00");
    await row.getByRole("button", { name: "Set time" }).click();
    await expect(appAlert(page)).toContainText("Pick a time in the future");
  });

  test("F04-E12 a time in the hour the clocks skip still schedules sensibly", async ({ page }) => {
    await board(page);
    const row = stagingList(page).filter({ hasText: ONLY_WINTER });
    await row.getByRole("button", { name: "Schedule" }).click();
    await row.getByLabel("Go live at (London time)").fill("2027-03-28T01:30"); // 01:00-02:00 doesn't exist that night
    await row.getByRole("button", { name: "Set time" }).click();
    await expect(row.getByText(/Goes live .*28 Mar, 0[12]:\d\d/)).toBeVisible();
    // the live one stays up meanwhile
    await expect(liveList(page).filter({ hasText: ONLY_WINTER })).toHaveCount(1);
    await row.getByRole("button", { name: "Remove" }).click();
  });

  test("F04-E13 keyboard only: stage and go live with Enter", async ({ page }) => {
    await board(page);
    const add = page.getByRole("button", { name: `Refresh staging copy of ${WINTER}`, exact: true }).or(page.getByRole("button", { name: `Add to staging: ${WINTER}`, exact: true }));
    await add.focus();
    await page.keyboard.press("Enter");
    const row = stagingList(page).filter({ hasText: ONLY_WINTER });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Go live now" }).focus();
    await page.keyboard.press("Enter");
    await expect(row).toHaveCount(0);
  });

  test("F04-E14 signed out mid-flow: no crash, asked to sign in", async ({ page }) => {
    await board(page);
    await page.context().clearCookies();
    await page.getByRole("button", { name: `Add to staging: ${WINTER}`, exact: true }).or(page.getByRole("button", { name: `Refresh staging copy of ${WINTER}`, exact: true })).click();
    await expect(appAlert(page).or(page.getByLabel("Work email"))).toBeVisible();
  });

  test("F04-N4 a dish that loses its allergen data never reaches guests", async ({ page, signInAs }) => {
    await page.goto("/app/products/pr-mayo");
    await ready(page);
    await page.getByLabel("I've checked these against the supplier spec").uncheck();
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText(/^Saved/)).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/s/demo/example-arms");
    // guests keep the last version where every dish had confirmed allergens
    const squid = page.getByRole("button", { name: /^Crispy squid/ });
    await expect(squid).toBeVisible();
    await expect(squid.getByText("Eggs")).toBeVisible();
    await expect(page.getByText(/Data missing|not confirmed/i)).toHaveCount(0);

    await signInAs("central");
    await page.goto("/app/products/pr-mayo");
    await ready(page);
    await page.getByLabel("I've checked these against the supplier spec").check();
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByText(/^Saved/)).toBeVisible();
  });

  test("F04-N5 a switched-off site tells guests the menu is offline", async ({ page, signInAs }) => {
    await signInAs("admin");
    await page.goto("/app/admin/brands/br-taverns");
    await ready(page);
    const site = page.getByRole("listitem").filter({ hasText: "The Harbour Inn" });
    await site.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Switched on", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Save site" }).click();
    await expect(page.getByText("Switched off")).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/s/demo/harbour-inn");
    await expect(page.getByText(/isn't online right now/)).toBeVisible();
    await expect(page.getByText("Crispy squid, lime mayo")).toHaveCount(0);
    // the other site carries on
    await page.goto("/s/demo/example-arms");
    await expect(page.getByText("Crispy squid, lime mayo")).toBeVisible();

    await signInAs("admin");
    await page.goto("/app/admin/brands/br-taverns");
    await ready(page);
    await page.getByRole("listitem").filter({ hasText: "The Harbour Inn" }).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Switched on", { exact: true }).check();
    await page.getByRole("button", { name: "Save site" }).click();
    await expect(page.getByText("Switched off")).toHaveCount(0);
  });

  test("F04-N6 a switched-off brand takes all its sites offline", async ({ page, signInAs }) => {
    await signInAs("admin");
    await page.goto("/app/admin/brands/br-taverns");
    await ready(page);
    await page.getByLabel(/^Switched on \(when off/).uncheck();
    await page.getByRole("button", { name: "Save brand" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.context().clearCookies();
    for (const s of ["example-arms", "harbour-inn"]) {
      await page.goto(`/s/demo/${s}`);
      await expect(page.getByText(/isn't online right now/)).toBeVisible();
    }
    await signInAs("admin");
    await page.goto("/app/admin/brands/br-taverns");
    await ready(page);
    await page.getByLabel(/^Switched on \(when off/).check();
    await page.getByRole("button", { name: "Save brand" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  });

  test("F04-N7 another group's address or an unknown site shows not found", async ({ page }) => {
    await page.context().clearCookies();
    for (const url of ["/s/other-group/example-arms", "/s/demo/no-such-site"]) {
      await page.goto(url);
      await expect(page.getByText(/couldn't find|not found/i).first()).toBeVisible();
      await expect(page.getByText("Crispy squid, lime mayo")).toHaveCount(0);
    }
  });

  test("F04-N8 site chefs can't reach publishing", async ({ page, signInAs }) => {
    await signInAs("site");
    await page.goto("/app/publish/br-taverns");
    await expect(page).toHaveURL(/\/c\/demo/);
    await expect(page.getByRole("button", { name: /Go live|Add to staging/ })).toHaveCount(0);
  });
});

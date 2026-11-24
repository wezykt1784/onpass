import { test, expect, ready, appAlert, noSidewaysScroll, saveRecipe } from "./fixtures";
import type { Page } from "@playwright/test";

async function board(page: Page) {
  await page.goto("/app/publish/br-taverns");
  await ready(page);
}

async function confirmChipotle(page: Page) {
  await page.goto("/app/products/pr-chipotle");
  await ready(page);
  await page.getByLabel("I've checked these against the supplier spec").check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/^Saved/)).toBeVisible();
}

test.describe("F10 publish a menu to a brand's sites", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ signInAs }) => { await signInAs("central"); });

  test("F10-E1 nothing live: the site page says so", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/s/demo/example-arms");
    await expect(page.getByRole("heading", { name: "The Example Arms" })).toBeVisible();
    await expect(page.getByText(/isn't online right now/)).toBeVisible();
  });

  test("F10-E2 a dish with unconfirmed allergens blocks going live", async ({ page, axe }) => {
    await board(page);
    await page.getByRole("button", { name: "Add to staging: Winter menu 2026", exact: true }).click();
    const block = page.getByRole("group", { name: "Must fix before going live" });
    await expect(block).toContainText("Charred corn, smoked chilli butter: allergen data not confirmed");
    await expect(page.getByRole("button", { name: "Go live now" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Schedule" })).toBeDisabled();
    await axe("S12 publish board");
  });

  test("F10-H1 fix the data, refresh, go live, guests see it at every site", async ({ page }) => {
    await confirmChipotle(page);
    await board(page);
    await page.getByRole("button", { name: "Refresh staging copy of Winter menu 2026", exact: true }).click();
    await expect(page.getByRole("group", { name: "Must fix before going live" })).toHaveCount(0);
    await page.getByRole("button", { name: "Go live now" }).click();
    const live = page.getByRole("region", { name: /What guests see now/ });
    await expect(live.getByText("Winter menu 2026")).toBeVisible();

    await page.context().clearCookies();
    for (const site of ["example-arms", "harbour-inn"]) {
      await page.goto(`/s/demo/${site}`);
      await expect(page.getByText("Charred corn, smoked chilli butter")).toBeVisible();
    }
    // a different brand's site doesn't get it
    await page.goto("/s/demo/seaview");
    await expect(page.getByText(/isn't online right now/)).toBeVisible();
  });

  test("F10-E3 held changes wait for sign-off, then reach guests", async ({ page, signInAs }) => {
    await board(page);
    const hold = page.getByLabel("Hold recipe changes until a central chef signs them off");
    await hold.click(); // saved on the server, so the tick appears when it comes back
    await expect(hold).toBeChecked();
    await expect(page.getByText("Recipe changes wait for sign-off.")).toBeVisible();

    await page.goto("/app/recipes/re-corn");
    await ready(page);
    await page.getByLabel("Name", { exact: true }).fill("Charred corn, chipotle butter");
    await saveRecipe(page);

    await page.context().clearCookies();
    await page.goto("/s/demo/example-arms");
    await expect(page.getByText("Charred corn, smoked chilli butter")).toBeVisible();

    await signInAs("central");
    await board(page);
    await expect(page.getByText("Recipes have changed since guests last saw this.")).toBeVisible();
    await page.getByRole("button", { name: "Send changes to guests" }).click();
    await expect(page.getByText("Recipes have changed since guests last saw this.")).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto("/s/demo/example-arms");
    await expect(page.getByText("Charred corn, chipotle butter")).toBeVisible();
  });

  test("F10-E4 a scheduled menu stays hidden until its time", async ({ page }) => {
    await page.goto("/app/menus/me-winter");
    await ready(page);
    await page.getByRole("button", { name: "Copy" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("me-winter"));
    await ready(page);
    // the copy keeps the brand, so it shows on the board
    await board(page);
    const copy = page.getByRole("button", { name: /^Add to staging: Winter menu 2026 \(copy\)/ }).first();
    await copy.click();
    await page.getByRole("button", { name: "Schedule" }).click();
    await page.getByLabel("Go live at (London time)").fill("2030-06-01T09:00");
    await page.getByRole("button", { name: "Set time" }).click();
    await expect(page.getByText(/Goes live .*1 Jun.*09:00/)).toBeVisible();

    await page.context().clearCookies();
    await page.goto("/s/demo/example-arms");
    await expect(page.getByRole("tab")).toHaveCount(0); // one menu only, no tabs
  });

  test("F10-E5 a head chef from another brand can't publish here", async ({ page, signInAs }) => {
    await signInAs("head");
    await page.goto("/app/publish/br-hotels");
    await ready(page);
    await expect(page.getByRole("button", { name: /Add to staging/ })).toHaveCount(0);
  });

  test("F10-E6 take offline, and the board fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await board(page);
    await noSidewaysScroll(page);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Take offline" }).first().click();
    await expect(page.getByText(/Nothing live/)).toBeVisible();
    await expect(appAlert(page)).toHaveCount(0);
  });
});

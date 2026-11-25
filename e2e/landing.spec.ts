// The public landing page at / and its early list form.
import { test, expect, noSidewaysScroll } from "./fixtures";

test.describe("LAND the landing page", () => {
  test("LAND-H1 says what it is, shows real screens, fits a phone, passes axe", async ({ page, axe }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/^Onpass: recipes, spec books and allergen menus in one place$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your recipes, spec books and allergen menus. One place, always live.");
    for (const img of await page.locator("main img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    await expect(page.getByRole("heading", { name: "Coming next" })).toBeVisible();
    await expect(page.getByText("£24", { exact: true })).toBeVisible();
    await axe("landing @1440");
    await page.setViewportSize({ width: 390, height: 844 });
    await noSidewaysScroll(page);
    await axe("landing @390");
  });

  test("LAND-H2 join the early list, then again with the same email", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Join the early list" }).click();
    await expect(page).toHaveURL(/#early-list$/);
    const form = page.getByRole("form", { name: "Join the early list" });
    await form.getByLabel("Your name").fill("Zoë Wężyk");
    await form.getByLabel("Work email").fill("zoe@harbour-group.test");
    await form.getByLabel("Company").fill("Harbour Group");
    await form.getByLabel("How many sites?").fill("12");
    await form.getByRole("button", { name: "Join the early list" }).click();
    await expect(page.getByRole("status")).toHaveText("Thanks, you're on the list. We'll be in touch.");
    await page.reload();
    await page.getByLabel("Your name").fill("Zoë W");
    await page.getByLabel("Work email").fill("ZOE@harbour-group.test");
    await page.getByLabel("Company").fill("Harbour Group");
    await page.getByLabel("How many sites?").fill("14");
    await page.getByRole("button", { name: "Join the early list" }).click();
    await expect(page.getByRole("status")).toContainText("on the list");
  });

  test("LAND-E1 a filled bot field saves nothing but looks fine to the bot", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Your name").fill("Bot");
    await page.getByLabel("Work email").fill("bot@spam.test");
    await page.getByLabel("Company").fill("Spam");
    await page.getByLabel("How many sites?").fill("3");
    await page.locator('input[name="website"]').fill("http://spam.test", { force: true });
    await page.getByRole("button", { name: "Join the early list" }).click();
    await expect(page.getByRole("status")).toContainText("on the list");
  });

  test("LAND-E2 the server refuses what the browser would let through", async ({ page }) => {
    await page.goto("/");
    // switch off the browser's own checks to reach the server's
    await page.locator('form[aria-label="Join the early list"]').evaluate((f: HTMLFormElement) => { f.noValidate = true; });
    await page.getByLabel("Your name").fill("Sam");
    await page.getByLabel("Work email").fill("sam@example.test");
    await page.getByLabel("Company").fill("Arms");
    await page.getByLabel("How many sites?").fill("0");
    await page.getByRole("button", { name: "Join the early list" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "how many sites" })).toBeVisible();
  });

  test("LAND-E3 sign in from the landing page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

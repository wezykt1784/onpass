// Milestone 2 specs change the demo data (they confirm allergens, publish menus), so their files start with m2- to run after f01-f08.
import { test, expect, ready } from "./fixtures";

test.describe("FLT recipe and menu filters (S08, S03)", () => {
  test.beforeEach(async ({ signInAs }) => { await signInAs("central"); });

  test("FLT-H1 recipes containing milk", async ({ page }) => {
    await page.goto("/app/recipes");
    await ready(page);
    await page.getByLabel("Contains").selectOption({ label: "Milk" });
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(/allergen=/);
    const recipe = (name: string) => page.getByRole("table").getByRole("link", { name, exact: true });
    await expect(recipe("Smoked chilli butter")).toBeVisible();
    await expect(recipe("Heritage tomato salad")).toHaveCount(0);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(recipe("Heritage tomato salad")).toBeVisible();
  });

  test("FLT-E1 missing allergen data and drafts", async ({ page }) => {
    await page.goto("/app/recipes?allergen=missing");
    await ready(page);
    // every recipe listed is flagged as missing data, and complete ones are left out
    const body = page.getByRole("table").locator("tbody tr");
    const n = await body.count();
    await expect(body.filter({ hasText: "Data missing" })).toHaveCount(n);
    await expect(page.getByRole("table").getByRole("link", { name: "Heritage tomato salad", exact: true })).toHaveCount(0);
    await page.goto("/app/recipes?status=archived");
    await ready(page);
    await expect(page.getByText("No recipes match these filters.")).toBeVisible();
    await page.getByRole("link", { name: "Clear search and filters" }).click();
    await expect(page).toHaveURL(/\/app\/recipes$/);
  });

  test("FLT-E2 menus by brand and by live state", async ({ page, axe }) => {
    await page.goto("/app/menus");
    await ready(page);
    await page.getByLabel("Brand").selectOption({ label: "Demo Hotels" });
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("No menus match these filters.")).toBeVisible();
    await page.getByLabel("Brand").selectOption({ label: "Demo Taverns" });
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("link", { name: /Winter menu 2026/ }).first()).toBeVisible();
    await axe("S04 menus list with filters");
  });

  test("FLT-E3 nonsense in the address doesn't break the list", async ({ page }) => {
    await page.goto("/app/recipes?allergen=zzz&status=bad&kind=x&q=");
    await ready(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("Status")).toHaveValue("");
    await page.goto("/app/menus?brand=nope&state=maybe");
    await ready(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("FLT-E4 search and filters keep each other, keyboard only", async ({ page }) => {
    await page.goto("/app/recipes?q=butter");
    await ready(page);
    await page.getByLabel("Contains").selectOption({ label: "Milk" });
    await page.getByRole("button", { name: "Apply" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=butter/);
    await expect(page).toHaveURL(/allergen=al-milk/);
    await expect(page.getByRole("table").getByRole("link", { name: "Smoked chilli butter", exact: true })).toBeVisible();
  });
});

import { test, expect, ready } from "./fixtures";

test.describe("F12 recipe and menu filters", () => {
  test.beforeEach(async ({ signInAs }) => { await signInAs("central"); });

  test("F12-H1 recipes containing milk", async ({ page }) => {
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

  test("F12-E1 missing allergen data and drafts", async ({ page }) => {
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

  test("F12-E2 menus by brand and by live state", async ({ page, axe }) => {
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
});

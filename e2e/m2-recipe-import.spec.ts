// Recipe import from the old spec book (the demo layer has two invented old recipes). Adds recipes, so it runs late.
import { test, expect, ready } from "./fixtures";

test.describe("IMP recipe import", () => {
  test("IMP-H1 import old recipes with checked allergens as dish notes", async ({ page, signInAs }) => {
    await signInAs("central");
    await page.goto("/app/imports");
    await ready(page);
    await expect(page.getByRole("heading", { name: "Import recipes" })).toBeVisible();
    await expect(page.getByText(/2 dishes and 3 batch recipes/)).toBeVisible();
    await expect(page.getByText(/1 dish keeps the allergens you checked/)).toBeVisible();
    await page.getByText("Preview the recipe cards (2)").click();
    await page.getByText("Beetroot cured trout", { exact: true }).first().click();
    const card = page.getByRole("article", { name: "Recipe card preview: Beetroot cured trout" });
    await expect(card).toContainText("Horseradish cream (batch recipe)");
    await expect(card).toContainText("Contains: Cereals containing gluten, Fish, Milk");
    await expect(card.getByRole("img", { name: "Beetroot cured trout" })).toBeVisible();
    await page.getByLabel("Show all").check();
    // salt must never quietly become a product with more in it
    await expect(page.getByLabel("sea salt")).toHaveValue("");
    await page.getByRole("button", { name: "Import 2 dishes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "dishes and" })).toContainText("2 dishes and 3 batch recipes saved as drafts", { timeout: 30_000 });

    await page.goto("/app/recipes?q=Beetroot+cured+trout&kind=dish");
    await ready(page);
    await page.getByRole("link", { name: "Beetroot cured trout" }).click();
    await ready(page);
    await expect(page.getByText("Allergens: Cereals containing gluten, Fish, Milk")).toBeVisible();
    await expect(page.getByLabel("Reason").first()).toHaveValue(/checked by Demo chef/);

    // running it again updates, it doesn't add twice
    await page.goto("/app/imports");
    await ready(page);
    await page.getByRole("button", { name: "Import 2 dishes" }).click();
    await expect(page.getByRole("status").filter({ hasText: "dishes and" })).toBeVisible({ timeout: 30_000 });
    await page.goto("/app/recipes?q=Whipped+feta+toast");
    await ready(page);
    await expect(page.getByRole("link", { name: "Whipped feta toast" })).toHaveCount(1);
  });

  test("IMP-N1 head chefs can't import", async ({ page, signInAs }) => {
    await signInAs("head");
    await page.goto("/app/imports");
    await expect(page.getByText("Only central chefs and admins can import recipes.")).toBeVisible();
  });
});

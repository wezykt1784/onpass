import { test, expect } from "./fixtures";

test("F08-H1 a supplier allergen change reaches the dish, the menu and guests", async ({ page, signInAs }) => {
  await signInAs("central");
  await page.goto("/app/products/pr-mayo");
  await page.getByLabel("Celery").selectOption("contains");
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Saved. Recipes using it are updated.")).toBeVisible();

  // Mayo -> Lime and garlic mayo (batch) -> Crispy squid (dish)
  await page.goto("/app/recipes/re-squid");
  await expect(page.getByText(/Allergens: .*Celery/)).toBeVisible();
  await page.goto("/app/menus/me-winter");
  await expect(page.getByRole("region", { name: "Small plates" }).getByText(/Celery/).first()).toBeVisible();
  await page.context().clearCookies();
  await page.goto("/m/demo/me-winter");
  await expect(page.getByRole("button", { name: /^Crispy squid/ }).getByText("Celery")).toBeVisible();
});

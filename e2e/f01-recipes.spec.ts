import { test, expect, appAlert, ready, newRecipe, addLine, saveRecipe, noSidewaysScroll } from "./fixtures";

test.beforeEach(async ({ signInAs }) => signInAs("central"));

test.describe("F01 chef builds a batch recipe and the dish that uses it", () => {
  test("F01-H1 allergens roll up through the batch", async ({ page, axe }) => {
    await newRecipe(page, "batch", "Test chipotle mayo");
    await page.getByLabel("Batch weight").fill("1000");
    await addLine(page, 1, "mayonnaise", "950");
    await addLine(page, 2, "paprika", "20");
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Step 1", { exact: true }).fill("WHISK together. Label and date.");
    await saveRecipe(page);
    await expect(page.getByText("Allergens: Eggs, Mustard")).toBeVisible();
    await axe("S07 recipe editor (batch)");

    await newRecipe(page, "dish", "Test fries, chipotle mayo");
    await addLine(page, 1, "Test chipotle", "30");
    await addLine(page, 2, "cheddar", "20");
    await saveRecipe(page);
    await expect(page.getByText("Allergens: Eggs, Milk, Mustard")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open batch recipe" })).toBeVisible();
  });

  test("F01-H2 quick-add a product from the recipe", async ({ page }) => {
    await newRecipe(page, "dish", "Test quick add");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("combobox", { name: "Ingredient 1", exact: true }).fill("Smoked almonds 1kg");
    await page.getByRole("option", { name: /Add "Smoked almonds 1kg" as a new product/ }).click();
    const dlg = page.getByRole("dialog", { name: "New product" });
    await dlg.getByLabel("Tree nuts").selectOption("contains");
    await dlg.getByLabel("Almonds").selectOption("contains");
    await dlg.getByLabel("I've checked these against the supplier spec").check();
    await dlg.getByRole("button", { name: "Save product" }).click();
    await expect(dlg).toBeHidden();
    await page.getByLabel("Quantity for ingredient 1", { exact: true }).fill("15");
    await saveRecipe(page);
    await expect(page.getByText("Allergens: Tree nuts (almonds)")).toBeVisible();
  });

  test("F01-E1 recipe with no name isn't created", async ({ page }) => {
    await page.goto("/app/recipes");
    await page.getByRole("button", { name: "New recipe" }).click();
    const dlg = page.getByRole("dialog", { name: "New recipe" });
    await dlg.getByRole("button", { name: "Create" }).click();
    expect(await dlg.getByLabel("Name", { exact: true }).evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await dlg.getByLabel("Name", { exact: true }).fill("   ");
    await dlg.getByRole("button", { name: "Create" }).click();
    await expect(dlg.getByRole("alert")).toContainText("Give the recipe a name");
  });

  test("F01-E2 a 120-character name fits on a phone", async ({ page }) => {
    const long = "Slow-roasted heritage carrot, whipped feta, dukkah, hot honey dressing and charred spring onion with a little extra on top!".slice(0, 120);
    await newRecipe(page, "dish", long);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(long);
    await noSidewaysScroll(page);
  });

  test("F01-E3 accents and emoji are kept exactly", async ({ page }) => {
    const name = "Crème brûlée, jalapeño & ñoquis 🍮";
    await newRecipe(page, "dish", name);
    await page.getByRole("button", { name: "Add step" }).click();
    await page.getByLabel("Step 1", { exact: true }).fill("Torch until crisp — façon Paul 🔥");
    await saveRecipe(page);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.getByLabel("Step 1", { exact: true })).toHaveValue("Torch until crisp — façon Paul 🔥");
  });

  test("F01-E4 double click on Save saves once, no false conflict", async ({ page }) => {
    await page.goto("/app/recipes/re-tomato");
    await page.getByLabel("Menu description").fill("Pickled shallot, basil oil, sea salt");
    await page.getByRole("button", { name: "Save recipe" }).dblclick();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await expect(appAlert(page)).toHaveCount(0);
  });

  test("F01-E5 two tabs: the second save is stopped and told who saved", async ({ page, context }) => {
    const other = await context.newPage();
    await page.goto("/app/recipes/re-burger");
    await other.goto("/app/recipes/re-burger");
    await page.getByLabel("Menu description").fill("Tab A version");
    await saveRecipe(page);
    await other.getByLabel("Menu description").fill("Tab B version");
    await other.getByRole("button", { name: "Save recipe" }).click();
    await expect(appAlert(other)).toContainText("saved this recipe while you were editing");
    await page.reload();
    await expect(page.getByLabel("Menu description")).toHaveValue("Tab A version");
    await other.close();
  });

  test("F01-E6 leaving with unsaved changes asks first", async ({ page }) => {
    await page.goto("/app/recipes/re-corn");
    await page.getByLabel("Name", { exact: true }).fill("Changed but not saved");
    let asked = false;
    page.on("dialog", async (d) => { asked = d.type() === "beforeunload"; await d.dismiss(); });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => asked).toBe(true);
  });

  test("F01-E7 changes survive a refresh", async ({ page }) => {
    await page.goto("/app/recipes/re-squid");
    await page.getByLabel("Recipe code").fill("SP-0117B");
    await saveRecipe(page);
    await page.reload();
    await expect(page.getByLabel("Recipe code")).toHaveValue("SP-0117B");
  });

  test("F01-E8 an ingredient with no quantity is refused, not dropped", async ({ page }) => {
    await newRecipe(page, "dish", "Test no quantity");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("combobox", { name: "Ingredient 1", exact: true }).fill("lime");
    await page.getByRole("listbox").getByRole("option").first().click();
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(appAlert(page)).toContainText("Enter a quantity for ingredient 1");
  });

  test("F01-E9 a recipe loop is refused", async ({ page }) => {
    await newRecipe(page, "batch", "Test loop batch");
    await page.getByLabel("Batch weight").fill("500");
    await addLine(page, 1, "Smoked chilli butter", "100");
    await saveRecipe(page);
    await page.goto("/app/recipes/re-chilli-butter");
    await addLine(page, 6, "Test loop batch", "10");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(appAlert(page)).toContainText("already uses Smoked chilli butter");
  });

  test("F01-E10 wrong unit for a product bought by the each warns", async ({ page }) => {
    await newRecipe(page, "dish", "Test unit warning");
    await addLine(page, 1, "LIME (1/60", "20", "ml");
    await expect(page.getByText("Bought by the each")).toBeVisible();
  });

  test("F01-E11 keyboard only: new recipe and first ingredient", async ({ page }) => {
    await page.goto("/app/recipes");
    await ready(page);
    await page.getByRole("button", { name: "New recipe" }).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Test keyboard dish");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/app\/recipes\/re-/);
    await page.getByRole("button", { name: "Add ingredient" }).focus();
    await page.keyboard.press("Enter");
    // Focus should land in the new ingredient box, ready to type.
    await page.keyboard.type("cheddar");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("combobox", { name: "Ingredient 1", exact: true })).toHaveValue("CHEDDAR SLICES 1KG");
    await page.keyboard.press("Tab");
    await page.keyboard.type("25");
    await expect(page.getByLabel("Quantity for ingredient 1", { exact: true })).toHaveValue("25");
  });

  test("F01-N1 duplicate recipe code is refused", async ({ page }) => {
    await newRecipe(page, "dish", "Test duplicate code");
    await page.getByLabel("Recipe code").fill("SP-0142");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(appAlert(page)).toContainText("already used");
  });

  test("F01-N2 a batch in use can't be archived", async ({ page }) => {
    await page.goto("/app/recipes/re-dredge");
    await page.getByLabel("Status").selectOption("archived");
    await page.getByRole("button", { name: "Save recipe" }).click();
    await expect(appAlert(page)).toContainText("Crispy squid");
  });

  test("F01-N3 a recipe that doesn't exist shows not found", async ({ page }) => {
    await page.goto("/app/recipes/does-not-exist");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.locator('head meta[name="robots"][content="noindex"]')).toHaveCount(1);
    // The HTTP status is 200, not 404, because the page streams: BUG-003 (S4).
  });

  test("F01-N4 product without a name is refused", async ({ page, axe }) => {
    await page.goto("/app/products/new");
    await axe("S09 product editor");
    await page.getByRole("button", { name: "Save product" }).click();
    await expect(appAlert(page)).toContainText("Give the product a name");
  });
});

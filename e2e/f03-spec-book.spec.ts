import { test, expect, pdfText, newRecipe } from "./fixtures";

test.beforeEach(async ({ signInAs }) => signInAs("central"));

test.describe("F03 generate the PDF spec book", () => {
  test("F03-H1 download has cover, sections, dishes, batches, date and page numbers", async ({ page, axe }) => {
    await page.goto("/app/menus/me-winter/spec-book");
    await axe("S13 spec book");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF" }).click()]);
    expect(dl.suggestedFilename()).toBe("Winter menu 2026.pdf");
    const fs = await import("node:fs");
    const text = pdfText(fs.readFileSync((await dl.path())!));
    for (const s of ["Winter menu 2026", "24/11/2026", "Small plates", "Mains", "Crispy squid, lime mayo", "Batch recipes", "Squid dredge", "Lime and garlic mayo", "Page 1 of"])
      expect(text, `PDF contains "${s}"`).toContain(s);
  });

  test("F03-E1 an empty menu doesn't offer a download", async ({ page }) => {
    await page.goto("/app/menus");
    await page.getByRole("button", { name: "New menu" }).click();
    await page.getByLabel("Menu name").fill("Test empty book");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/app\/menus\/me-/);
    await page.getByRole("link", { name: "Spec book", exact: true }).click();
    await expect(page.getByText("This menu has no dishes yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
  });

  test("F03-E2 accents print correctly", async ({ page }) => {
    // A new dish with accents on a new menu, then read it back out of the PDF.
    await newRecipe(page, "dish", "Tomates anciennes, crème fraîche");
    await page.goto("/app/menus");
    await page.getByRole("button", { name: "New menu" }).click();
    await page.getByLabel("Menu name").fill("Test accents");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/app\/menus\/me-/);
    const menuId = page.url().split("/").pop();
    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByLabel("Section name").fill("Entrées");
    await page.getByRole("combobox", { name: "Add a dish to Entrées" }).fill("Tomates");
    await page.getByRole("listbox").getByRole("option").first().click();
    await page.getByRole("button", { name: "Save menu" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    const res = await page.request.get(`/api/spec-book/${menuId}`);
    expect(res.status()).toBe(200);
    const text = pdfText(await res.body());
    expect(text).toContain("Tomates anciennes, crème fraîche");
    expect(text).toContain("Entrées");
  });

  test("F03-E3 a dish with unconfirmed allergens prints the missing-data bar", async ({ page }) => {
    const res = await page.request.get("/api/spec-book/me-winter");
    const text = pdfText(await res.body());
    expect(text).toContain("Allergen data missing for: CHIPOTLE PASTE 1KG");
  });
});

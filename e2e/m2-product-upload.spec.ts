// Product upload from CSV. Runs after f01-f08 because it adds products to the demo data.
import { test, expect, ready } from "./fixtures";

const csv = (lines: string[]) => ({ name: "price-list.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n")) });

test.describe("PUP product upload (S09)", () => {
  test.beforeEach(async ({ signInAs }) => { await signInAs("central"); });

  test("PUP-H1 upload a price list: preview, then add and update", async ({ page }) => {
    await page.goto("/app/products");
    await ready(page);
    await page.getByRole("link", { name: "Upload products" }).click();
    await expect(page.getByRole("heading", { name: "Upload products" })).toBeVisible();
    await page.locator("#upload-file").setInputFiles(csv([
      "Our ref,Description,Supplier,Code,Pack size,Price,Allergens,May contain",
      "x1,Test smoked paprika,Spice Co,SP-1,500g,6.40,none,Mustard",
      "x2,Test oat milk,Spice Co,SP-2,1l,1.95,Oats,",
      "x3,Broken row,Spice Co,SP-3,lots,abc,Shellfish,",
      "x4,Test smoked paprika,Spice Co,SP-1,1kg,11.00,none,Mustard",
    ]));
    await expect(page.locator("p", { hasText: "Columns read:" })).toContainText("Product name");
    await expect(page.locator("p", { hasText: "Ignored:" })).toContainText("Our ref");
    const row = (n: number) => page.getByRole("row").filter({ has: page.getByRole("cell", { name: String(n), exact: true }) });
    await expect(row(4).getByText("Skipped")).toBeVisible();
    await expect(row(4)).toContainText("isn't a number");
    await expect(row(4)).toContainText('"Shellfish" isn\'t an allergen we know');
    await expect(row(5)).toContainText("Same product as an earlier row");
    await expect(row(3)).toContainText("1000 ml");
    await expect(row(3)).toContainText("Oats");

    await page.getByRole("button", { name: "Upload 3 products" }).click();
    await expect(page.getByRole("status").filter({ hasText: "added" })).toContainText("2 added and 1 updated");

    // unticked confirmation: allergens saved but not confirmed
    await page.goto("/app/products?q=Test+smoked+paprika");
    await ready(page);
    const prod = page.getByRole("row", { name: /Test smoked paprika/ });
    await expect(prod).toContainText("Not confirmed");
    await expect(prod).toContainText("1000 g");
    await expect(prod).toContainText("£11.00");
  });

  test("PUP-E1 a file with no product name column is refused clearly", async ({ page }) => {
    await page.goto("/app/products/upload");
    await ready(page);
    await page.locator("#upload-file").setInputFiles(csv(["Code,Price", "A1,2.00"]));
    await expect(page.getByRole("alert").filter({ hasText: "heading row with a product name column" })).toBeVisible();
  });

  test("PUP-E2 site chefs can't reach the upload page", async ({ page, signInAs }) => {
    await signInAs("site");
    await page.goto("/app/products/upload");
    await expect(page).not.toHaveURL(/\/app\/products\/upload/);
  });
});

test("PUP-H2 an Excel price list with a title row above the headings", async ({ page, signInAs }) => {
  await signInAs("central");
  await page.goto("/app/products/upload");
  await ready(page);
  await page.locator("#upload-file").setInputFiles("e2e/fixtures-price-list.xlsx");
  await expect(page.locator("p", { hasText: "new," })).toContainText("2 new");
  await expect(page.getByRole("row", { name: /Test xl mature cheddar/ })).toContainText("5000 g");
  await expect(page.getByRole("row", { name: /Test xl lemons/ })).toContainText("24 ea");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Upload 2 products" }).click();
  await expect(page.getByRole("status").filter({ hasText: "added" })).toContainText("2 added and 0 updated");
  await page.goto("/app/products?q=Test+xl+mature");
  await ready(page);
  const prod = page.getByRole("row", { name: /Test xl mature cheddar/ });
  await expect(prod).toContainText("Milk");
  await expect(prod).not.toContainText("Not confirmed");
});

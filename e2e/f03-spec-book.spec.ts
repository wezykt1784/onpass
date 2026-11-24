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

  test("F03-E4 nothing prints within 10 mm of the paper edge (office printers clip it)", async ({ page }) => {
    const res = await page.request.get("/api/spec-book/me-winter");
    const { execFileSync } = await import("node:child_process");
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-pdf-"));
    fs.writeFileSync(path.join(dir, "b.pdf"), await res.body());
    // 72 dpi: 1 px = 1 pt; 10 mm = 28 pt. Render pages 1-4 as greyscale PGM and look at the border strip.
    execFileSync("pdftoppm", ["-r", "72", "-gray", "-f", "1", "-l", "4", path.join(dir, "b.pdf"), path.join(dir, "p")]);
    const margin = 27;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".pgm")).sort()) {
      const buf = fs.readFileSync(path.join(dir, f));
      const header = buf.toString("latin1", 0, 40).split(/\s+/);
      const [w, h] = [Number(header[1]), Number(header[2])];
      const data = buf.subarray(buf.length - w * h);
      let ink = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const inBorder = x < margin || x >= w - margin || y < margin || y >= h - margin;
        if (inBorder && data[y * w + x] < 230) ink++;
      }
      expect(ink, `${f}: dark pixels in the 10 mm border`).toBe(0);
    }
  });
});

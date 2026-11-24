import { test, expect, ready, appAlert, noSidewaysScroll } from "./fixtures";

test.describe("F09 admin sets up brands and sites", () => {
  test.beforeEach(async ({ signInAs }) => { await signInAs("admin"); });

  test("F09-H1 create a brand, add a site, get its QR code", async ({ page, axe }) => {
    await page.goto("/app/admin/brands");
    await ready(page);
    await expect(page.getByRole("link", { name: /Demo Taverns/ })).toBeVisible();
    await page.getByRole("link", { name: "New brand" }).click();
    await ready(page);
    await page.getByLabel("Brand name").fill("Riverside Kitchens");
    await expect(page.getByLabel("Web name")).toHaveValue("riverside-kitchens");
    await page.getByRole("button", { name: "Create brand" }).click();
    await page.waitForURL(/\/app\/admin\/brands\/(?!new)/);
    await ready(page);

    // a brand with no sites opens straight onto the site form
    await expect(page.getByRole("button", { name: "Add a site" })).toHaveCount(0);
    await page.getByLabel("Site name").fill("The Riverside, Putney");
    await page.getByLabel("Address").fill("9 Embankment, London");
    await page.getByRole("button", { name: /^(Add|Save) site$/ }).click();
    await expect(page.getByRole("img", { name: "QR code for The Riverside, Putney's guest menu" })).toBeVisible();
    await expect(page.getByText("/s/demo/the-riverside-putney")).toBeVisible();
    await axe("S16 brand and sites");

    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: /PNG/ }).first().click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.png$/);
  });

  test("F09-E1 two brands can't share a web name", async ({ page }) => {
    await page.goto("/app/admin/brands/new");
    await ready(page);
    await page.getByLabel("Brand name").fill("Demo Taverns copy");
    await page.getByLabel("Web name").fill("demo-taverns");
    await page.getByRole("button", { name: "Create brand" }).click();
    await expect(appAlert(page)).toContainText(/already/i);
  });

  test("F09-E2 head chefs can't open brand settings", async ({ page, signInAs }) => {
    await signInAs("head");
    await page.goto("/app/admin/brands");
    await expect(page.getByText(/Only your group's admins can change this/).first()).toBeVisible();
  });

  test("F09-H2 a brand logo goes on the spec book cover and the guest page", async ({ page }) => {
    const images = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
    const before = images(await (await page.request.get("/api/spec-book/me-winter")).body());

    await page.goto("/app/admin/brands/br-taverns");
    await ready(page);
    // a 2x2 red PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Choose a logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("img", { name: "Demo Taverns logo" })).toBeVisible();

    const after = images(await (await page.request.get("/api/spec-book/me-winter")).body());
    expect(after).toBe(before + 1);

    await page.context().clearCookies();
    await page.goto("/s/demo/example-arms");
    await expect(page.getByRole("img", { name: "Demo Taverns" })).toBeVisible();
  });

  test("F09-E3 brand page fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/admin/brands/br-taverns");
    await ready(page);
    await noSidewaysScroll(page);
  });
});

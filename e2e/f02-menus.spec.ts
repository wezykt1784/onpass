import { test, expect, appAlert, ready, noSidewaysScroll } from "./fixtures";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ signInAs }) => signInAs("central"));

async function newMenu(page: Page, name: string) {
  await page.goto("/app/menus");
  await page.getByRole("button", { name: "New menu" }).click();
  await page.getByLabel("Menu name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/app\/menus\/me-/);
}

async function addDish(page: Page, section: string, search: string) {
  const cb = page.getByRole("combobox", { name: `Add a dish to ${section}` });
  await cb.fill(search);
  await page.getByRole("listbox").getByRole("option").first().click();
}

async function saveMenu(page: Page) {
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
}

test.describe("F02 central chef builds a menu", () => {
  test("F02-H1 build, save, and see it on the guest preview", async ({ page, axe }) => {
    await newMenu(page, "Test sharing menu");
    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByLabel("Section name").fill("Sharing");
    await addDish(page, "Sharing", "squid");
    await addDish(page, "Sharing", "tomato");
    await saveMenu(page);
    await axe("S05 content builder");
    const id = page.url().split("/").pop();
    await page.goto(`/m/demo/${id}`);
    await expect(page.getByRole("heading", { name: "Sharing", exact: true })).toBeVisible();
    await expect(page.getByText("Crispy squid, lime mayo")).toBeVisible();
    await expect(page.getByText("Heritage tomato salad")).toBeVisible();
  });

  test("F02-E1 a section without a name is refused", async ({ page }) => {
    await newMenu(page, "Test unnamed section");
    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByRole("button", { name: "Save menu" }).click();
    await expect(appAlert(page)).toContainText("Every section needs a name");
  });

  test("F02-E2 a new order is kept after saving and reloading", async ({ page }) => {
    await newMenu(page, "Test order");
    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByLabel("Section name").fill("Mains");
    await addDish(page, "Mains", "burger");
    await addDish(page, "Mains", "squid");
    await page.getByRole("button", { name: "Move down" }).first().click();
    await saveMenu(page);
    await page.reload();
    await ready(page);
    const names = await page.getByRole("region", { name: "Mains" }).getByRole("link").allInnerTexts();
    expect(names).toEqual(["Crispy squid, lime mayo", "Double smash burger"]);
  });

  test("F02-E3 copy makes an independent menu", async ({ page }) => {
    await page.goto("/app/menus/me-winter");
    await page.getByRole("button", { name: "Copy" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("me-winter"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Winter menu 2026 (copy)");
    await page.getByRole("button", { name: "Remove" }).first().click();
    await saveMenu(page);
    await page.goto("/app/menus/me-winter");
    await expect(page.getByRole("region", { name: "Small plates" }).getByRole("link")).toHaveCount(3);
  });

  test("F02-E4 two menus can't share a code", async ({ page }) => {
    await newMenu(page, "Test code clash");
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Menu code").fill("WM26");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(appAlert(page)).toContainText("already used");
  });

  test("F02-E5 deleting a section with dishes asks first", async ({ page }) => {
    await page.goto("/app/menus/me-winter");
    let asked = "";
    page.once("dialog", async (d) => { asked = d.message(); await d.dismiss(); });
    await page.getByRole("button", { name: "Delete section Mains" }).click();
    expect(asked).toContain("Mains");
    await expect(page.getByRole("region", { name: "Mains" })).toBeVisible();
  });

  test("F02-E6 the builder fits on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/menus/me-winter");
    await expect(page.getByRole("region", { name: "Small plates" })).toBeVisible();
    await noSidewaysScroll(page);
  });
});

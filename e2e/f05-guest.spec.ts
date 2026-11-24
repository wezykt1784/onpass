import { test, expect, ready } from "./fixtures";
import type { Page } from "@playwright/test";

// Demo data says "Sesame", the live database "Sesame seeds".
const SESAME = "Sesame";
const DISHES = ["Charred corn, smoked chilli butter", "Crispy squid, lime mayo", "Heritage tomato salad", "Double smash burger"];

async function filter(page: Page, avoid: string[], opts: { diets?: string[]; strict?: boolean } = {}) {
  await page.getByRole("button", { name: /Filter for allergies|Filters on/ }).click();
  const dlg = page.getByRole("dialog", { name: "Filter the menu" });
  for (const a of avoid) await dlg.getByLabel(a, { exact: a !== SESAME }).first().check();
  for (const d of opts.diets ?? []) await dlg.getByLabel(d, { exact: true }).check();
  if (opts.strict) await dlg.getByLabel("Also hide dishes that may contain traces").check();
  await dlg.getByRole("button", { name: /^Show \d+ dishes$/ }).click();
  await expect(dlg).toBeHidden();
}

async function shown(page: Page) {
  const out: string[] = [];
  for (const d of DISHES) if (await page.getByRole("button", { name: new RegExp(`^${d}`) }).count()) out.push(d);
  return out;
}

test.describe("F05 guest checks what they can eat (signed out)", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/m/demo/me-winter"); await ready(page); });

  test("F05-H1 milk filter hides dishes with milk", async ({ page, axe }) => {
    await axe("S20 guest menu");
    await filter(page, ["Milk"]);
    expect(await shown(page)).toEqual(["Crispy squid, lime mayo", "Heritage tomato salad"]);
    await expect(page.getByText("2 of 4 dishes")).toBeVisible();
  });

  test("F05-E1 a dish with missing data is hidden once any filter is on", async ({ page }) => {
    expect(await shown(page)).toContain("Charred corn, smoked chilli butter");
    await filter(page, ["Lupin"]);
    expect(await shown(page)).not.toContain("Charred corn, smoked chilli butter");
  });

  test("F05-E2 may-contain dishes hide only when asked", async ({ page }) => {
    await filter(page, [SESAME]);
    expect(await shown(page)).toContain("Double smash burger");
    await filter(page, [], { strict: true });
    expect(await shown(page)).not.toContain("Double smash burger");
  });

  test("F05-E3 vegan shows only vegan dishes", async ({ page }) => {
    await filter(page, [], { diets: ["Vegan"] });
    expect(await shown(page)).toEqual(["Heritage tomato salad"]);
  });

  test("F05-E4 when nothing fits, the guest is told to ask", async ({ page }) => {
    await filter(page, ["Cereals containing gluten", "Milk", "Sulphur dioxide / sulphites", "Garlic / onion"]);
    expect(await shown(page)).toEqual([]);
    await expect(page.getByText("Nothing on this menu fits all your filters")).toBeVisible();
  });

  test("F05-E5 wheat counts as gluten", async ({ page }) => {
    await filter(page, ["Cereals containing gluten"]);
    const s = await shown(page);
    expect(s).not.toContain("Crispy squid, lime mayo");
    expect(s).not.toContain("Double smash burger");
  });

  test("F05-E6 keyboard opens the filter, Esc closes it and focus returns", async ({ page, axe }) => {
    const btn = page.getByRole("button", { name: "Filter for allergies" });
    await btn.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Filter the menu" })).toBeVisible();
    await axe("S20 filter dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(btn).toBeFocused();
  });

  test("F05-H2 dish detail shows full allergens", async ({ page, axe }) => {
    await page.getByRole("button", { name: /^Crispy squid/ }).click();
    const dlg = page.getByRole("dialog", { name: "Crispy squid, lime mayo" });
    await expect(dlg.getByText(/Allergens: Cereals containing gluten \(wheat\)/)).toBeVisible();
    await expect(dlg.getByText("May contain: Fish")).toBeVisible();
    await axe("S21 dish detail");
  });

  test("F05-E8 closing dish detail returns focus to the dish", async ({ page }) => {
    const dish = page.getByRole("button", { name: /^Crispy squid/ });
    await dish.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Crispy squid, lime mayo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dish).toBeFocused();
  });

  test("F05-N1 wrong addresses show not found", async ({ page }) => {
    for (const url of ["/m/nope/me-winter", "/m/demo/no-such-menu"]) {
      await page.goto(url);
      await expect(page.getByText("This page could not be found.")).toBeVisible();
    }
  });

  test("F05-E7 guest menu fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});

// Milestone 2 specs change the demo data, so their files start with m2- to run after f01-f08.
// Build-your-own groups (S05 builder, S20 guest page, S24 spec book, S26 cookbook).
import { test, expect, appAlert, ready, noSidewaysScroll, pdfText } from "./fixtures";
import type { Page } from "@playwright/test";

const GROUP = "Build your burger";
let menuUrl = "";

async function saveMenu(page: Page) {
  await page.getByRole("button", { name: "Save menu" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
}
async function addOption(page: Page, search: string) {
  await page.getByRole("combobox", { name: `Add an option to ${GROUP}` }).fill(search);
  await page.getByRole("listbox").getByRole("option").first().click();
}
const options = (page: Page) => page.getByRole("list", { name: `Options in ${GROUP}` }).getByRole("listitem");

test.describe("F02 build-your-own groups", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ signInAs }) => { await signInAs("central"); });

  test("F02-H3 add a group with options, reorder by keyboard, save", async ({ page, axe }) => {
    await page.goto("/app/menus");
    await page.getByRole("button", { name: "New menu" }).click();
    await page.getByLabel("Menu name").fill("Burger night");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForURL(/\/app\/menus\/me-/);
    menuUrl = new URL(page.url()).pathname;
    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByLabel("Section name").fill("Burgers");
    await page.getByRole("button", { name: "Add build-your-own" }).click();
    // the new group's name box has the focus, so a chef can type straight away
    await expect(page.getByLabel("Group name")).toBeFocused();
    await page.keyboard.type(GROUP);
    await page.getByLabel("What guests choose").fill("Pick your burger, every one comes with fries");
    await addOption(page, "tomato");
    await addOption(page, "double smash");
    await expect(options(page)).toHaveCount(2);
    await expect(page.getByText("2 of 250 dishes")).toBeVisible();

    // keyboard only: move the burger above the salad
    await page.getByRole("button", { name: "Move Double smash burger up" }).focus();
    await page.keyboard.press("Enter");
    await expect(options(page).first()).toContainText("Double smash burger");
    // an option already in the group isn't offered again
    await page.getByRole("combobox", { name: `Add an option to ${GROUP}` }).fill("double smash");
    await expect(page.getByRole("listbox").getByRole("option", { name: /Double smash burger/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await saveMenu(page);
    await axe("S05 builder with a build-your-own group");
    await page.reload();
    await ready(page);
    await expect(page.getByLabel("Group name")).toHaveValue(GROUP);
    await expect(options(page).first()).toContainText("Double smash burger");
    await expect(options(page)).toHaveCount(2);
  });

  test("F02-E5 a group needs a name and at least one option", async ({ page }) => {
    await page.goto(menuUrl);
    await ready(page);
    await page.getByLabel("Group name").fill("");
    await page.getByRole("button", { name: "Save menu" }).click();
    await expect(appAlert(page)).toContainText('Give the build-your-own group in "Burgers" a name');
    await page.getByLabel("Group name").fill("Sauces");
    for (const n of ["Double smash burger", "Heritage tomato salad"])
      await page.getByRole("button", { name: `Remove ${n} from Sauces` }).click();
    await expect(page.getByText("No options yet.")).toBeVisible();
    await page.getByRole("button", { name: "Save menu" }).click();
    await expect(appAlert(page)).toContainText('"Sauces" needs at least one option');
    // nothing was lost: the saved group is still there after a reload
    await page.reload();
    await ready(page);
    await expect(page.getByLabel("Group name")).toHaveValue(GROUP);
  });

  test("F02-E6 the builder with a group fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(menuUrl);
    await ready(page);
    await expect(options(page)).toHaveCount(2);
    await noSidewaysScroll(page);
  });

  test("F05-H3 guests see the group, and filters hide options that don't fit", async ({ page, axe }) => {
    const id = menuUrl.split("/").pop();
    await page.context().clearCookies();
    await page.goto(`/m/demo/${id}`);
    const group = page.getByRole("group", { name: GROUP });
    await expect(group.getByText("Pick your burger, every one comes with fries")).toBeVisible();
    await expect(group.getByRole("button", { name: /^Double smash burger/ })).toBeVisible();
    await expect(group.getByRole("button", { name: /^Heritage tomato salad/ })).toBeVisible();
    await expect(page.getByText("2 dishes")).toBeVisible();
    await axe("S20 guest page with a build-your-own group");

    await page.getByRole("button", { name: "Filter for allergies" }).click();
    await page.getByRole("dialog").getByLabel(/^Cereals containing gluten$/).check();
    await page.getByRole("button", { name: /^Show \d+ dishes$/ }).click();
    await expect(group.getByRole("button", { name: /^Double smash burger/ })).toHaveCount(0);
    await expect(group.getByText("1 more option is hidden by your filters.")).toBeVisible();
    await expect(page.getByText("1 of 2 dishes")).toBeVisible();

    // opening an option shows its own allergens
    await group.getByRole("button", { name: /^Heritage tomato salad/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Heritage tomato salad");
  });

  test("F03-H2 each option gets its own spec page under the group's name", async ({ page }) => {
    const id = menuUrl.split("/").pop();
    const res = await page.request.get(`/api/spec-book/${id}`);
    expect(res.status()).toBe(200);
    const text = pdfText(await res.body()).replace(/\s+/g, " ");
    expect(text).toContain(`Burgers // ${GROUP}: Double smash burger`);
    expect(text).toContain(`Burgers // ${GROUP}: Heritage tomato salad`);
  });

  test("F06-H2 site chefs see the group and open an option's spec", async ({ page, signInAs }) => {
    const id = menuUrl.split("/").pop();
    await signInAs("site");
    await page.goto(`/c/demo/${id}`);
    await expect(page.getByText(`${GROUP} · 2 options`)).toBeVisible();
    await page.getByRole("link", { name: /Heritage tomato salad/ }).click();
    await expect(page.getByRole("heading", { name: "Heritage tomato salad" })).toBeVisible();
  });
});

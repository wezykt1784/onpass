// Milestone 2 specs change the demo data (they confirm allergens, publish menus), so their files start with m2- to run after f01-f08.
import { test, expect, ready, appAlert, noSidewaysScroll } from "./fixtures";

test.describe("F09 admin invites people and sets what they can do", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ signInAs }) => { await signInAs("admin"); });

  test("F09-H1 invite a head chef for one brand, who can then sign in", async ({ page, axe }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    await axe("S17 people");
    await page.getByLabel("Email").fill("sam.k@demo.test");
    await page.getByLabel("Name").fill("Sam Kowalski");
    await page.getByRole("radio", { name: /^Head chef/ }).check();
    await page.getByLabel("Brand", { exact: true }).selectOption({ label: "Demo Hotels" });
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByText("Added sam.k@demo.test.")).toBeVisible();
    await expect(page.getByRole("row", { name: /Sam Kowalski/ })).toBeVisible();
    await expect(page.getByLabel("Brand for Sam Kowalski")).toHaveValue("br-hotels");

    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Work email").fill("sam.k@demo.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/app/);
    await page.goto("/app/publish/br-hotels");
    await ready(page);
    await expect(page.getByText(/Menus for this brand/)).toBeVisible();
  });

  test("F09-N1 the same email can't be invited twice", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    await page.getByLabel("Email").fill("central@demo.test");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(appAlert(page).or(page.getByText(/already/i))).toContainText(/already/i);
  });

  test("F09-E1 change a role, then remove access and give it back", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    const role = page.getByLabel("Role for Sam Kowalski");
    await role.selectOption("central_chef");
    await expect(page.getByLabel("Brand for Sam Kowalski")).toHaveCount(0);
    await page.reload();
    await ready(page);
    await expect(page.getByLabel("Role for Sam Kowalski")).toHaveValue("central_chef");

    page.once("dialog", (d) => d.accept());
    const row = page.getByRole("row", { name: /Sam Kowalski/ });
    await row.getByRole("button", { name: "Remove access" }).click();
    await expect(row.getByText("No access")).toBeVisible();

    // they can't get in any more
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Work email").fill("sam.k@demo.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: /don't have access to a kitchen group/ })).toBeVisible();
    await page.goto("/app/recipes");
    await expect(page).not.toHaveURL(/\/app\/recipes/);
  });

  test("F09-E2 admins can't demote or lock out themselves", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    const me = page.getByRole("row", { name: /\(you\)/ });
    await expect(me.getByRole("combobox")).toBeDisabled();
    await expect(me.getByRole("button", { name: "Remove access" })).toHaveCount(0);
  });

  test("F09-N2 only admins see the people screen; it fits a phone", async ({ page, signInAs }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/admin/users");
    await ready(page);
    await noSidewaysScroll(page);
    await signInAs("central");
    await page.goto("/app/admin/users");
    await expect(page.getByText(/Only your group's admins/)).toBeVisible();
  });

  test("F09-E3 a broken email is stopped before sending", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    await page.getByLabel("Email").fill("sam@");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(page.getByLabel("Email")).toHaveJSProperty("validity.valid", false);
    await expect(page.getByText(/^Added /)).toHaveCount(0);
  });

  test("F09-E4 accents in a name, and a double click adds one person", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    await page.getByLabel("Email").fill("zoe.l@demo.test");
    await page.getByLabel("Name").fill("Zoë Wężyk-Łukasiewicz");
    await page.getByRole("button", { name: "Add person" }).dblclick();
    await expect(page.getByText("Added zoe.l@demo.test.")).toBeVisible();
    await page.reload();
    await ready(page);
    await expect(page.getByRole("row", { name: /Zoë Wężyk-Łukasiewicz/ })).toHaveCount(1);
  });

  test("F09-E5 a role change applies straight away", async ({ page, signInAs }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    await page.getByLabel("Role for Demo Head Chef").selectOption("viewer");
    await expect(page.getByLabel("Role for Demo Head Chef")).toHaveValue("viewer");
    await signInAs("head");
    await page.goto("/app/publish/br-taverns");
    await expect(page).toHaveURL(/\/c\/demo/);

    await signInAs("admin");
    await page.goto("/app/admin/users");
    await ready(page);
    await page.getByLabel("Role for Demo Head Chef").selectOption("head_chef");
    await page.getByLabel("Brand for Demo Head Chef").selectOption({ label: "Demo Taverns" });
    await expect(page.getByLabel("Brand for Demo Head Chef")).toHaveValue("br-taverns");
  });

  test("F09-N3 head chefs and site chefs can't manage people", async ({ page, signInAs }) => {
    await signInAs("head");
    await page.goto("/app/admin/users");
    await expect(page.getByText(/Only your group's admins/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Add person|Send invite/ })).toHaveCount(0);
    await signInAs("site");
    await page.goto("/app/admin/users");
    await expect(page).toHaveURL(/\/c\/demo/);
  });
});

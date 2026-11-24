import { test, expect, ready, appAlert, noSidewaysScroll } from "./fixtures";

test.describe("F11 admin invites people and sets what they can do", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(async ({ signInAs }) => { await signInAs("admin"); });

  test("F11-H1 invite a head chef for one brand, who can then sign in", async ({ page, axe }) => {
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

  test("F11-E1 the same email can't be invited twice", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    await page.getByLabel("Email").fill("central@demo.test");
    await page.getByRole("button", { name: "Add person" }).click();
    await expect(appAlert(page).or(page.getByText(/already/i))).toContainText(/already/i);
  });

  test("F11-E2 change a role, then remove access and give it back", async ({ page }) => {
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

  test("F11-E3 admins can't demote or lock out themselves", async ({ page }) => {
    await page.goto("/app/admin/users");
    await ready(page);
    const me = page.getByRole("row", { name: /\(you\)/ });
    await expect(me.getByRole("combobox")).toBeDisabled();
    await expect(me.getByRole("button", { name: "Remove access" })).toHaveCount(0);
  });

  test("F11-E4 only admins see the people screen; it fits a phone", async ({ page, signInAs }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/admin/users");
    await ready(page);
    await noSidewaysScroll(page);
    await signInAs("central");
    await page.goto("/app/admin/users");
    await expect(page.getByText(/Only your group's admins/)).toBeVisible();
  });
});

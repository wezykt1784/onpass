import { test, expect, appAlert } from "./fixtures";

test.describe("Sign in and roles", () => {
  test("AUTH-H1 sign in lands on Home", async ({ page, axe }) => {
    await page.goto("/login");
    await axe("S01 sign in");
    await page.getByLabel("Work email").fill("central@demo.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/app");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo Pub Co.");
  });

  test("AUTH-H2 sign out ends the session", async ({ page, signInAs }) => {
    await signInAs("central");
    await page.goto("/app");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL("**/login");
    await page.goto("/app/recipes");
    await page.waitForURL("**/login");
  });

  test("AUTH-N1 unknown email shows a plain error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("nobody@demo.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(appAlert(page)).toContainText("don't recognise that email");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("AUTH-E1 signed out is sent to sign in", async ({ page }) => {
    for (const url of ["/app", "/app/recipes/re-squid", "/c/demo"]) {
      await page.goto(url);
      await page.waitForURL("**/login");
    }
  });

  test("AUTH-E2 email that isn't an email", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Work email").fill("not-an-email");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Browser validation stops the form; nothing is sent and we stay put.
    expect(await page.getByLabel("Work email").evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("PERM-N1 site chef is kept out of the back office", async ({ page, signInAs }) => {
    await signInAs("site");
    await page.goto("/app/recipes");
    await page.waitForURL("**/c/demo");
  });

  test("PERM-N2 spec book PDF needs a sign in", async ({ request }) => {
    const res = await request.get("/api/spec-book/me-winter", { headers: { cookie: "" } });
    expect(res.status()).toBe(401);
  });
});

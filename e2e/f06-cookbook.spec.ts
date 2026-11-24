import { test, expect } from "./fixtures";

test("F06-H1 site chef opens a spec and follows a batch recipe", async ({ page, signInAs, axe }) => {
  await signInAs("site");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await page.waitForURL("**/c/demo");
  await axe("S23 cookbook menus");
  await page.getByRole("link", { name: /^Winter menu 2026 \d+ dishes/ }).click();
  await page.getByRole("link", { name: /Crispy squid/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Crispy squid, lime mayo");
  await axe("S23 spec view");
  await page.getByRole("link", { name: "Squid dredge" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Squid dredge");
  await expect(page.getByText("Batch recipe · makes 1000 g")).toBeVisible();
});

// The product's own identity shows everywhere a person or a link preview can see it.
import { test, expect, pdfText } from "./fixtures";

test("BRAND-1 titles, icons, social image and PDF carry the Onpass name", async ({ page, signInAs }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/Onpass/);
  await expect(page.getByText("Every recipe, spec and allergen menu for your kitchens, in one place.")).toBeVisible();
  await page.screenshot({ path: "/home/claude/replica/clone-screens/S01-brand-1440.png" });
  for (const path of ["/icon.svg", "/apple-icon.png", "/og.png"]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
  }
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toContain("/og.png");

  await signInAs("central");
  await page.goto("/app/recipes");
  await expect(page).toHaveTitle("Recipes · Onpass");
  const pdf = await (await page.request.get("/api/spec-book/me-winter")).body();
  // pdfinfo (poppler) reads the document properties as a PDF viewer shows them
  const { execFileSync } = await import("node:child_process");
  const info = execFileSync("pdfinfo", ["-"], { input: pdf }).toString();
  expect(info).toMatch(/^Creator:\s+Onpass$/m);
  expect(pdfText(pdf)).not.toMatch(/ten ?kites/i);
});

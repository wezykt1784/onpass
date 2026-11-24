import { test, noSidewaysScroll } from "./fixtures";

// Every back-office screen once at laptop width and once at phone width: accessibility and fit.
const SCREENS: [string, string][] = [
  ["S02 home", "/app"], ["S08 recipes", "/app/recipes"], ["S08 recipes empty search", "/app/recipes?q=zzzz"],
  ["S07 recipe editor", "/app/recipes/re-burger"], ["S09 products", "/app/products"], ["S09 product", "/app/products/pr-bun"],
  ["S03 menus", "/app/menus"], ["S05 menu editor", "/app/menus/me-winter"], ["S13 spec book", "/app/menus/me-winter/spec-book"],
  ["Admin", "/app/admin"], ["Publish stub", "/app/publish"],
];

for (const width of [1440, 390]) {
  test(`A11Y every back-office screen at ${width}px`, async ({ page, signInAs, axe }) => {
    await signInAs("central");
    await page.setViewportSize({ width, height: 900 });
    for (const [label, url] of SCREENS) {
      await page.goto(url);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await axe(`${label} @${width}`);
      await noSidewaysScroll(page);
    }
  });
}

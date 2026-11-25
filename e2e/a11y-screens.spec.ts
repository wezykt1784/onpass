import { test, noSidewaysScroll } from "./fixtures";

// Every back-office screen once at laptop width and once at phone width: accessibility and fit.
const SCREENS: [string, string][] = [
  ["S02 home", "/app"], ["S08 recipes", "/app/recipes"], ["S08 recipes empty search", "/app/recipes?q=zzzz"],
  ["S08 recipes filtered", "/app/recipes?allergen=al-milk&status=approved"],
  ["S07 recipe editor", "/app/recipes/re-burger"], ["S09 products", "/app/products"], ["S09 product", "/app/products/pr-bun"],
  ["S03 menus", "/app/menus"], ["S03 menus filtered", "/app/menus?brand=br-hotels"], ["S05 menu editor", "/app/menus/me-winter"],
  ["S13 spec book", "/app/menus/me-winter/spec-book"],
  ["Admin", "/app/admin"], ["S11 publish overview", "/app/publish"], ["S12 publish board", "/app/publish/br-taverns"],
];
// Admin-only screens, checked as an admin.
const ADMIN: [string, string][] = [
  ["S15 brands", "/app/admin/brands"], ["S16 brand", "/app/admin/brands/br-taverns"], ["S16 new brand", "/app/admin/brands/new"],
  ["S17 people", "/app/admin/users"],
];

for (const width of [1440, 390]) {
  test(`A11Y every back-office screen at ${width}px`, async ({ page, signInAs, axe }) => {
    for (const [who, list] of [["central", SCREENS], ["admin", ADMIN]] as const) {
      await signInAs(who);
      await page.setViewportSize({ width, height: 900 });
      for (const [label, url] of list) {
        await page.goto(url);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        await axe(`${label} @${width}`);
        await noSidewaysScroll(page);
      }
    }
  });
}

import { test as base, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const USERS = { central: "u-central", head: "u-head", site: "u-site" } as const;

type Fixtures = {
  /** Console errors, page errors and 5xx responses seen during the test. Must be empty at the end. */
  problems: string[];
  signInAs: (who: keyof typeof USERS) => Promise<void>;
  axe: (label: string) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`); });
      page.on("pageerror", (e) => problems.push(`page error: ${e.message.slice(0, 300)}`));
      page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} on ${r.url()}`); });
      await use(problems);
      expect(problems, "no console errors, page errors or 5xx responses").toEqual([]);
    },
    { auto: true },
  ],
  signInAs: async ({ context, baseURL }, use) => {
    await use(async (who) => {
      await context.addCookies([{ name: "spec_user", value: USERS[who], url: baseURL! }]);
    });
  },
  axe: async ({ page }, use) => {
    await use(async (label) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const found = r.violations.map((v) => `${label}: ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(found, `accessibility on ${label}`).toEqual([]);
    });
  },
});

export { expect };

/** The app's own error and status messages. Next.js adds a hidden route announcer with role="alert"; skip it. */
export const appAlert = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

// ---------- helpers that act like a chef ----------

/** Wait until the page has finished streaming and its scripts are running. */
export async function ready(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator('[aria-label="Loading"]')).toHaveCount(0);
}

export async function newRecipe(page: Page, kind: "dish" | "batch", name: string) {
  await page.goto("/app/recipes");
  await page.getByRole("button", { name: "New recipe" }).click();
  const dlg = page.getByRole("dialog", { name: "New recipe" });
  await dlg.getByLabel(kind === "batch" ? "Batch recipe" : "Dish").check();
  await dlg.getByLabel("Name", { exact: true }).fill(name);
  await dlg.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/app\/recipes\/re-/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
}

export async function addLine(page: Page, n: number, search: string, qty: string, unit?: string) {
  await page.getByRole("button", { name: "Add ingredient" }).click();
  const cb = page.getByRole("combobox", { name: `Ingredient ${n}`, exact: true });
  await cb.fill(search);
  await page.getByRole("listbox").getByRole("option").first().click();
  await page.getByLabel(`Quantity for ingredient ${n}`, { exact: true }).fill(qty);
  if (unit) await page.getByLabel(`Unit for ingredient ${n}`, { exact: true }).selectOption(unit);
}

export async function saveRecipe(page: Page) {
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

export async function noSidewaysScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over, "page wider than the screen").toBeLessThanOrEqual(1);
}

export function pdfText(buf: Buffer): string {
  // pdftotext (poppler) reads the PDF exactly as a person copying text from it would.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  return execFileSync("pdftotext", ["-layout", "-", "-"], { input: buf }).toString();
}

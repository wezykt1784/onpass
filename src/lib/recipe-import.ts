// Recipe import from the old spec book / recipe card format (books of dishes, each with components).
// Pure functions, shared by the browser (preview and review) and the server (saving).
import type { Allergen, AllergenLevel, BaseUnit, Unit } from "./types";
import { allergenFromText } from "./product-upload";

// ---------- the old format ----------

export interface OldComponent { name: string; ingredients?: string[]; method?: string[]; note?: string; yieldText?: string; yieldPortions?: number | null }
export interface OldRecipe {
  id: string;
  book: string;
  name: string;
  description?: string;
  course?: string;
  price?: string;
  portion?: string;
  plate?: string[];
  notes?: string;
  photo?: string;
  components?: OldComponent[];
  allergens?: { contains?: string[]; may?: string[]; status?: string; source?: string; checkedBy?: string; checkedAt?: string } | string[];
}

export const BOOK_NAMES: Record<string, string> = { set: "Christmas set menu", bar: "Bar canapés", pub: "Pub canapés", feast: "Burgers and feasts" };

// ---------- ingredient lines ----------

export interface ParsedLine { text: string; quantity: number | null; unit: Unit; name: string }

const UNIT_WORDS: Record<string, [Unit, number]> = {
  g: ["g", 1], gr: ["g", 1], gm: ["g", 1], gram: ["g", 1], grams: ["g", 1], kg: ["kg", 1], kilo: ["kg", 1],
  ml: ["ml", 1], cl: ["ml", 10], l: ["l", 1], ltr: ["l", 1], litre: ["l", 1], litres: ["l", 1], liter: ["l", 1],
  tbsp: ["ml", 15], tablespoon: ["ml", 15], tablespoons: ["ml", 15], tsp: ["ml", 5], teaspoon: ["ml", 5], teaspoons: ["ml", 5],
  pc: ["ea", 1], pcs: ["ea", 1], piece: ["ea", 1], pieces: ["ea", 1], each: ["ea", 1], ea: ["ea", 1], x: ["ea", 1],
  slice: ["ea", 1], slices: ["ea", 1], portion: ["ea", 1], portions: ["ea", 1], whole: ["ea", 1], leaf: ["ea", 1], leaves: ["ea", 1],
  sprig: ["ea", 1], sprigs: ["ea", 1], clove: ["ea", 1], cloves: ["ea", 1], wedge: ["ea", 1], wedges: ["ea", 1],
};
const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

/** "450g Dijon mustard", "2pc rye bread", "55g / 3 slices salmon", "Sea salt" (no amount). */
export function parseLine(text: string): ParsedLine {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛])\s*([a-zA-Z]+)?\.?\s*(?:\/\s*\d+(?:[.,]\d+)?\s*[a-zA-Z]*\s*)?(.*)$/);
  if (!m) return { text: t, quantity: null, unit: "g", name: cleanName(t) };
  const n = FRACTIONS[m[1]] ?? Number(m[1].replace(",", "."));
  const word = (m[2] ?? "").toLowerCase();
  const hit = UNIT_WORDS[word];
  // "2 eggs": a number with no unit word counts each; "2 large eggs" keeps the word as part of the name.
  const name = hit ? m[3] : `${m[2] ?? ""} ${m[3]}`.trim();
  return { text: t, quantity: n > 0 ? Math.round(n * (hit?.[1] ?? 1) * 1000) / 1000 : null, unit: hit ? hit[0] : "ea", name: cleanName(name) };
}

function cleanName(s: string) {
  return s.replace(/^[½¼¾⅓⅔⅛]\s*/, "").replace(/\([^)]*\)/g, "").split(/,| - | – /)[0].replace(/^(of|x)\s+/i, "").replace(/\s+/g, " ").trim() || s.trim();
}

/** For costing and nutrition, a rough grams/ml figure for a batch's yield. */
function toBase(q: number, u: Unit): { q: number; u: BaseUnit } {
  if (u === "kg") return { q: q * 1000, u: "g" };
  if (u === "l") return { q: q * 1000, u: "ml" };
  return { q, u: u as BaseUnit };
}

// ---------- matching ----------

const STOP = new Set(["fresh", "chopped", "sliced", "diced", "finely", "roughly", "picked", "the", "a", "of", "and", "&", "for", "to", "in", "with", "plus", "extra", "large", "small", "medium", "good", "quality", "approx", "about"]);
export const tokens = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(" ")
    .map((w) => (w.length > 3 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .filter((w) => w && !STOP.has(w));

/** A product the import can point at: one already in Onpass, or one about to be added from the price list. */
export interface CatalogueItem { key: string; name: string; supplier: string | null; baseUnit: BaseUnit; fromPrices: boolean }
export const catalogueKey = (supplier: string | null, name: string) => `${(supplier ?? "").toLowerCase()}\u0000${name.trim().toLowerCase()}`;

/** Best matches for an ingredient name: every word of the ingredient must appear in the product name. */
export function suggest(name: string, catalogue: CatalogueItem[], limit = 6): CatalogueItem[] {
  const want = tokens(name);
  if (!want.length) return [];
  const scored: { c: CatalogueItem; score: number }[] = [];
  for (const c of catalogue) {
    const have = new Set(tokens(c.name));
    const hits = want.filter((w) => have.has(w)).length;
    if (hits < want.length) continue;
    // fewer extra words is better; a price-list product beats a bare name
    scored.push({ c, score: 100 - (have.size - hits) * 5 + (c.fromPrices ? 2 : 0) });
  }
  return scored.sort((a, b) => b.score - a.score || a.c.name.length - b.c.name.length).slice(0, limit).map((x) => x.c);
}

// Words on price lists that don't change what the food is.
const FILLER = new Set(["herb", "bar", "fz", "frozen", "fresh", "pack", "case", "box", "tub", "jar", "bag", "tin", "bottle", "catering", "x", "gm", "kg", "g", "ml", "l", "ltr", "litre", "each", "ea"]);
const meaningful = (s: string) => tokens(s).filter((w) => !FILLER.has(w) && !/^\d/.test(w));

/**
 * Only pick a match without asking when the product is the same food: once pack sizes and words like
 * "herb" or "frozen" are set aside, the product name has no words the ingredient doesn't. "Salt" never
 * becomes "salt cod" on its own: a wrong match could add or hide an allergen.
 */
export function autoMatch(name: string, catalogue: CatalogueItem[]): CatalogueItem | null {
  const want = new Set(meaningful(name));
  if (!want.size) return null;
  return suggest(name, catalogue, 20).find((c) => meaningful(c.name).every((w) => want.has(w))) ?? null;
}

// ---------- the plan ----------

/** Where an ingredient line points: a product (by catalogue key, or a new product by name) or a batch in this import. */
export type Target = { type: "product"; key: string } | { type: "new"; name: string; baseUnit: BaseUnit } | { type: "batch"; key: string };
export interface PlanLine { text: string; quantity: number; unit: Unit; noAmount: boolean; ingredient: string | null; target: Target | null }
export interface PlanBatch { key: string; name: string; yieldQty: number; yieldUnit: BaseUnit; yieldWorkedOut: boolean; method: { text: string; steps?: string[] }[]; lines: PlanLine[] }
export interface PlanDish {
  oldId: string; book: string; name: string; description: string | null; pricePence: number | null; photo: string | null;
  method: { text: string; steps?: string[] }[]; lines: PlanLine[]; batches: string[];
  overrides: { allergenId: string; level: AllergenLevel; reason: string }[]; allergenNote: string; unknownAllergens: string[];
}
export interface Plan { dishes: PlanDish[]; batches: Record<string, PlanBatch>; ingredients: { name: string; uses: number; suggestions: string[]; chosen: string | null }[] }

const pence = (s?: string) => {
  const m = (s ?? "").replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(Number(m[1]) * 100) : null;
};

function readYield(text: string | undefined): { q: number; u: BaseUnit } | null {
  const p = parseLine(`${text ?? ""} x`);
  if (!text?.trim() || p.quantity == null) return null;
  return toBase(p.quantity, p.unit);
}

function lineFrom(text: string): PlanLine {
  const p = parseLine(text);
  // No amount in the old recipe: keep the line so its allergens still count, at a token 1 g.
  return { text, quantity: p.quantity ?? 1, unit: p.quantity == null ? "g" : p.unit, noAmount: p.quantity == null, ingredient: p.name, target: null };
}

/** "Salt, pepper & extra virgin oil" with no amount is three ingredients; each must be kept for its allergens. */
function linesFrom(text: string): PlanLine[] {
  const p = parseLine(text);
  if (p.quantity != null) return [lineFrom(text)];
  const parts = text.replace(/\([^)]*\)/g, "").split(/,|&|\band\b|\+/i).map((x) => x.trim()).filter(Boolean);
  return parts.length > 1 ? parts.map((x) => ({ ...lineFrom(x), text })) : [lineFrom(text)];
}

export function buildPlan(recipes: OldRecipe[], catalogue: CatalogueItem[], allergens: Allergen[]): Plan {
  const batches: Record<string, PlanBatch> = {};
  const batchNames = new Map<string, string>();
  const dishes: PlanDish[] = [];

  for (const r of recipes) {
    const bookName = BOOK_NAMES[r.book] ?? r.book;
    const comps = (r.components ?? []).filter((c) => c.name?.trim());
    const withIngredients = comps.filter((c) => (c.ingredients ?? []).some((x) => x.trim()));
    const keys: string[] = [];
    for (const c of withIngredients) {
      const ings = (c.ingredients ?? []).map((x) => x.trim()).filter(Boolean);
      const key = `${c.name.trim().toLowerCase()}|${[...ings].sort().join("|").toLowerCase()}`;
      if (!batches[key]) {
        let name = c.name.trim().slice(0, 120);
        if (batchNames.has(name.toLowerCase()) && batchNames.get(name.toLowerCase()) !== key) name = `${name} (${r.name})`.slice(0, 120);
        batchNames.set(name.toLowerCase(), key);
        const lines = ings.flatMap(linesFrom);
        let y = readYield(c.yieldText);
        let worked = false;
        if (!y) {
          const sum = lines.filter((l) => !l.noAmount && l.unit !== "ea").reduce((s, l) => s + toBase(l.quantity, l.unit).q, 0);
          y = { q: sum > 0 ? Math.round(sum) : 1, u: sum > 0 ? "g" : "ea" };
          worked = true;
        }
        const method = (c.method ?? []).filter((s) => s.trim()).map((s) => ({ text: s.trim().slice(0, 1000) }));
        if (c.note?.trim()) method.push({ text: `Note: ${c.note.trim()}`.slice(0, 1000) });
        const missing = [...new Set(lines.filter((l) => l.noAmount).map((l) => l.text))];
        if (missing.length) method.push({ text: `Amounts not given in the old recipe for: ${missing.join(", ")}. Entered as 1 g so their allergens count; weigh and update.`.slice(0, 1000) });
        if (worked) method.push({ text: "Yield worked out from the ingredient weights. Weigh the finished batch and update it." });
        batches[key] = { key, name, yieldQty: y.q, yieldUnit: y.u, yieldWorkedOut: worked, method, lines };
      }
      keys.push(key);
    }

    // Plate lines: a component of this dish if the names line up, otherwise an ingredient.
    const dishLines: PlanLine[] = [];
    const usedBatch = new Set<string>();
    for (const text of (r.plate ?? []).map((x) => x.trim()).filter(Boolean)) {
      if (!/\d/.test(text) && /^(serve|plate|garnish with|finish|place|spoon|dress)\b/i.test(text)) continue; // service instructions, not food
      for (const line of linesFrom(text)) {
      const want = tokens(line.ingredient ?? "");
      const comp = keys.find((k) => {
        const have = tokens(batches[k].name);
        return want.length > 0 && (want.every((w) => have.includes(w)) || have.every((w) => want.includes(w)));
      });
      if (comp) { line.target = { type: "batch", key: comp }; usedBatch.add(comp); }
      dishLines.push(line);
      }
    }
    // Every component must reach the dish, or its allergens would be lost.
    for (const k of keys) if (!usedBatch.has(k)) dishLines.push({ text: batches[k].name, quantity: 1, unit: "g", noAmount: true, ingredient: null, target: { type: "batch", key: k } });

    const method: { text: string; steps?: string[] }[] = comps.filter((c) => !withIngredients.includes(c) && (c.method ?? []).some((s) => s.trim()))
      .map((c) => ({ text: c.name.trim(), steps: (c.method ?? []).filter((s) => s.trim()).map((s) => s.trim()) }));
    if (r.portion?.trim()) method.unshift({ text: `Portion: ${r.portion.trim()}` });
    if (r.notes?.trim()) method.push({ text: `Note: ${r.notes.trim()}`.slice(0, 1000) });
    const plateOnly = [...new Set(dishLines.filter((l) => l.noAmount && l.target?.type !== "batch").map((l) => l.text))];
    if (plateOnly.length) method.push({ text: `Amounts not given in the old recipe for: ${plateOnly.join(", ")}. Entered as 1 g so their allergens count.`.slice(0, 1000) });

    // Allergens checked against Zonal become dish-level notes. They add to, never replace, what the products say.
    const a = Array.isArray(r.allergens) ? { contains: r.allergens } : r.allergens ?? {};
    const checked = !Array.isArray(r.allergens) && a && "status" in a && a.status === "checked";
    const when = !Array.isArray(r.allergens) && a && "checkedAt" in a && a.checkedAt ? new Date(a.checkedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;
    const who = !Array.isArray(r.allergens) && a && "checkedBy" in a ? a.checkedBy : null;
    const reason = (checked ? `From the ${("source" in a && a.source) || "Zonal matrix"} in the old spec book, checked${who ? ` by ${who}` : ""}${when ? ` on ${when}` : ""}` : "From the old spec book, not marked as checked").slice(0, 200);
    const unknownAllergens: string[] = [];
    const overrides: PlanDish["overrides"] = [];
    for (const [list, level] of [[a.contains ?? [], "contains"], [("may" in a && a.may) || [], "may_contain"]] as const) {
      for (const t of list) {
        const found = allergenFromText(t, allergens);
        if (!found) { unknownAllergens.push(t); continue; }
        if (!overrides.some((o) => o.allergenId === found.id)) overrides.push({ allergenId: found.id, level, reason });
      }
    }

    dishes.push({
      oldId: r.id, book: bookName, name: r.name.trim().slice(0, 120), description: r.description?.trim().slice(0, 200) || null,
      pricePence: pence(r.price), photo: r.photo || null, method: method.slice(0, 60), lines: dishLines.slice(0, 80), batches: keys,
      overrides, allergenNote: checked ? reason : "Not checked in the old spec book", unknownAllergens,
    });
  }

  // Distinct ingredients across every line that isn't a component, with suggestions.
  const counts = new Map<string, number>();
  const all = [...Object.values(batches).flatMap((b) => b.lines), ...dishes.flatMap((d) => d.lines)].filter((l) => l.target?.type !== "batch" && l.ingredient);
  for (const l of all) counts.set(l.ingredient!.toLowerCase(), (counts.get(l.ingredient!.toLowerCase()) ?? 0) + 1);
  const ingredients = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([name, uses]) => ({
    name, uses, suggestions: suggest(name, catalogue).map((c) => c.key), chosen: autoMatch(name, catalogue)?.key ?? null,
  }));
  return { dishes, batches, ingredients };
}

/** Points every ingredient line at the product the person picked (or a new product). */
export function applyChoices(plan: Plan, choices: Record<string, string | null>) {
  const target = (l: PlanLine): Target | null => {
    if (l.target?.type === "batch") return l.target;
    if (!l.ingredient) return null;
    const key = choices[l.ingredient.toLowerCase()];
    if (key) return { type: "product", key };
    const name = l.ingredient.charAt(0).toUpperCase() + l.ingredient.slice(1);
    return { type: "new", name: name.slice(0, 160), baseUnit: l.unit === "kg" ? "g" : l.unit === "l" ? "ml" : (l.unit as BaseUnit) };
  };
  for (const b of Object.values(plan.batches)) for (const l of b.lines) l.target = target(l);
  for (const d of plan.dishes) for (const l of d.lines) l.target = target(l);
  return plan;
}

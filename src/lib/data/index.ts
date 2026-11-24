// Data layer. Every screen and action goes through these functions only.
// Today they read the fake store; /replica-backend swaps the bodies for Supabase queries
// with the same names, arguments and return types.
import "server-only";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { computeRollup, wouldLoop } from "../rollup";
import type {
  Menu, MenuRow, MenuSnapshot, Product, Recipe, RecipeLine, Rollup, SnapshotDish, SnapshotSection, Supplier, User,
} from "../types";
import { save, store } from "./store";

export class DataError extends Error {}

const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();

// ---------- session (fake auth) ----------

export async function currentUser(): Promise<User | null> {
  const c = await cookies();
  const uid = c.get("spec_user")?.value;
  return store().users.find((u) => u.id === uid) ?? null;
}

export async function requireEditor(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new DataError("Please sign in again.");
  if (u.role === "viewer") throw new DataError("Your role can read specs but not change them.");
  return u;
}

export async function listUsers() {
  await connection();
  return store().users;
}

// ---------- reference ----------

export async function getOrg() {
  await connection();
  return store().org;
}

export async function getOrgBySlug(slug: string) {
  await connection();
  const o = store().org;
  return o.slug === slug ? o : null;
}

export async function listAllergens() {
  await connection();
  return [...store().allergens].sort((a, b) => a.sort - b.sort);
}

export async function listDiets() {
  await connection();
  return [...store().diets].sort((a, b) => a.sort - b.sort);
}

export async function listSuppliers() {
  await connection();
  return [...store().suppliers].sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertSupplier(input: { id?: string; name: string }): Promise<Supplier> {
  await requireEditor();
  const name = input.name.trim();
  if (!name) throw new DataError("Give the supplier a name.");
  const s = store();
  const existing = s.suppliers.find((x) => x.id === input.id || x.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.name = name;
    save();
    return existing;
  }
  const sup = { id: id("su"), name };
  s.suppliers.push(sup);
  save();
  return sup;
}

// ---------- products ----------

export async function listProducts(q?: string) {
  await connection();
  const term = q?.trim().toLowerCase();
  return store()
    .products.filter((p) => !p.archived)
    .filter((p) => !term || term.split(/\s+/).every((t) => `${p.name} ${p.supplierCode ?? ""}`.toLowerCase().includes(t)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProduct(productId: string) {
  await connection();
  return store().products.find((p) => p.id === productId) ?? null;
}

export async function upsertProduct(input: Omit<Product, "id" | "updatedAt" | "archived"> & { id?: string }): Promise<Product> {
  await requireEditor();
  if (!input.name.trim()) throw new DataError("Give the product a name.");
  if (input.baseUnit === "ea" && !input.eachWeightG) {
    // allowed, but nutrition can't be worked out; the editor shows this as a warning
  }
  const s = store();
  const dupe = s.products.find(
    (p) => p.id !== input.id && input.supplierCode && p.supplierId === input.supplierId && p.supplierCode === input.supplierCode,
  );
  if (dupe) throw new DataError(`Supplier code ${input.supplierCode} is already used by ${dupe.name}.`);
  const existing = input.id ? s.products.find((p) => p.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, input, { updatedAt: nowIso() });
    save();
    return existing;
  }
  const p: Product = { ...input, id: id("pr"), archived: false, updatedAt: nowIso() };
  s.products.push(p);
  save();
  return p;
}

export async function recipesUsingProduct(productId: string) {
  await connection();
  return store().recipes.filter((r) => r.lines.some((l) => l.productId === productId));
}

// ---------- recipes ----------

function maps() {
  const s = store();
  return {
    recipes: new Map(s.recipes.map((r) => [r.id, r])),
    products: new Map(s.products.map((p) => [p.id, p])),
  };
}

export async function listRecipes(filter: { q?: string; kind?: "dish" | "batch"; status?: string } = {}) {
  await connection();
  const term = filter.q?.trim().toLowerCase();
  const { recipes, products } = maps();
  return store()
    .recipes.filter((r) => (filter.status ? r.status === filter.status : r.status !== "archived"))
    .filter((r) => !filter.kind || r.kind === filter.kind)
    .filter((r) => !term || term.split(/\s+/).every((t) => `${r.name} ${r.code ?? ""}`.toLowerCase().includes(t)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((r) => ({ recipe: r, rollup: computeRollup(r.id, recipes, products) }));
}

export async function getRecipe(recipeId: string) {
  await connection();
  return store().recipes.find((r) => r.id === recipeId) ?? null;
}

export async function getRollup(recipeId: string): Promise<Rollup> {
  await connection();
  const { recipes, products } = maps();
  return computeRollup(recipeId, recipes, products);
}

export async function recipesUsingRecipe(recipeId: string) {
  await connection();
  return store().recipes.filter((r) => r.lines.some((l) => l.subRecipeId === recipeId));
}

export async function createRecipe(input: { kind: "dish" | "batch"; name: string }): Promise<Recipe> {
  const u = await requireEditor();
  const name = input.name.trim();
  if (!name) throw new DataError("Give the recipe a name.");
  const r: Recipe = {
    id: id("re"),
    kind: input.kind,
    name,
    code: null,
    description: null,
    photoPath: null,
    yieldQty: input.kind === "batch" ? 1000 : null,
    yieldUnit: input.kind === "batch" ? "g" : null,
    portions: 1,
    method: [],
    skillRating: null,
    timeRating: null,
    status: "draft",
    lines: [],
    overrides: [],
    pricePence: null,
    updatedAt: nowIso(),
    updatedBy: u.id,
  };
  store().recipes.push(r);
  save();
  return r;
}

type RecipeDetails = Pick<
  Recipe,
  "name" | "code" | "description" | "yieldQty" | "yieldUnit" | "portions" | "method" | "skillRating" | "timeRating" | "status" | "pricePence"
>;

/** Optimistic lock: `expectedUpdatedAt` must match, or another chef saved first. */
export async function updateRecipe(recipeId: string, details: RecipeDetails, expectedUpdatedAt: string): Promise<Recipe> {
  const u = await requireEditor();
  const s = store();
  const r = s.recipes.find((x) => x.id === recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  if (r.updatedAt !== expectedUpdatedAt) {
    const who = s.users.find((x) => x.id === r.updatedBy)?.name ?? "Someone";
    throw new DataError(`${who} saved this recipe while you were editing. Reload to see their changes.`);
  }
  if (!details.name.trim()) throw new DataError("Give the recipe a name.");
  if (r.kind === "batch" && !(details.yieldQty && details.yieldQty > 0)) throw new DataError("Enter the batch weight.");
  if (details.code) {
    const clash = s.recipes.find((x) => x.id !== r.id && x.code === details.code);
    if (clash) throw new DataError(`Code ${details.code} is already used by ${clash.name}.`);
  }
  if (details.status === "archived") {
    const used = s.recipes.filter((x) => x.status !== "archived" && x.lines.some((l) => l.subRecipeId === r.id));
    if (used.length) throw new DataError(`Can't archive: used in ${used.map((x) => x.name).join(", ")}.`);
    const onMenu = s.menus.filter((m) => menuRecipeIds(m).includes(r.id));
    if (onMenu.length) throw new DataError(`Can't archive: on ${onMenu.map((m) => m.name).join(", ")}.`);
  }
  Object.assign(r, details, { name: details.name.trim(), updatedAt: nowIso(), updatedBy: u.id });
  save();
  return r;
}

/** Replace all lines in one go (matches the save_recipe_lines RPC). */
export async function saveRecipeLines(recipeId: string, lines: Omit<RecipeLine, "id" | "sort">[], expectedUpdatedAt: string) {
  const u = await requireEditor();
  const s = store();
  const r = s.recipes.find((x) => x.id === recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  if (r.updatedAt !== expectedUpdatedAt) throw new DataError("Someone saved this recipe while you were editing. Reload to see their changes.");
  const { recipes, products } = maps();
  for (const l of lines) {
    if ((l.productId == null) === (l.subRecipeId == null)) throw new DataError("Each line needs a product or a batch recipe.");
    if (!(l.quantity > 0)) throw new DataError("Every quantity must be above 0.");
    if (l.productId && !products.has(l.productId)) throw new DataError("A product on this recipe no longer exists.");
    if (l.subRecipeId) {
      const sub = recipes.get(l.subRecipeId);
      if (!sub) throw new DataError("A batch recipe on this recipe no longer exists.");
      if (wouldLoop(recipeId, l.subRecipeId, recipes))
        throw new DataError(`${sub.name} already uses ${r.name}, so it can't go inside it.`);
    }
  }
  r.lines = lines.map((l, i) => ({ ...l, id: id("ln"), sort: i + 1 }));
  r.updatedAt = nowIso();
  r.updatedBy = u.id;
  save();
  return r;
}

export async function setAllergenOverrides(recipeId: string, overrides: Recipe["overrides"], expectedUpdatedAt: string) {
  const u = await requireEditor();
  const r = store().recipes.find((x) => x.id === recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  if (r.updatedAt !== expectedUpdatedAt) throw new DataError("Someone saved this recipe while you were editing. Reload to see their changes.");
  for (const o of overrides) if (!o.reason.trim()) throw new DataError("Say why the allergen is added (for example: shared fryer).");
  r.overrides = overrides;
  r.updatedAt = nowIso();
  r.updatedBy = u.id;
  save();
  return r;
}

export async function setRecipePhoto(recipeId: string, photoPath: string | null) {
  const u = await requireEditor();
  const r = store().recipes.find((x) => x.id === recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  // Photos save on their own and don't bump updatedAt, so an open editor doesn't see a false conflict.
  void u;
  r.photoPath = photoPath;
  save();
  return r;
}

// ---------- menus ----------

function menuRecipeIds(m: Menu): string[] {
  return m.rows.flatMap((s) => [s, ...(s.children ?? [])]).filter((r) => r.kind === "item" && r.recipeId).map((r) => r.recipeId!);
}

export async function listMenus(q?: string) {
  await connection();
  const term = q?.trim().toLowerCase();
  return store()
    .menus.filter((m) => !term || `${m.name} ${m.code ?? ""}`.toLowerCase().includes(term))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((m) => ({ menu: m, dishCount: menuRecipeIds(m).length }));
}

export async function getMenu(menuId: string) {
  await connection();
  return store().menus.find((m) => m.id === menuId) ?? null;
}

export async function createMenu(input: { name: string }): Promise<Menu> {
  await requireEditor();
  const name = input.name.trim();
  if (!name) throw new DataError("Give the menu a name.");
  const m: Menu = {
    id: id("me"), name, displayName: null, code: null, description: null, subHeading1: null, subHeading2: null,
    menuDate: nowIso().slice(0, 10), rows: [], updatedAt: nowIso(),
  };
  store().menus.push(m);
  save();
  return m;
}

export async function updateMenuDetails(
  menuId: string,
  d: Pick<Menu, "name" | "displayName" | "code" | "description" | "subHeading1" | "subHeading2" | "menuDate">,
) {
  await requireEditor();
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) throw new DataError("That menu no longer exists.");
  if (!d.name.trim()) throw new DataError("Give the menu a name.");
  if (d.code && s.menus.some((x) => x.id !== menuId && x.code === d.code)) throw new DataError(`Menu code ${d.code} is already used.`);
  Object.assign(m, d, { updatedAt: nowIso() });
  save();
  return m;
}

/** Replace the content builder tree (matches the save_menu_rows RPC). */
export async function saveMenuRows(menuId: string, rows: MenuRow[]) {
  await requireEditor();
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) throw new DataError("That menu no longer exists.");
  const items = rows.flatMap((r) => r.children ?? []).filter((r) => r.kind === "item");
  if (items.length > 250) throw new DataError("A menu can hold at most 250 dishes.");
  const ids = new Set(s.recipes.map((r) => r.id));
  for (const sec of rows) {
    if (sec.kind !== "section") throw new DataError("Dishes must sit inside a section.");
    if (!sec.title?.trim()) throw new DataError("Every section needs a name.");
  }
  for (const it of items) if (!it.recipeId || !ids.has(it.recipeId)) throw new DataError("A dish on this menu no longer exists.");
  m.rows = rows.map((sec) => ({
    ...sec,
    id: sec.id || id("mr"),
    children: (sec.children ?? []).map((c) => ({ ...c, id: c.id || id("mr") })),
  }));
  m.updatedAt = nowIso();
  save();
  return m;
}

export async function copyMenu(menuId: string, name: string) {
  await requireEditor();
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) throw new DataError("That menu no longer exists.");
  const copy: Menu = structuredClone(m);
  copy.id = id("me");
  copy.name = name.trim() || `${m.name} (copy)`;
  copy.code = null;
  copy.updatedAt = nowIso();
  for (const sec of copy.rows) {
    sec.id = id("mr");
    for (const c of sec.children ?? []) c.id = id("mr");
  }
  s.menus.push(copy);
  save();
  return copy;
}

// ---------- snapshots (what guests and chefs read) ----------

export async function buildSnapshot(menuId: string): Promise<MenuSnapshot | null> {
  await connection();
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) return null;
  const { recipes, products } = maps();
  let unknownAny = false;
  const sections: SnapshotSection[] = m.rows.map((sec) => ({
    title: sec.title ?? "",
    description: sec.description,
    rows: (sec.children ?? []).flatMap((row): SnapshotSection["rows"] => {
      if (row.kind === "info") return [{ kind: "info" as const, text: row.title ?? "" }];
      const r = row.recipeId ? recipes.get(row.recipeId) : undefined;
      if (!r) return [];
      const ru = computeRollup(r.id, recipes, products);
      if (ru.unknownProducts.length) unknownAny = true;
      const dish: SnapshotDish = {
        recipeId: r.id,
        name: row.title || r.name,
        description: row.description ?? r.description,
        code: r.code,
        pricePence: row.pricePence ?? r.pricePence,
        photoPath: r.photoPath,
        contains: ru.contains,
        mayContain: ru.mayContain,
        unknown: ru.unknownProducts.length > 0,
        diets: ru.diets,
        kcal: ru.nutritionComplete && ru.nutritionPerPortion.kcal != null ? Math.round(ru.nutritionPerPortion.kcal) : null,
      };
      return [{ kind: "item" as const, dish }];
    }),
  }));
  return {
    menuId: m.id,
    name: m.displayName || m.name,
    description: m.description,
    subHeading1: m.subHeading1,
    subHeading2: m.subHeading2,
    sections,
    hasUnknownAllergens: unknownAny,
    builtAt: nowIso(),
  };
}

// ---------- spec book ----------

/** Everything the PDF needs: the menu, every dish in order, and every batch recipe they reach. */
export async function getSpecBookData(menuId: string) {
  await connection();
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) return null;
  const { recipes, products } = maps();
  const batchesFor = (r: Recipe, seen = new Set<string>()): Recipe[] => {
    const out: Recipe[] = [];
    for (const l of r.lines) {
      if (!l.subRecipeId || seen.has(l.subRecipeId)) continue;
      const sub = recipes.get(l.subRecipeId);
      if (!sub) continue;
      seen.add(sub.id);
      out.push(sub, ...batchesFor(sub, seen));
    }
    return out;
  };
  const sections = m.rows.map((sec) => ({
    title: sec.title ?? "",
    dishes: (sec.children ?? [])
      .filter((row) => row.kind === "item" && row.recipeId && recipes.has(row.recipeId))
      .map((row) => {
        const r = recipes.get(row.recipeId!)!;
        return { recipe: r, displayName: row.title || r.name, rollup: computeRollup(r.id, recipes, products), batches: batchesFor(r) };
      }),
  }));
  return {
    org: s.org,
    menu: m,
    sections,
    products,
    recipes,
    suppliers: new Map(s.suppliers.map((x) => [x.id, x])),
    allergens: s.allergens,
    diets: s.diets,
  };
}

// Data layer. Every screen and action goes through these functions only.
// Today they read the fake store; /replica-backend swaps the bodies for Supabase queries
// with the same names, arguments and return types.
import "server-only";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { computeRollup, wouldLoop } from "../rollup";
import type {
  Brand, Member, Menu, MenuRow, MenuSnapshot, Product, Publication, Recipe, RecipeLine, Rollup, Site, SiteMenus, SnapshotDish,
  SnapshotSection, Supplier, User,
} from "../types";
import { effectiveLive, guestVersion, missingInfo, slugify } from "../publishing";
import { save, store } from "./store";

export class DataError extends Error {}

const id = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();

// ---------- session (fake auth) ----------

export async function currentUser(): Promise<User | null> {
  const c = await cookies();
  const uid = c.get("spec_user")?.value;
  const u = store().users.find((x) => x.id === uid);
  return u && u.status !== "disabled" ? u : null;
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
    menuDate: nowIso().slice(0, 10), rows: [], brandIds: [], updatedAt: nowIso(),
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

export async function buildSnapshot(menuId: string, _orgSlug?: string): Promise<MenuSnapshot | null> {
  await connection();
  return snapshotOf(menuId);
}

function snapshotOf(menuId: string): MenuSnapshot | null {
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

// ---------- added so the fake layer matches the Supabase layer ----------

export async function saveRecipe(
  recipeId: string, expectedUpdatedAt: string,
  input: { details: Parameters<typeof updateRecipe>[1]; lines: Omit<RecipeLine, "id" | "sort">[]; overrides: Recipe["overrides"] },
): Promise<string> {
  let r = await saveRecipeLines(recipeId, input.lines, expectedUpdatedAt);
  r = await setAllergenOverrides(recipeId, input.overrides, r.updatedAt);
  r = await updateRecipe(recipeId, input.details, r.updatedAt);
  return r.updatedAt;
}

export async function uploadRecipePhoto(recipeId: string, file: File) {
  await requireEditor();
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { uploadsDir } = await import("./store");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const name = `${recipeId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  await setRecipePhoto(recipeId, name);
}

export async function guestLists(_orgSlug: string, _menuId: string) {
  return { allergens: await listAllergens(), diets: await listDiets() };
}

export async function signedInWithoutOrg(): Promise<string | null> {
  return null;
}

export async function signInWithPassword(email: string, _password: string) {
  const u = store().users.find((x) => x.email === email.trim().toLowerCase());
  if (!u) throw new DataError("We don't recognise that email. Check it, or ask your admin to invite you.");
  (await cookies()).set("spec_user", u.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function sendPasswordReset(_email: string, _redirectTo: string) {}
export async function setNewPassword(_password: string) {
  throw new DataError("Passwords aren't used in the demo build.");
}
export async function exchangeAuthCode(_code: string) {}
export async function signOutEverywhere() {
  (await cookies()).delete("spec_user");
}


// ---------- milestone 2: brands, sites, publishing, members ----------

async function requireAdmin(): Promise<User> {
  const u = await requireEditor();
  if (u.role !== "org_admin") throw new DataError("Only an admin can change brands, sites and people.");
  return u;
}

/** Central chefs and admins manage every brand; head chefs only their own. */
async function requireBrandManager(brandId: string): Promise<User> {
  const u = await requireEditor();
  if (u.role === "org_admin" || u.role === "central_chef") return u;
  if (u.role === "head_chef" && u.brandId === brandId) return u;
  throw new DataError("You can only publish for your own brand.");
}

export async function listBrands(): Promise<Brand[]> {
  await connection();
  return [...store().brands].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBrand(brandId: string): Promise<Brand | null> {
  await connection();
  return store().brands.find((b) => b.id === brandId) ?? null;
}

export async function upsertBrand(input: Omit<Brand, "id" | "updatedAt" | "logoPath"> & { id?: string }): Promise<Brand> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new DataError("Give the brand a name.");
  const slug = slugify(input.slug || name);
  if (slug.length < 2) throw new DataError("The web name needs at least 2 letters or numbers.");
  const s = store();
  if (s.brands.some((b) => b.id !== input.id && b.slug === slug)) throw new DataError(`Another brand already uses the web name "${slug}".`);
  if (input.guest.disclaimer.length > 600) throw new DataError("Keep the allergen note under 600 characters.");
  const existing = input.id ? s.brands.find((b) => b.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, { name, slug, enabled: input.enabled, guest: input.guest, updatedAt: nowIso() });
    save();
    return existing;
  }
  const b: Brand = { id: id("br"), name, slug, enabled: input.enabled, guest: input.guest, logoPath: null, updatedAt: nowIso() };
  s.brands.push(b);
  save();
  return b;
}

export async function setBrandLogo(brandId: string, file: File | null) {
  await requireAdmin();
  const b = store().brands.find((x) => x.id === brandId);
  if (!b) throw new DataError("That brand no longer exists.");
  if (!file) { b.logoPath = null; save(); return; }
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { uploadsDir } = await import("./store");
  fs.mkdirSync(uploadsDir, { recursive: true });
  const name = `${brandId}-logo-${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
  fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
  b.logoPath = name;
  save();
}

export async function listSites(brandId?: string): Promise<Site[]> {
  await connection();
  return store().sites.filter((x) => !brandId || x.brandId === brandId).sort((a, b) => a.name.localeCompare(b.name));
}

export async function upsertSite(input: Omit<Site, "id"> & { id?: string }): Promise<Site> {
  await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new DataError("Give the site a name.");
  const slug = slugify(input.slug || name);
  if (slug.length < 2) throw new DataError("The web name needs at least 2 letters or numbers.");
  const s = store();
  if (!s.brands.some((b) => b.id === input.brandId)) throw new DataError("Pick a brand for this site.");
  if (s.sites.some((x) => x.id !== input.id && x.slug === slug)) throw new DataError(`Another site already uses the web name "${slug}".`);
  const existing = input.id ? s.sites.find((x) => x.id === input.id) : undefined;
  const row = { brandId: input.brandId, name, slug, address: input.address?.trim() || null, enabled: input.enabled };
  if (existing) { Object.assign(existing, row); save(); return existing; }
  const site: Site = { id: id("si"), ...row };
  s.sites.push(site);
  save();
  return site;
}

export async function setMenuBrands(menuId: string, brandIds: string[]) {
  const u = await requireEditor();
  if (u.role !== "org_admin" && u.role !== "central_chef") throw new DataError("Only central chefs choose which brands can use a menu.");
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) throw new DataError("That menu no longer exists.");
  const valid = brandIds.filter((b) => s.brands.some((x) => x.id === b));
  const removed = m.brandIds.filter((b) => !valid.includes(b));
  const stillPublished = s.publications.filter((p) => p.menuId === menuId && removed.includes(p.brandId));
  if (stillPublished.length) {
    const names = [...new Set(stillPublished.map((p) => s.brands.find((b) => b.id === p.brandId)?.name))].join(", ");
    throw new DataError(`Take this menu off ${names} in Publish first.`);
  }
  m.brandIds = valid;
  save();
}

export async function listPublications(brandId: string): Promise<Publication[]> {
  await connection();
  return store().publications.filter((p) => p.brandId === brandId).sort((a, b) => a.sort - b.sort);
}

/** A staging row whose go-live time has passed becomes the live row (replacing any older one). */
function settleScheduled(brandId: string, menuId: string) {
  const s = store();
  const due = s.publications.find((p) => p.brandId === brandId && p.menuId === menuId && p.stage === "staging" && p.liveFrom && new Date(p.liveFrom) <= new Date());
  if (!due) return;
  s.publications = s.publications.filter((x) => !(x.brandId === brandId && x.menuId === menuId && x.stage === "live"));
  due.stage = "live";
}

/** Put a menu (or a fresh copy of it) into the brand's staging list. */
export async function stageMenu(brandId: string, menuId: string): Promise<Publication> {
  const u = await requireBrandManager(brandId);
  const s = store();
  const m = s.menus.find((x) => x.id === menuId);
  if (!m) throw new DataError("That menu no longer exists.");
  if (!m.brandIds.includes(brandId)) throw new DataError("This menu isn't set up for this brand. Tick the brand on the menu's Details tab first.");
  const snap = snapshotOf(menuId)!;
  settleScheduled(brandId, menuId);
  const existing = s.publications.find((p) => p.brandId === brandId && p.menuId === menuId && p.stage === "staging");
  if (existing) {
    Object.assign(existing, { snapshot: snap, liveFrom: null, publishedBy: u.id, updatedAt: nowIso() });
    save();
    return existing;
  }
  const sort = Math.max(0, ...s.publications.filter((p) => p.brandId === brandId).map((p) => p.sort)) + 1;
  const pub: Publication = { id: id("pu"), brandId, menuId, stage: "staging", sort, liveFrom: null, autoRefresh: true, snapshot: snap, publishedBy: u.id, updatedAt: nowIso() };
  s.publications.push(pub);
  save();
  return pub;
}

/** Go live now (liveFrom null) or at a set time. Refused if any dish has unconfirmed allergens. */
export async function pushLive(pubId: string, liveFrom: string | null): Promise<void> {
  const s = store();
  const p = s.publications.find((x) => x.id === pubId);
  if (!p) throw new DataError("That menu is no longer in staging.");
  const u = await requireBrandManager(p.brandId);
  if (p.stage !== "staging") throw new DataError("Only a staging menu can go live.");
  const brand = s.brands.find((b) => b.id === p.brandId)!;
  const fresh = snapshotOf(p.menuId);
  if (!fresh) throw new DataError("That menu no longer exists.");
  const issues = missingInfo(fresh, brand.guest);
  if (issues.blocking.length) throw new DataError(`Can't go live yet: ${issues.blocking.join(" ")}`);
  if (liveFrom) {
    const t = new Date(liveFrom);
    if (Number.isNaN(t.getTime())) throw new DataError("Pick a valid date and time.");
    if (t.getTime() < Date.now() - 60_000) throw new DataError("Pick a time in the future, or use Go live now.");
    Object.assign(p, { snapshot: fresh, liveFrom: t.toISOString(), publishedBy: u.id, updatedAt: nowIso() });
  } else {
    s.publications = s.publications.filter((x) => !(x.brandId === p.brandId && x.menuId === p.menuId && x.stage === "live"));
    Object.assign(p, { stage: "live", snapshot: fresh, liveFrom: null, publishedBy: u.id, updatedAt: nowIso() });
  }
  save();
}

export async function unpublish(pubId: string) {
  const s = store();
  const p = s.publications.find((x) => x.id === pubId);
  if (!p) return;
  await requireBrandManager(p.brandId);
  s.publications = s.publications.filter((x) => x.id !== pubId);
  save();
}

export async function movePublication(pubId: string, dir: -1 | 1) {
  const s = store();
  const p = s.publications.find((x) => x.id === pubId);
  if (!p) throw new DataError("That menu is no longer published.");
  await requireBrandManager(p.brandId);
  const list = s.publications.filter((x) => x.brandId === p.brandId && x.stage === p.stage).sort((a, b) => a.sort - b.sort);
  const i = list.findIndex((x) => x.id === pubId);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i].sort, list[j].sort] = [list[j].sort, list[i].sort];
  save();
}

export async function setAutoRefresh(pubId: string, on: boolean) {
  const s = store();
  const p = s.publications.find((x) => x.id === pubId);
  if (!p) throw new DataError("That menu is no longer published.");
  const u = await requireBrandManager(p.brandId);
  if (u.role === "head_chef") throw new DataError("Only central chefs change how live menus update.");
  p.autoRefresh = on;
  if (!on) p.snapshot = snapshotOf(p.menuId) ?? p.snapshot; // freeze at what guests see now
  save();
}

/** Push today's recipes to a live menu that waits for sign-off. */
export async function approveRefresh(pubId: string) {
  const s = store();
  const p = s.publications.find((x) => x.id === pubId);
  if (!p) throw new DataError("That menu is no longer published.");
  await requireBrandManager(p.brandId);
  const fresh = snapshotOf(p.menuId);
  if (!fresh) throw new DataError("That menu no longer exists.");
  if (fresh.hasUnknownAllergens) throw new DataError("A dish now has unconfirmed allergen data, so guests keep the last approved version.");
  p.snapshot = fresh;
  p.updatedAt = nowIso();
  save();
}

/** Public: a site's live menus. */
export async function getSiteMenus(orgSlug: string, siteSlug: string): Promise<SiteMenus | null> {
  await connection();
  const s = store();
  if (s.org.slug !== orgSlug) return null;
  const site = s.sites.find((x) => x.slug === siteSlug && x.enabled);
  const brand = site && s.brands.find((b) => b.id === site.brandId && b.enabled);
  if (!site || !brand) return null;
  const live = effectiveLive(s.publications.filter((p) => p.brandId === brand.id));
  const menus = live.map((p) => guestVersion(p.snapshot, snapshotOf(p.menuId), p.autoRefresh));
  return { org: s.org, brand, site, menus, allergens: [...s.allergens].sort((a, b) => a.sort - b.sort), diets: [...s.diets].sort((a, b) => a.sort - b.sort) };
}

/** Current snapshot of a menu for the board's "missing info" check. */
export async function previewPublication(pubId: string) {
  await connection();
  const s = store();
  const p = s.publications.find((x) => x.id === pubId);
  if (!p) return null;
  const brand = s.brands.find((b) => b.id === p.brandId)!;
  const fresh = snapshotOf(p.menuId);
  return { fresh, issues: fresh ? missingInfo(fresh, brand.guest) : { blocking: ["The menu no longer exists."], warnings: [] }, changedSince: !!fresh && JSON.stringify(fresh.sections) !== JSON.stringify(p.snapshot.sections) };
}

// ---------- members ----------

export async function listMembers(): Promise<Member[]> {
  await requireAdmin();
  return store().users.map((u) => ({
    userId: u.id, name: u.name, email: u.email, role: u.role, brandId: u.brandId ?? null, status: u.status ?? "active", invitedAt: "2026-11-24T09:00:00.000Z",
  }));
}

export async function inviteMember(input: { email: string; name: string; role: User["role"]; brandId: string | null }) {
  await requireAdmin();
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new DataError("Enter a valid email address.");
  const s = store();
  if (s.users.some((u) => u.email === email)) throw new DataError("That person is already in your group.");
  if (input.brandId && !s.brands.some((b) => b.id === input.brandId)) throw new DataError("Pick a brand from the list.");
  if ((input.role === "head_chef" || input.role === "viewer") && !input.brandId) throw new DataError("Head chefs and site chefs need a brand.");
  s.users.push({ id: id("u"), name: input.name.trim() || email, email, role: input.role, brandId: input.brandId, status: "active" });
  save();
}

export async function updateMember(userId: string, patch: { role?: User["role"]; brandId?: string | null; status?: "active" | "disabled" }) {
  const me = await requireAdmin();
  const s = store();
  const u = s.users.find((x) => x.id === userId);
  if (!u) throw new DataError("That person is no longer in your group.");
  if (userId === me.id && (patch.status === "disabled" || (patch.role && patch.role !== "org_admin")))
    throw new DataError("You can't remove your own admin access. Ask another admin.");
  const next = { ...u, ...patch };
  if ((next.role === "head_chef" || next.role === "viewer") && !next.brandId) throw new DataError("Head chefs and site chefs need a brand.");
  if (u.role === "org_admin" && (patch.role && patch.role !== "org_admin" || patch.status === "disabled")) {
    const admins = s.users.filter((x) => x.role === "org_admin" && x.status !== "disabled" && x.id !== userId);
    if (!admins.length) throw new DataError("There must always be at least one admin.");
  }
  Object.assign(u, patch);
  save();
}

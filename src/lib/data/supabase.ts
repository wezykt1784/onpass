// Supabase data layer. Same function names, arguments and return shapes as ./fake.ts,
// so screens don't change. Every query runs as the signed-in user, and row level security
// in the "spec" schema decides what they can see and change.
import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import { supabaseServer } from "../supabase/server";
import { PHOTO_BUCKET } from "../supabase/env";
import type {
  Allergen, Diet, Menu, MenuRow, MenuSnapshot, Organisation, Product, Recipe, RecipeLine, Rollup, SnapshotDish,
  SnapshotSection, Supplier, User,
} from "../types";

export class DataError extends Error {}

type Row = Record<string, unknown>;
type PgErr = { code?: string; message: string } | null;

/** Turn a database error into a message a chef can act on. */
function fail(err: PgErr, fallback = "Something went wrong saving that."): never {
  if (!err) throw new DataError(fallback);
  if (err.code === "23505") {
    if (/recipes_code/.test(err.message)) throw new DataError("That recipe code is already used by another recipe.");
    if (/menus_code/.test(err.message)) throw new DataError("That menu code is already used by another menu.");
    if (/products_supplier_code/.test(err.message)) throw new DataError("That supplier code is already used for this supplier.");
    if (/suppliers_org_id_name/.test(err.message)) throw new DataError("There's already a supplier with that name.");
    throw new DataError("That already exists.");
  }
  if (err.code === "42501" || /row-level security/.test(err.message)) throw new DataError("You don't have permission to do that.");
  if (err.code === "23503") throw new DataError("That's still used somewhere else, so it can't be removed.");
  // Our own functions raise plain-English messages (P0001, P0002, P0409, 22023).
  if (err.code && /^(P0|22023)/.test(err.code)) throw new DataError(err.message);
  console.error("database error", err);
  throw new DataError(fallback);
}

const num = (v: unknown) => (v == null ? null : Number(v));

// ---------- session ----------

async function session() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return { sb, user: data.user };
}

async function orgId(): Promise<string> {
  const { sb } = await session();
  const { data, error } = await sb.rpc("current_org");
  if (error) fail(error);
  if (!data) throw new DataError("Your login isn't linked to a kitchen group yet. Ask your admin to add you.");
  return data as string;
}

export async function currentUser(): Promise<User | null> {
  await connection();
  const { sb, user } = await session();
  if (!user) return null;
  await sb.rpc("ensure_profile");
  const { data: org } = await sb.rpc("current_org");
  if (!org) return null;
  const [{ data: role }, { data: prof }] = await Promise.all([
    sb.rpc("org_role", { p_org: org }),
    sb.from("profiles").select("first_name,last_name,email").eq("id", user.id).maybeSingle(),
  ]);
  const name = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ") || user.email || "Chef";
  return { id: user.id, name, email: user.email ?? "", role: (role as User["role"]) ?? "viewer" };
}

/** Signed in to Supabase but with no membership in any kitchen group. */
export async function signedInWithoutOrg(): Promise<string | null> {
  await connection();
  const { sb, user } = await session();
  if (!user) return null;
  const { data } = await sb.rpc("current_org");
  return data ? null : user.email ?? "";
}

export async function requireEditor(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new DataError("Please sign in again.");
  if (u.role === "viewer") throw new DataError("Your role can read specs but not change them.");
  return u;
}

export async function listUsers(): Promise<User[]> {
  await connection();
  const { sb } = await session();
  const { data } = await sb.from("profiles").select("id,email,first_name,last_name");
  return (data ?? []).map((p) => ({
    id: p.id, email: p.email, role: "viewer" as const,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email,
  }));
}

// ---------- reference ----------

const mapOrg = (o: Row): Organisation => ({
  id: o.id as string, name: o.name as string, slug: o.slug as string,
  calorieStatement: (o.calorie_statement ?? o.calorieStatement ?? null) as string | null,
  disclaimer: (o.disclaimer as string) ?? "",
});

export async function getOrg(): Promise<Organisation> {
  await connection();
  const id = await orgId();
  const { sb } = await session();
  const { data, error } = await sb.from("organisations").select("*").eq("id", id).single();
  if (error) fail(error);
  return mapOrg(data);
}

export async function getOrgBySlug(slug: string): Promise<Organisation | null> {
  await connection();
  const { sb } = await session();
  const { data } = await sb.rpc("public_org", { p_slug: slug });
  return data ? mapOrg(data as Row) : null;
}

const mapAllergen = (a: Row): Allergen => ({
  id: a.id as string, code: a.code as string, name: a.name as string,
  parentId: (a.parent_id ?? a.parentId ?? null) as string | null, sort: a.sort as number,
});
const mapDiet = (d: Row): Diet => ({ id: d.id as string, code: d.code as string, name: d.name as string, short: (d.short as string) || "", sort: d.sort as number });

export async function listAllergens(): Promise<Allergen[]> {
  await connection();
  const { sb } = await session();
  const { data, error } = await sb.from("allergens").select("id,code,name,parent_id,sort").order("sort");
  if (error) fail(error);
  return (data ?? []).map(mapAllergen);
}

export async function listDiets(): Promise<Diet[]> {
  await connection();
  const { sb } = await session();
  const { data, error } = await sb.from("diets").select("id,code,name,short,sort").order("sort");
  if (error) fail(error);
  return (data ?? []).map(mapDiet);
}

export async function listSuppliers(): Promise<Supplier[]> {
  await connection();
  const { sb } = await session();
  const { data, error } = await sb.from("suppliers").select("id,name").order("name");
  if (error) fail(error);
  return data ?? [];
}

export async function upsertSupplier(input: { id?: string; name: string }): Promise<Supplier> {
  await requireEditor();
  const name = z.string().trim().min(1, "Give the supplier a name.").max(120).parse(input.name);
  const { sb } = await session();
  const org = await orgId();
  const { data: existing } = await sb.from("suppliers").select("id,name").ilike("name", name).maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb.from("suppliers").insert({ org_id: org, name }).select("id,name").single();
  if (error) fail(error);
  return data;
}

// ---------- products ----------

const PRODUCT_SELECT = "*, product_allergens(allergen_id,level), product_diets(diet_id)";

const mapProduct = (p: Row): Product => ({
  id: p.id as string,
  supplierId: (p.supplier_id as string) ?? null,
  name: p.name as string,
  supplierCode: (p.supplier_code as string) ?? null,
  baseUnit: p.base_unit as Product["baseUnit"],
  eachWeightG: num(p.each_weight_g),
  densityGPerMl: num(p.density_g_per_ml),
  packSize: num(p.pack_size),
  packCostPence: num(p.pack_cost_pence),
  allergenStatus: p.allergen_status as Product["allergenStatus"],
  allergens: ((p.product_allergens as Row[]) ?? []).map((a) => ({ allergenId: a.allergen_id as string, level: a.level as "contains" })),
  dietIds: ((p.product_diets as Row[]) ?? []).map((d) => d.diet_id as string),
  nutritionPer100: (p.nutrition_per_100 as Record<string, number>) ?? {},
  archived: Boolean(p.archived),
  updatedAt: p.updated_at as string,
});

export async function listProducts(q?: string): Promise<Product[]> {
  await connection();
  const { sb } = await session();
  let query = sb.from("products").select(PRODUCT_SELECT).eq("archived", false).order("name");
  for (const t of (q ?? "").trim().split(/\s+/).filter(Boolean)) {
    const safe = t.replace(/[%,()]/g, "");
    query = query.or(`name.ilike.%${safe}%,supplier_code.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) fail(error);
  return (data ?? []).map(mapProduct);
}

export async function getProduct(productId: string): Promise<Product | null> {
  await connection();
  if (!z.uuid().safeParse(productId).success) return null;
  const { sb } = await session();
  const { data } = await sb.from("products").select(PRODUCT_SELECT).eq("id", productId).maybeSingle();
  return data ? mapProduct(data) : null;
}

const productInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the product a name.").max(160),
  supplierId: z.uuid().nullable(),
  supplierCode: z.string().trim().max(60).nullable(),
  baseUnit: z.enum(["g", "ml", "ea"]),
  eachWeightG: z.number().positive().nullable(),
  densityGPerMl: z.number().positive().nullable(),
  packSize: z.number().positive().nullable(),
  packCostPence: z.number().int().min(0).nullable(),
  allergenStatus: z.enum(["complete", "unknown"]),
  allergens: z.array(z.object({ allergenId: z.uuid(), level: z.enum(["contains", "may_contain"]) })),
  dietIds: z.array(z.uuid()),
  nutritionPer100: z.record(z.string(), z.number().min(0)),
});

export async function upsertProduct(input: Omit<Product, "id" | "updatedAt" | "archived"> & { id?: string }): Promise<Product> {
  await requireEditor();
  const parsed = productInput.safeParse(input);
  if (!parsed.success) throw new DataError(parsed.error.issues[0]?.message ?? "Check the product details.");
  const p = parsed.data;
  const { sb } = await session();
  const row = {
    name: p.name, supplier_id: p.supplierId, supplier_code: p.supplierCode || null, base_unit: p.baseUnit,
    each_weight_g: p.eachWeightG, density_g_per_ml: p.densityGPerMl ?? 1, pack_size: p.packSize, pack_cost_pence: p.packCostPence,
    allergen_status: p.allergenStatus, nutrition_per_100: p.nutritionPer100,
  };
  let id = p.id;
  if (id) {
    const { error } = await sb.from("products").update(row).eq("id", id);
    if (error) fail(error);
  } else {
    const { data, error } = await sb.from("products").insert({ ...row, org_id: await orgId() }).select("id").single();
    if (error) fail(error);
    id = data.id as string;
  }
  // Replace allergens and diets. Triggers re-run the roll-up for every recipe using this product.
  const del1 = await sb.from("product_allergens").delete().eq("product_id", id);
  if (del1.error) fail(del1.error);
  if (p.allergens.length) {
    const { error } = await sb.from("product_allergens").insert(p.allergens.map((a) => ({ product_id: id, allergen_id: a.allergenId, level: a.level })));
    if (error) fail(error);
  }
  const del2 = await sb.from("product_diets").delete().eq("product_id", id);
  if (del2.error) fail(del2.error);
  if (p.dietIds.length) {
    const { error } = await sb.from("product_diets").insert(p.dietIds.map((d) => ({ product_id: id, diet_id: d })));
    if (error) fail(error);
  }
  return (await getProduct(id!))!;
}

export async function recipesUsingProduct(productId: string): Promise<Recipe[]> {
  await connection();
  const { sb } = await session();
  const { data } = await sb.from("recipe_lines").select("recipe_id").eq("product_id", productId);
  const ids = [...new Set((data ?? []).map((r) => r.recipe_id as string))];
  return ids.length ? fetchRecipes({ ids }) : [];
}

// ---------- recipes ----------

const RECIPE_SELECT = "*, recipe_lines(*), recipe_allergen_overrides(*), recipe_rollups(*)";

const mapRecipe = (r: Row): Recipe => ({
  id: r.id as string,
  kind: r.kind as Recipe["kind"],
  name: r.name as string,
  code: (r.code as string) ?? null,
  description: (r.description as string) ?? null,
  photoPath: (r.photo_path as string) ?? null,
  yieldQty: num(r.yield_qty),
  yieldUnit: (r.yield_unit as Recipe["yieldUnit"]) ?? null,
  portions: Number(r.portions ?? 1),
  method: (r.method as Recipe["method"]) ?? [],
  skillRating: (r.skill_rating as Recipe["skillRating"]) ?? null,
  timeRating: (r.time_rating as Recipe["timeRating"]) ?? null,
  status: r.status as Recipe["status"],
  lines: ((r.recipe_lines as Row[]) ?? [])
    .map((l): RecipeLine => ({
      id: l.id as string, sort: l.sort as number, productId: (l.product_id as string) ?? null,
      subRecipeId: (l.sub_recipe_id as string) ?? null, quantity: Number(l.quantity), unit: l.unit as RecipeLine["unit"],
    }))
    .sort((a, b) => a.sort - b.sort),
  overrides: ((r.recipe_allergen_overrides as Row[]) ?? []).map((o) => ({
    allergenId: o.allergen_id as string, level: o.level as "contains", reason: o.reason as string,
  })),
  pricePence: num(r.price_pence),
  updatedAt: r.updated_at as string,
  updatedBy: (r.updated_by as string) ?? null,
});

function mapRollup(r: Row): Rollup {
  const ru = (Array.isArray(r.recipe_rollups) ? r.recipe_rollups[0] : r.recipe_rollups) as Row | undefined;
  return {
    contains: (ru?.contains as string[]) ?? [],
    mayContain: (ru?.may_contain as string[]) ?? [],
    unknownProducts: (ru?.unknown_products as string[]) ?? [],
    diets: (ru?.diets as string[]) ?? [],
    nutritionPerPortion: (ru?.nutrition_per_portion as Record<string, number>) ?? {},
    nutritionComplete: Boolean(ru?.nutrition_complete),
    costPerPortionPence: num(ru?.cost_per_portion_pence),
  };
}

async function fetchRecipeRows(f: { ids?: string[]; kind?: string; status?: string; q?: string } = {}) {
  const { sb } = await session();
  let query = sb.from("recipes").select(RECIPE_SELECT).order("name");
  if (f.ids) query = query.in("id", f.ids);
  if (f.kind) query = query.eq("kind", f.kind);
  if (f.status) query = query.eq("status", f.status);
  else if (!f.ids) query = query.neq("status", "archived");
  for (const t of (f.q ?? "").trim().split(/\s+/).filter(Boolean)) {
    const safe = t.replace(/[%,()]/g, "");
    query = query.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) fail(error);
  return data ?? [];
}
const fetchRecipes = async (f: Parameters<typeof fetchRecipeRows>[0]) => (await fetchRecipeRows(f)).map(mapRecipe);

export async function listRecipes(filter: { q?: string; kind?: "dish" | "batch"; status?: string } = {}) {
  await connection();
  return (await fetchRecipeRows(filter)).map((r) => ({ recipe: mapRecipe(r), rollup: mapRollup(r) }));
}

export async function getRecipe(recipeId: string): Promise<Recipe | null> {
  await connection();
  if (!z.uuid().safeParse(recipeId).success) return null;
  const rows = await fetchRecipeRows({ ids: [recipeId] });
  return rows[0] ? mapRecipe(rows[0]) : null;
}

export async function getRollup(recipeId: string): Promise<Rollup> {
  await connection();
  const rows = await fetchRecipeRows({ ids: [recipeId] });
  return mapRollup(rows[0] ?? {});
}

export async function recipesUsingRecipe(recipeId: string): Promise<Recipe[]> {
  await connection();
  const { sb } = await session();
  const { data } = await sb.from("recipe_lines").select("recipe_id").eq("sub_recipe_id", recipeId);
  const ids = [...new Set((data ?? []).map((r) => r.recipe_id as string))];
  return ids.length ? fetchRecipes({ ids }) : [];
}

export async function createRecipe(input: { kind: "dish" | "batch"; name: string }): Promise<Recipe> {
  const u = await requireEditor();
  const name = z.string().trim().min(1, "Give the recipe a name.").max(120).safeParse(input.name);
  if (!name.success) throw new DataError(name.error.issues[0].message);
  const { sb } = await session();
  const { data, error } = await sb.from("recipes").insert({
    org_id: await orgId(), kind: input.kind, name: name.data, created_by: u.id, updated_by: u.id,
    ...(input.kind === "batch" ? { yield_qty: 1000, yield_unit: "g" } : {}),
  }).select(RECIPE_SELECT).single();
  if (error) fail(error);
  return mapRecipe(data);
}

type RecipeDetails = Pick<Recipe, "name" | "code" | "description" | "yieldQty" | "yieldUnit" | "portions" | "method" | "skillRating" | "timeRating" | "status" | "pricePence">;

const detailsInput = z.object({
  name: z.string().trim().min(1, "Give the recipe a name.").max(120),
  code: z.string().trim().max(20).nullable(),
  description: z.string().trim().max(200).nullable(),
  yieldQty: z.number().positive().nullable(),
  yieldUnit: z.enum(["g", "ml", "ea"]).nullable(),
  portions: z.number().positive(),
  method: z.array(z.object({ text: z.string().max(1000), steps: z.array(z.string()).optional() })).max(60),
  skillRating: z.enum(["green", "amber", "red"]).nullable(),
  timeRating: z.enum(["green", "amber", "red"]).nullable(),
  status: z.enum(["draft", "approved", "archived"]),
  pricePence: z.number().int().min(0).nullable(),
});
const linesInput = z.array(z.object({
  productId: z.uuid().nullable(), subRecipeId: z.uuid().nullable(),
  quantity: z.number().positive("Every quantity must be above 0."), unit: z.enum(["g", "kg", "ml", "l", "ea"]),
})).max(80);
const overridesInput = z.array(z.object({
  allergenId: z.uuid(), level: z.enum(["contains", "may_contain"]), reason: z.string().trim().min(1, "Say why the allergen is added (for example: shared fryer).").max(200),
}));

/** Details, lines and overrides in one database transaction (spec.save_recipe). Returns the new version stamp. */
export async function saveRecipe(
  recipeId: string, expectedUpdatedAt: string,
  input: { details: RecipeDetails; lines: Omit<RecipeLine, "id" | "sort">[]; overrides: Recipe["overrides"] },
): Promise<string> {
  await requireEditor();
  const d = detailsInput.safeParse(input.details);
  if (!d.success) throw new DataError(d.error.issues[0]?.message ?? "Check the recipe details.");
  const l = linesInput.safeParse(input.lines);
  if (!l.success) throw new DataError(l.error.issues[0]?.message ?? "Check the ingredients.");
  const o = overridesInput.safeParse(input.overrides);
  if (!o.success) throw new DataError(o.error.issues[0]?.message ?? "Check the allergen notes.");
  if (input.details.status === "archived") await assertCanArchive(recipeId);
  const { sb } = await session();
  const { data, error } = await sb.rpc("save_recipe", {
    p_recipe: recipeId, p_expected: expectedUpdatedAt, p_details: d.data, p_lines: l.data, p_overrides: o.data,
  });
  if (error) fail(error);
  return data as string;
}

async function assertCanArchive(recipeId: string) {
  const { sb } = await session();
  const [{ data: used }, { data: onMenu }] = await Promise.all([
    sb.from("recipe_lines").select("recipes!recipe_lines_recipe_id_fkey(name,status)").eq("sub_recipe_id", recipeId),
    sb.from("menu_rows").select("menus(name)").eq("recipe_id", recipeId),
  ]);
  const inUse = (used ?? []).map((x) => (x as Row).recipes as Row).filter((r) => r && r.status !== "archived").map((r) => r.name);
  if (inUse.length) throw new DataError(`Can't archive: used in ${inUse.join(", ")}.`);
  const menus = [...new Set((onMenu ?? []).map((x) => ((x as Row).menus as Row)?.name))];
  if (menus.length) throw new DataError(`Can't archive: on ${menus.join(", ")}.`);
}

// Kept for parity with the demo layer; the app saves through saveRecipe.
export async function updateRecipe(recipeId: string, details: RecipeDetails, expected: string) {
  const r = await getRecipe(recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  await saveRecipe(recipeId, expected, { details, lines: r.lines, overrides: r.overrides });
  return (await getRecipe(recipeId))!;
}
export async function saveRecipeLines(recipeId: string, lines: Omit<RecipeLine, "id" | "sort">[], expected: string) {
  const r = await getRecipe(recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  await saveRecipe(recipeId, expected, { details: r, lines, overrides: r.overrides });
  return (await getRecipe(recipeId))!;
}
export async function setAllergenOverrides(recipeId: string, overrides: Recipe["overrides"], expected: string) {
  const r = await getRecipe(recipeId);
  if (!r) throw new DataError("That recipe no longer exists.");
  await saveRecipe(recipeId, expected, { details: r, lines: r.lines, overrides });
  return (await getRecipe(recipeId))!;
}

/** Upload to Storage under <org>/<recipe>-<time>.jpg, then point the recipe at it. Doesn't bump updated_at. */
export async function uploadRecipePhoto(recipeId: string, file: File) {
  await requireEditor();
  const { sb } = await session();
  const org = await orgId();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${org}/${recipeId}-${Date.now()}.${ext}`;
  const up = await sb.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new DataError("The photo didn't upload. Check it's a JPG, PNG or WebP under 4 MB.");
  await setRecipePhoto(recipeId, path);
}

export async function setRecipePhoto(recipeId: string, photoPath: string | null) {
  await requireEditor();
  const { sb } = await session();
  const { data: old } = await sb.from("recipes").select("photo_path").eq("id", recipeId).single();
  // The recipes_touch trigger keeps updated_at as it was for photo-only changes, so an open editor doesn't see a false conflict.
  const { error } = await sb.from("recipes").update({ photo_path: photoPath }).eq("id", recipeId);
  if (error) fail(error);
  if (old?.photo_path && old.photo_path !== photoPath) await sb.storage.from(PHOTO_BUCKET).remove([old.photo_path as string]);
}

// ---------- menus ----------

function nestRows(rows: Row[]): MenuRow[] {
  const mapRow = (r: Row): MenuRow => ({
    id: r.id as string, kind: r.kind as MenuRow["kind"], title: (r.title as string) ?? null,
    description: (r.description as string) ?? null, recipeId: (r.recipe_id as string) ?? null, pricePence: null,
  });
  const sorted = [...rows].sort((a, b) => (a.sort as number) - (b.sort as number));
  return sorted.filter((r) => !r.parent_row_id).map((s) => ({
    ...mapRow(s), children: sorted.filter((c) => c.parent_row_id === s.id).map(mapRow),
  }));
}

const mapMenu = (m: Row): Menu => ({
  id: m.id as string, name: m.name as string, displayName: (m.display_name as string) ?? null, code: (m.code as string) ?? null,
  description: (m.description as string) ?? null, subHeading1: (m.sub_heading_1 as string) ?? null,
  subHeading2: (m.sub_heading_2 as string) ?? null, menuDate: (m.menu_date as string) ?? null,
  rows: nestRows((m.menu_rows as Row[]) ?? []), updatedAt: m.updated_at as string,
});

export async function listMenus(q?: string) {
  await connection();
  const { sb } = await session();
  let query = sb.from("menus").select("*, menu_rows(id,kind,recipe_id,parent_row_id,sort,title,description)").order("updated_at", { ascending: false });
  const t = (q ?? "").trim().replace(/[%,()]/g, "");
  if (t) query = query.or(`name.ilike.%${t}%,code.ilike.%${t}%`);
  const { data, error } = await query;
  if (error) fail(error);
  return (data ?? []).map((m) => ({ menu: mapMenu(m), dishCount: ((m.menu_rows as Row[]) ?? []).filter((r) => r.kind === "item").length }));
}

export async function getMenu(menuId: string): Promise<Menu | null> {
  await connection();
  if (!z.uuid().safeParse(menuId).success) return null;
  const { sb } = await session();
  const { data } = await sb.from("menus").select("*, menu_rows(*)").eq("id", menuId).maybeSingle();
  return data ? mapMenu(data) : null;
}

export async function createMenu(input: { name: string }): Promise<Menu> {
  const u = await requireEditor();
  const name = z.string().trim().min(1, "Give the menu a name.").max(120).safeParse(input.name);
  if (!name.success) throw new DataError(name.error.issues[0].message);
  const { sb } = await session();
  const { data, error } = await sb.from("menus").insert({
    org_id: await orgId(), name: name.data, menu_date: new Date().toISOString().slice(0, 10), created_by: u.id,
  }).select("*, menu_rows(*)").single();
  if (error) fail(error);
  return mapMenu(data);
}

const menuDetails = z.object({
  name: z.string().trim().min(1, "Give the menu a name.").max(120),
  displayName: z.string().trim().max(60).nullable(), code: z.string().trim().max(20).nullable(),
  description: z.string().trim().max(200).nullable(), subHeading1: z.string().trim().max(120).nullable(),
  subHeading2: z.string().trim().max(120).nullable(), menuDate: z.iso.date().nullable(),
});

export async function updateMenuDetails(menuId: string, d: Pick<Menu, "name" | "displayName" | "code" | "description" | "subHeading1" | "subHeading2" | "menuDate">) {
  await requireEditor();
  const p = menuDetails.safeParse(d);
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? "Check the menu details.");
  const { sb } = await session();
  const { data, error } = await sb.from("menus").update({
    name: p.data.name, display_name: p.data.displayName, code: p.data.code, description: p.data.description,
    sub_heading_1: p.data.subHeading1, sub_heading_2: p.data.subHeading2, menu_date: p.data.menuDate,
  }).eq("id", menuId).select("*, menu_rows(*)").maybeSingle();
  if (error) fail(error);
  if (!data) throw new DataError("You can't change this menu.");
  return mapMenu(data);
}

const rowsInput = z.array(z.object({
  title: z.string().trim().min(1, "Every section needs a name.").max(120),
  description: z.string().nullable().optional(),
  children: z.array(z.object({
    kind: z.enum(["item", "info"]), title: z.string().max(200).nullable(), description: z.string().nullable().optional(),
    recipeId: z.uuid().nullable(),
  })).optional(),
})).max(60);

export async function saveMenuRows(menuId: string, rows: MenuRow[]) {
  await requireEditor();
  const p = rowsInput.safeParse(rows);
  if (!p.success) throw new DataError(p.error.issues[0]?.message ?? "Check the menu.");
  if (p.data.flatMap((s) => s.children ?? []).filter((c) => c.kind === "item").length > 250) throw new DataError("A menu can hold at most 250 dishes.");
  const { sb } = await session();
  const { error } = await sb.rpc("save_menu_rows", { p_menu: menuId, p_rows: p.data });
  if (error) fail(error);
  return (await getMenu(menuId))!;
}

export async function copyMenu(menuId: string, name: string) {
  const m = await getMenu(menuId);
  if (!m) throw new DataError("That menu no longer exists.");
  const copy = await createMenu({ name: name.trim() || `${m.name} (copy)` });
  await updateMenuDetails(copy.id, { ...m, name: copy.name, code: null });
  await saveMenuRows(copy.id, m.rows);
  return (await getMenu(copy.id))!;
}

// ---------- snapshots ----------

/** What guests and chefs read. Comes from spec.public_menu, so it works signed out too. */
export async function buildSnapshot(menuId: string, orgSlug?: string): Promise<MenuSnapshot | null> {
  await connection();
  if (!z.uuid().safeParse(menuId).success) return null;
  const { sb } = await session();
  const slug = orgSlug ?? (await getOrg()).slug;
  const { data } = await sb.rpc("public_menu", { p_slug: slug, p_menu: menuId });
  if (!data) return null;
  const body = data as { menu: Row; rows: Row[]; dishes: Row[] };
  const dishes = new Map(body.dishes.map((d) => [d.id as string, d]));
  let unknownAny = false;
  const sections: SnapshotSection[] = nestRows(body.rows).map((sec) => ({
    title: sec.title ?? "",
    description: sec.description,
    rows: (sec.children ?? []).flatMap((row): SnapshotSection["rows"] => {
      if (row.kind === "info") return [{ kind: "info", text: row.title ?? "" }];
      const d = row.recipeId ? dishes.get(row.recipeId) : undefined;
      if (!d) return [];
      if (d.unknown) unknownAny = true;
      const dish: SnapshotDish = {
        recipeId: d.id as string, name: row.title || (d.name as string), description: row.description ?? ((d.description as string) ?? null),
        code: (d.code as string) ?? null, pricePence: num(d.pricePence), photoPath: (d.photoPath as string) ?? null,
        contains: (d.contains as string[]) ?? [], mayContain: (d.mayContain as string[]) ?? [], unknown: Boolean(d.unknown),
        diets: (d.diets as string[]) ?? [], kcal: num(d.kcal),
      };
      return [{ kind: "item", dish }];
    }),
  }));
  const m = body.menu;
  return {
    menuId, name: ((m.display_name as string) || (m.name as string)), description: (m.description as string) ?? null,
    subHeading1: (m.sub_heading_1 as string) ?? null, subHeading2: (m.sub_heading_2 as string) ?? null,
    sections, hasUnknownAllergens: unknownAny, builtAt: new Date().toISOString(),
  };
}

/** Allergen and diet lists as a guest sees them (built-in plus the group's own). */
export async function guestLists(orgSlug: string, menuId: string): Promise<{ allergens: Allergen[]; diets: Diet[] }> {
  await connection();
  const { sb } = await session();
  const { data } = await sb.rpc("public_menu", { p_slug: orgSlug, p_menu: menuId });
  const body = (data ?? { allergens: [], diets: [] }) as { allergens: Row[]; diets: Row[] };
  return { allergens: (body.allergens ?? []).map(mapAllergen), diets: (body.diets ?? []).map(mapDiet) };
}

// ---------- spec book ----------

export async function getSpecBookData(menuId: string) {
  await connection();
  const menu = await getMenu(menuId);
  if (!menu) return null;
  const [org, all, productsList, suppliersList, allergens, diets] = await Promise.all([
    getOrg(), fetchRecipeRows({ status: undefined }), listProducts(), listSuppliers(), listAllergens(), listDiets(),
  ]);
  const recipeRows = new Map(all.map((r) => [r.id as string, r]));
  const recipes = new Map(all.map((r) => [r.id as string, mapRecipe(r)]));
  // Menu dishes may be archived later; fetch any that weren't in the active list.
  const missing = menu.rows.flatMap((s) => s.children ?? []).map((c) => c.recipeId).filter((id): id is string => !!id && !recipes.has(id));
  if (missing.length) for (const r of await fetchRecipeRows({ ids: missing })) { recipeRows.set(r.id as string, r); recipes.set(r.id as string, mapRecipe(r)); }
  const products = new Map(productsList.map((p) => [p.id, p]));
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
  const sections = menu.rows.map((sec) => ({
    title: sec.title ?? "",
    dishes: (sec.children ?? [])
      .filter((row) => row.kind === "item" && row.recipeId && recipes.has(row.recipeId))
      .map((row) => {
        const r = recipes.get(row.recipeId!)!;
        return { recipe: r, displayName: row.title || r.name, rollup: mapRollup(recipeRows.get(r.id)!), batches: batchesFor(r) };
      }),
  }));
  return { org, menu, sections, products, recipes, suppliers: new Map(suppliersList.map((s) => [s.id, s])), allergens, diets };
}

// ---------- auth ----------

export async function signInWithPassword(email: string, password: string) {
  const { sb } = await session();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.name === "AuthRetryableFetchError" || error.status === 0 || /fetch failed/i.test(error.message))
      throw new DataError("Can't reach the sign-in service right now. Check your connection and try again.");
    if (/confirm/i.test(error.message)) throw new DataError("Your email isn't confirmed yet. Use the link in your invite email first.");
    throw new DataError("That email and password don't match. Try again, or reset your password.");
  }
  await sb.rpc("ensure_profile");
}

export async function sendPasswordReset(email: string, redirectTo: string) {
  const { sb } = await session();
  // Always say the same thing, so nobody can test which emails have accounts.
  await sb.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function setNewPassword(password: string) {
  const { sb, user } = await session();
  if (!user) throw new DataError("That reset link has expired. Ask for a new one.");
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new DataError(/weak|short|length/i.test(error.message) ? "Use at least 10 characters, and not a common password." : "That password couldn't be saved. Try a different one.");
}

export async function exchangeAuthCode(code: string) {
  const { sb } = await session();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) throw new DataError("That link has expired or was already used. Ask for a new one.");
}

export async function signOutEverywhere() {
  const { sb } = await session();
  await sb.auth.signOut({ scope: "global" });
}

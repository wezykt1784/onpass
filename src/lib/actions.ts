"use server";
import { PUBLIC_LANDING } from "@/lib/site-mode";
// Server actions. Each one checks the user (inside the data layer), validates, writes, then refreshes the page.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import * as data from "./data";
import { useSupabase } from "./supabase/env";
import { rateLimit } from "./rate-limit";
import type { Brand, MenuRow, Product, Recipe, RecipeLine, Site, User } from "./types";
import { UPLOAD_CHUNK, matchKey, type UploadField, type UploadRow } from "./product-upload";

export type ActionResult<T = unknown> = { ok: true; value?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    refresh();
    return { ok: true, value };
  } catch (e) {
    if (data.isDataError(e)) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong saving that. Try again, and if it keeps happening tell the central team." };
  }
}

async function clientIp() {
  const h = await headers();
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

// ---------- auth ----------

const emailSchema = z.email("Enter a valid email address.").max(200);

export async function signIn(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { ok: false, error: email.error.issues[0].message };
  if (!rateLimit(`login:${await clientIp()}`, 10, 15 * 60_000) || !rateLimit(`login:${email.data}`, 8, 15 * 60_000))
    return { ok: false, error: "Too many attempts. Wait 15 minutes, or reset your password." };
  try {
    await data.signInWithPassword(email.data, String(form.get("password") ?? ""));
  } catch (e) {
    return { ok: false, error: data.isDataError(e) ? e.message : "Sign in failed. Try again." };
  }
  const u = await data.currentUser();
  if (!u) redirect("/no-access");
  const org = await data.getOrg();
  redirect(u.role === "viewer" ? `/c/${org.slug}` : "/app");
}

export async function signOut() {
  await data.signOutEverywhere();
  redirect("/login");
}

export async function requestPasswordReset(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!email.success) return { ok: false, error: email.error.issues[0].message };
  if (!rateLimit(`reset:${await clientIp()}`, 5, 60 * 60_000) || !rateLimit(`reset:${email.data}`, 3, 60 * 60_000))
    return { ok: false, error: "Too many reset requests. Try again in an hour." };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  await data.sendPasswordReset(email.data, `${origin}/auth/callback?next=/auth/set-password`);
  return { ok: true };
}

export async function setPassword(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const pw = String(form.get("password") ?? "");
  if (pw.length < 10) return { ok: false, error: "Use at least 10 characters." };
  if (pw !== String(form.get("confirm") ?? "")) return { ok: false, error: "The two passwords don't match." };
  try {
    await data.setNewPassword(pw);
  } catch (e) {
    return { ok: false, error: data.isDataError(e) ? e.message : "That password couldn't be saved." };
  }
  redirect("/app");
}

// ---------- recipes ----------

export async function createRecipeAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const kind = form.get("kind") === "batch" ? "batch" : "dish";
  const name = String(form.get("name") ?? "");
  let newId = "";
  const res = await run(async () => {
    newId = (await data.createRecipe({ kind, name })).id;
  });
  if (res.ok) redirect(`/app/recipes/${newId}`);
  return res;
}

export async function saveRecipeAction(input: {
  recipeId: string;
  expectedUpdatedAt: string;
  details: Parameters<typeof data.saveRecipe>[2]["details"];
  lines: Omit<RecipeLine, "id" | "sort">[];
  overrides: Recipe["overrides"];
}): Promise<ActionResult<string>> {
  return run(() => data.saveRecipe(input.recipeId, input.expectedUpdatedAt, { details: input.details, lines: input.lines, overrides: input.overrides }));
}

const MAX_PHOTO = 4 * 1024 * 1024;
export async function uploadRecipePhotoAction(recipeId: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new data.DataError("Choose a photo first.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new data.DataError("Use a JPG, PNG or WebP photo.");
    if (file.size > MAX_PHOTO) throw new data.DataError("That photo is over 4 MB even after resizing. Try a smaller one.");
    await data.uploadRecipePhoto(recipeId, file);
  });
}

export async function removeRecipePhotoAction(recipeId: string): Promise<ActionResult> {
  return run(() => data.setRecipePhoto(recipeId, null));
}

// ---------- products ----------

export async function saveProductAction(input: Omit<Product, "id" | "updatedAt" | "archived"> & { id?: string }): Promise<ActionResult<string>> {
  return run(async () => (await data.upsertProduct(input)).id);
}

export async function addSupplierAction(name: string): Promise<ActionResult<{ id: string; name: string }>> {
  return run(() => data.upsertSupplier({ name }));
}

export type UploadOutcome = { added: number; updated: number; failed: { line: number; name: string; error: string }[] };

/**
 * Saves one batch of uploaded product rows (the browser sends the file in batches).
 * A row matches an existing product by supplier and supplier code, or failing that supplier and name.
 * Fields the file doesn't have keep their current value on existing products.
 * Allergens from the file count as confirmed only when `confirmed` is true.
 */
export async function uploadProductsAction(rows: UploadRow[], present: UploadField[], confirmed: boolean): Promise<ActionResult<UploadOutcome>> {
  if (!Array.isArray(rows) || rows.length > UPLOAD_CHUNK) return { ok: false, error: "Send the file in smaller batches." };
  const has = new Set(present);
  return run(async () => {
    const [suppliers, products] = await Promise.all([data.listSuppliers(), data.listProducts()]);
    const supplierIds = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
    const byCode = new Map<string, Product>();
    const byName = new Map<string, Product>();
    for (const p of products) {
      const sup = p.supplierId ? supplierName.get(p.supplierId) ?? null : null;
      const c = matchKey.code(sup, p.supplierCode);
      if (c) byCode.set(c, p);
      byName.set(matchKey.name(sup, p.name), p);
    }
    const out: UploadOutcome = { added: 0, updated: 0, failed: [] };
    for (const r of rows) {
      try {
        let supplierId: string | null = null;
        if (r.supplier) {
          supplierId = supplierIds.get(r.supplier.toLowerCase()) ?? null;
          if (!supplierId) {
            const s = await data.upsertSupplier({ name: r.supplier });
            supplierId = s.id;
            supplierIds.set(r.supplier.toLowerCase(), s.id);
            supplierName.set(s.id, s.name);
          }
        }
        const existing = (r.code && byCode.get(matchKey.code(r.supplier, r.code)!)) || byName.get(matchKey.name(r.supplier, r.name));
        const keep = <T,>(field: UploadField[], fromFile: T, current: T | undefined, fallback: T) =>
          field.some((f) => has.has(f)) ? fromFile : existing ? (current as T) : fallback;
        const allergensFromFile = r.allergens !== null;
        const saved = await data.upsertProduct({
          id: existing?.id,
          name: r.name,
          supplierId: r.supplier ? supplierId : existing?.supplierId ?? null,
          supplierCode: keep(["code"], r.code, existing?.supplierCode, null),
          baseUnit: keep(["packSize", "unit"], r.baseUnit, existing?.baseUnit, "g"),
          packSize: keep(["packSize"], r.packSize, existing?.packSize, null),
          packCostPence: keep(["packCost"], r.packCostPence, existing?.packCostPence, null),
          eachWeightG: keep(["eachWeight"], r.eachWeightG, existing?.eachWeightG, null),
          densityGPerMl: existing?.densityGPerMl ?? null,
          allergens: allergensFromFile ? r.allergens! : existing?.allergens ?? [],
          allergenStatus: allergensFromFile ? (confirmed ? "complete" : "unknown") : existing?.allergenStatus ?? "unknown",
          dietIds: r.dietIds ?? existing?.dietIds ?? [],
          nutritionPer100: r.nutritionPer100 ? { ...(existing?.nutritionPer100 ?? {}), ...r.nutritionPer100 } : existing?.nutritionPer100 ?? {},
        });
        if (existing) out.updated++; else out.added++;
        const sup = saved.supplierId ? supplierName.get(saved.supplierId) ?? null : null;
        const c = matchKey.code(sup, saved.supplierCode);
        if (c) byCode.set(c, saved);
        byName.set(matchKey.name(sup, saved.name), saved);
      } catch (e) {
        if (!data.isDataError(e)) console.error(e);
        out.failed.push({ line: r.line, name: r.name, error: data.isDataError(e) ? e.message : "Couldn't be saved." });
      }
    }
    return out;
  });
}

// ---------- menus ----------

export async function createMenuAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  let newId = "";
  const res = await run(async () => {
    newId = (await data.createMenu({ name: String(form.get("name") ?? "") })).id;
  });
  if (res.ok) redirect(`/app/menus/${newId}`);
  return res;
}

export async function saveMenuDetailsAction(menuId: string, d: Parameters<typeof data.updateMenuDetails>[1]): Promise<ActionResult> {
  return run(() => data.updateMenuDetails(menuId, d));
}

export async function saveMenuRowsAction(menuId: string, rows: MenuRow[]): Promise<ActionResult> {
  return run(() => data.saveMenuRows(menuId, rows));
}

export async function copyMenuAction(menuId: string): Promise<ActionResult> {
  let newId = "";
  const res = await run(async () => {
    const m = await data.getMenu(menuId);
    newId = (await data.copyMenu(menuId, `${m?.name ?? "Menu"} (copy)`)).id;
  });
  if (res.ok) redirect(`/app/menus/${newId}`);
  return res;
}

export async function isDemoMode() {
  return !useSupabase;
}

// ---------- milestone 2: brands, sites, publishing, people ----------

export async function saveBrandAction(input: Omit<Brand, "id" | "updatedAt" | "logoPath"> & { id?: string }): Promise<ActionResult<string>> {
  return run(async () => (await data.upsertBrand(input)).id);
}

export async function uploadBrandLogoAction(brandId: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new data.DataError("Choose a logo first.");
    if (!/^image\/(jpeg|png)$/.test(file.type)) throw new data.DataError("Use a PNG or JPG logo.");
    if (file.size > MAX_PHOTO) throw new data.DataError("That logo is over 4 MB.");
    await data.setBrandLogo(brandId, file);
  });
}

export async function removeBrandLogoAction(brandId: string): Promise<ActionResult> {
  return run(() => data.setBrandLogo(brandId, null));
}

export async function saveSiteAction(input: Omit<Site, "id"> & { id?: string }): Promise<ActionResult<string>> {
  return run(async () => (await data.upsertSite(input)).id);
}

export async function setMenuBrandsAction(menuId: string, brandIds: string[]): Promise<ActionResult> {
  return run(() => data.setMenuBrands(menuId, brandIds));
}

export async function stageMenuAction(brandId: string, menuId: string): Promise<ActionResult> {
  return run(() => data.stageMenu(brandId, menuId));
}

export async function pushLiveAction(pubId: string, liveFrom: string | null): Promise<ActionResult> {
  return run(() => data.pushLive(pubId, liveFrom));
}

export async function unpublishAction(pubId: string): Promise<ActionResult> {
  return run(() => data.unpublish(pubId));
}

export async function movePublicationAction(pubId: string, dir: -1 | 1): Promise<ActionResult> {
  return run(() => data.movePublication(pubId, dir));
}

export async function setAutoRefreshAction(pubId: string, on: boolean): Promise<ActionResult> {
  return run(() => data.setAutoRefresh(pubId, on));
}

export async function approveRefreshAction(pubId: string): Promise<ActionResult> {
  return run(() => data.approveRefresh(pubId));
}

export async function inviteMemberAction(input: { email: string; name: string; role: User["role"]; brandId: string | null }): Promise<ActionResult> {
  if (!rateLimit(`invite:${await clientIp()}`, 30, 60 * 60_000)) return { ok: false, error: "Too many invites in an hour. Try again later." };
  return run(() => data.inviteMember(input));
}

export async function deleteMemberAction(userId: string): Promise<ActionResult> {
  return run(() => data.deleteMember(userId));
}

export async function updateMemberAction(userId: string, patch: { role?: User["role"]; brandId?: string | null; status?: "active" | "disabled" }): Promise<ActionResult> {
  return run(() => data.updateMember(userId, patch));
}

// Landing page early list. A hidden "website" field catches simple bots; 5 tries per 10 minutes per address.
export async function joinEarlyListAction(_prev: { ok: boolean; message: string } | null, form: FormData): Promise<{ ok: boolean; message: string }> {
  if (!PUBLIC_LANDING) return { ok: false, message: "The early list isn't open." };
  if (String(form.get("website") ?? "")) return { ok: true, message: "Thanks, you're on the list." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`early:${ip}`, 5, 10 * 60_000)) return { ok: false, message: "That's a few tries in a row. Please wait a few minutes and try again." };
  try {
    await data.joinEarlyList({
      email: String(form.get("email") ?? ""), name: String(form.get("name") ?? ""),
      company: String(form.get("company") ?? ""), sites: Number(form.get("sites") ?? 0),
    });
    return { ok: true, message: "Thanks, you're on the list. We'll be in touch." };
  } catch (e) {
    return { ok: false, message: data.isDataError(e) ? e.message : "We couldn't save that just now. Please try again in a minute." };
  }
}

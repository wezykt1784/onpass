"use server";
// Server actions. Each one checks the user (inside the data layer), validates, writes, then refreshes the page.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import fs from "node:fs";
import path from "node:path";
import * as data from "./data";
import { uploadsDir } from "./data/store";
import type { MenuRow, Product, Recipe, RecipeLine } from "./types";

export type ActionResult<T = unknown> = { ok: true; value?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const value = await fn();
    refresh();
    return { ok: true, value };
  } catch (e) {
    if (e instanceof data.DataError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong saving that. Try again, and if it keeps happening tell the central team." };
  }
}

// ---------- session (fake until /replica-backend) ----------

export async function signIn(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const users = await data.listUsers();
  const u = users.find((x) => x.email === email);
  if (!u) return { ok: false, error: "We don't recognise that email. Check it, or ask your admin to invite you." };
  (await cookies()).set("spec_user", u.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect(u.role === "viewer" ? `/c/demo` : "/app");
}

export async function signOut() {
  (await cookies()).delete("spec_user");
  redirect("/login");
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
  details: Parameters<typeof data.updateRecipe>[1];
  lines: Omit<RecipeLine, "id" | "sort">[];
  overrides: Recipe["overrides"];
}): Promise<ActionResult<string>> {
  return run(async () => {
    // Lines first, then details; each bumps updatedAt, so carry it forward.
    let r = await data.saveRecipeLines(input.recipeId, input.lines, input.expectedUpdatedAt);
    r = await data.setAllergenOverrides(input.recipeId, input.overrides, r.updatedAt);
    r = await data.updateRecipe(input.recipeId, input.details, r.updatedAt);
    return r.updatedAt;
  });
}

const MAX_PHOTO = 4 * 1024 * 1024;
export async function uploadRecipePhotoAction(recipeId: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    await data.requireEditor();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) throw new data.DataError("Choose a photo first.");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new data.DataError("Use a JPG, PNG or WebP photo.");
    if (file.size > MAX_PHOTO) throw new data.DataError("That photo is over 4 MB even after resizing. Try a smaller one.");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const name = `${recipeId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await file.arrayBuffer()));
    await data.setRecipePhoto(recipeId, name);
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

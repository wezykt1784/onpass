// Publishing rules shared by both data layers. Pure functions, no I/O.
import type { GuestSettings, MenuSnapshot, Publication } from "./types";

/** A staging row whose go-live time has passed counts as live. Latest wins per menu. */
export function effectiveLive(pubs: Publication[], now = new Date()): Publication[] {
  const byMenu = new Map<string, Publication>();
  const when = (p: Publication) => p.liveFrom ?? p.updatedAt;
  for (const p of pubs) {
    const live = p.stage === "live" || (p.liveFrom != null && new Date(p.liveFrom) <= now);
    if (!live) continue;
    const cur = byMenu.get(p.menuId);
    if (!cur || when(p) > when(cur)) byMenu.set(p.menuId, p);
  }
  return [...byMenu.values()].sort((a, b) => a.sort - b.sort);
}

/** Use the up-to-date version unless it would show a guest a dish with unconfirmed allergens. */
export function guestVersion(stored: MenuSnapshot, fresh: MenuSnapshot | null, autoRefresh: boolean): MenuSnapshot {
  if (autoRefresh && fresh && !fresh.hasUnknownAllergens) return fresh;
  return stored;
}

export interface MissingInfo {
  blocking: string[]; // stops going live
  warnings: string[]; // shown, doesn't stop
}

export function missingInfo(s: MenuSnapshot, guest: GuestSettings): MissingInfo {
  const dishes = s.sections.flatMap((x) => x.rows.flatMap((r) => (r.kind === "item" ? [r.dish] : [])));
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!dishes.length) blocking.push("The menu has no dishes.");
  for (const d of dishes) if (d.unknown) blocking.push(`${d.name}: allergen data not confirmed for every ingredient.`);
  for (const d of dishes) if (d.pricePence == null) warnings.push(`${d.name}: no price.`);
  if (guest.showKcal) for (const d of dishes) if (d.kcal == null) warnings.push(`${d.name}: calories incomplete.`);
  return { blocking, warnings };
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

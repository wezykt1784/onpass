import type { Allergen, Diet } from "./types";

export const money = (pence: number | null | undefined) =>
  pence == null ? "" : `£${(pence / 100).toFixed(2)}`;

export const qty = (n: number, unit: string) => {
  const s = Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
  return `${s} ${unit}`;
};

export const dateUk = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/London" });
};

export const dateTimeUk = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

/**
 * Allergen names for display. Sub-types always show with their parent:
 * ["al-gluten.wheat", "al-milk"] -> ["Cereals containing gluten (wheat)", "Milk"]
 */
export function allergenNames(ids: string[], all: Allergen[]): string[] {
  const byId = new Map(all.map((a) => [a.id, a]));
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) continue;
    const parent = a.parentId ? byId.get(a.parentId) : null;
    const key = parent ? parent.id : a.id;
    if (!groups.has(key)) groups.set(key, []);
    if (parent) groups.get(key)!.push(a.name.toLowerCase());
  }
  return [...groups.entries()]
    .sort((x, y) => (byId.get(x[0])?.sort ?? 99) - (byId.get(y[0])?.sort ?? 99))
    .map(([key, subs]) => {
      const name = byId.get(key)?.name ?? key;
      return subs.length ? `${name} (${subs.join(", ")})` : name;
    });
}

/** Top-level allergen ids a set rolls up to (wheat -> gluten). Used for guest filters. */
export function topLevelAllergens(ids: string[], all: Allergen[]): Set<string> {
  const byId = new Map(all.map((a) => [a.id, a]));
  return new Set(ids.map((id) => byId.get(id)?.parentId ?? id));
}

export const dietNames = (ids: string[], all: Diet[]) =>
  all.filter((d) => ids.includes(d.id)).map((d) => d.name);

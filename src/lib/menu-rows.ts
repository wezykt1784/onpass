import type { MenuRow, MenuSnapshot, SnapshotDish, SnapshotSection } from "./types";

export const MAX_MENU_DISHES = 250;

/** Every dish row on a menu, in menu order: plain dishes and the options inside build-your-own groups. */
export function itemRows(rows: MenuRow[]): MenuRow[] {
  const out: MenuRow[] = [];
  const walk = (list: MenuRow[]) => {
    for (const r of list) {
      if (r.kind === "item") out.push(r);
      if (r.children) walk(r.children);
    }
  };
  walk(rows);
  return out;
}

/** The dishes guests can order from one section of a snapshot, options included. */
export function sectionDishes(sec: SnapshotSection): SnapshotDish[] {
  return sec.rows.flatMap((r) => (r.kind === "item" ? [r.dish] : r.kind === "byo" ? r.options : []));
}

export function snapshotDishes(s: MenuSnapshot): SnapshotDish[] {
  return s.sections.flatMap(sectionDishes);
}

/**
 * Checks a content builder tree before it's saved. Same rules as save_menu_rows in SQL.
 * Returns what to fix, in a chef's words, or null when it's fine.
 */
export function rowsProblem(rows: MenuRow[], recipeExists: (id: string) => boolean): string | null {
  if (itemRows(rows).length > MAX_MENU_DISHES) return `A menu can hold at most ${MAX_MENU_DISHES} dishes, options included.`;
  for (const sec of rows) {
    if (sec.kind !== "section") return "Dishes must sit inside a section.";
    if (!sec.title?.trim()) return "Every section needs a name.";
    for (const row of sec.children ?? []) {
      if (row.kind === "section") return "A section can't sit inside another section.";
      if (row.kind === "item" && (!row.recipeId || !recipeExists(row.recipeId))) return "A dish on this menu no longer exists.";
      if (row.kind === "byo") {
        const name = row.title?.trim();
        if (!name) return `Give the build-your-own group in "${sec.title}" a name, like "Build your burger".`;
        const opts = row.children ?? [];
        if (opts.length === 0) return `"${name}" needs at least one option for guests to choose.`;
        for (const o of opts) {
          if (o.kind !== "item") return `"${name}" can only hold dishes.`;
          if (!o.recipeId || !recipeExists(o.recipeId)) return `An option in "${name}" no longer exists.`;
        }
      }
    }
  }
  return null;
}

/**
 * Sections for the spec book: every dish in menu order, build-your-own options flattened in
 * with the group's name, so each option gets its own spec page.
 */
export function specSections<T>(rows: MenuRow[], dish: (row: MenuRow, group: string | null) => T | null) {
  return rows.map((sec) => ({
    title: sec.title ?? "",
    dishes: (sec.children ?? []).flatMap((row) => {
      if (row.kind === "item") { const d = dish(row, null); return d ? [d] : []; }
      if (row.kind === "byo") return (row.children ?? []).flatMap((o) => { const d = dish(o, row.title ?? null); return d ? [d] : []; });
      return [];
    }),
  }));
}

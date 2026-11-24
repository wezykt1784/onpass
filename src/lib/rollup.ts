// Allergen, diet, nutrition and cost roll-up. Same rules as compute_rollup() in replica/schema.sql:
// - contains / may contain: union over every product reached through nested batch recipes, plus overrides at any level
// - contains wins over may contain
// - unknown: products whose allergen data isn't complete (blocks going live)
// - a diet applies only if every product carries it
// - nutrition per portion from per-100 g/ml values; incomplete if any amount can't be converted
import type { BaseUnit, Product, Recipe, Rollup, Unit } from "./types";

export function toBase(qty: number, unit: Unit, base: BaseUnit, eachG: number | null, density: number | null): number | null {
  const d = density ?? 1;
  if (base === "g") {
    if (unit === "g") return qty;
    if (unit === "kg") return qty * 1000;
    if (unit === "ml") return qty * d;
    if (unit === "l") return qty * 1000 * d;
    if (unit === "ea") return eachG == null ? null : qty * eachG;
  }
  if (base === "ml") {
    if (unit === "ml") return qty;
    if (unit === "l") return qty * 1000;
    if (unit === "g") return d ? qty / d : null;
    if (unit === "kg") return d ? (qty * 1000) / d : null;
    return null;
  }
  if (base === "ea") return unit === "ea" ? qty : null;
  return null;
}

export function toYield(qty: number, unit: Unit, yieldUnit: BaseUnit): number | null {
  if (yieldUnit === "g") return unit === "g" || unit === "ml" ? qty : unit === "kg" || unit === "l" ? qty * 1000 : null;
  if (yieldUnit === "ml") return unit === "ml" || unit === "g" ? qty : unit === "l" || unit === "kg" ? qty * 1000 : null;
  if (yieldUnit === "ea") return unit === "ea" ? qty : null;
  return null;
}

interface Reached {
  product: Product;
  baseQty: number | null;
}

export function computeRollup(
  recipeId: string,
  recipes: Map<string, Recipe>,
  products: Map<string, Product>,
): Rollup {
  const root = recipes.get(recipeId);
  if (!root) throw new Error("Recipe not found");
  const reached: Reached[] = [];
  const overrides: { allergenId: string; level: "contains" | "may_contain" }[] = [];

  const walk = (r: Recipe, factor: number | null, path: Set<string>) => {
    overrides.push(...r.overrides);
    for (const line of r.lines) {
      if (line.productId) {
        const p = products.get(line.productId);
        if (!p) continue;
        const b = toBase(line.quantity, line.unit, p.baseUnit, p.eachWeightG, p.densityGPerMl);
        reached.push({ product: p, baseQty: factor == null || b == null ? null : factor * b });
      } else if (line.subRecipeId) {
        if (path.has(line.subRecipeId)) continue; // loop guard; the editor refuses loops anyway
        const sub = recipes.get(line.subRecipeId);
        if (!sub) continue;
        const y = sub.yieldUnit ? toYield(line.quantity, line.unit, sub.yieldUnit) : null;
        const f = factor == null || y == null || !sub.yieldQty ? null : (factor * y) / sub.yieldQty;
        walk(sub, f, new Set([...path, sub.id]));
      }
    }
  };
  walk(root, 1, new Set([root.id]));

  const level = new Map<string, "contains" | "may_contain">();
  const add = (id: string, l: "contains" | "may_contain") => {
    if (level.get(id) === "contains") return;
    level.set(id, l);
  };
  for (const { product } of reached) for (const a of product.allergens) add(a.allergenId, a.level);
  for (const o of overrides) add(o.allergenId, o.level);

  const portions = root.portions > 0 ? root.portions : 1;
  const any = reached.length > 0;

  const dietSets = reached.map((r) => new Set(r.product.dietIds));
  const diets = any ? [...dietSets[0]].filter((d) => dietSets.every((s) => s.has(d))) : [];

  const nutrition: Record<string, number> = {};
  let nutritionComplete = any;
  for (const { product, baseQty } of reached) {
    const mass = baseQty == null ? null : product.baseUnit === "ea" ? (product.eachWeightG == null ? null : baseQty * product.eachWeightG) : baseQty;
    const keys = Object.keys(product.nutritionPer100);
    if (mass == null || keys.length === 0) nutritionComplete = false;
    if (mass == null) continue;
    for (const k of keys) nutrition[k] = (nutrition[k] ?? 0) + (product.nutritionPer100[k] * mass) / 100;
  }
  for (const k of Object.keys(nutrition)) nutrition[k] = Math.round((nutrition[k] / portions) * 10) / 10;

  let cost: number | null = any ? 0 : null;
  for (const { product, baseQty } of reached) {
    if (cost == null) break;
    if (baseQty == null || product.packCostPence == null || !product.packSize) cost = null;
    else cost += (product.packCostPence / product.packSize) * baseQty;
  }

  return {
    contains: [...level].filter(([, l]) => l === "contains").map(([id]) => id),
    mayContain: [...level].filter(([, l]) => l === "may_contain").map(([id]) => id),
    unknownProducts: [...new Set(reached.filter((r) => r.product.allergenStatus === "unknown").map((r) => r.product.id))],
    diets,
    nutritionPerPortion: nutrition,
    nutritionComplete,
    costPerPortionPence: cost == null ? null : Math.round(cost / portions),
  };
}

/** True if adding `subId` as a line of `recipeId` would create a loop. */
export function wouldLoop(recipeId: string, subId: string, recipes: Map<string, Recipe>): boolean {
  if (recipeId === subId) return true;
  const stack = [subId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === recipeId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const l of recipes.get(id)?.lines ?? []) if (l.subRecipeId) stack.push(l.subRecipeId);
  }
  return false;
}

// Product upload: turns rows from a supplier price list (CSV or Excel) into products.
// Shared by the browser preview and the server, so both read a row the same way.
import type { Allergen, AllergenLevel, BaseUnit, Diet } from "./types";

export const MAX_UPLOAD_ROWS = 2000;
export const UPLOAD_CHUNK = 25;

export type UploadField =
  | "name" | "supplier" | "code" | "unit" | "packSize" | "packCost" | "eachWeight"
  | "contains" | "mayContain" | "diets" | "kcal" | "fat" | "salt";

/** Column headings we recognise, after lower-casing and dropping everything but letters and digits. */
const HEADINGS: Record<UploadField, string[]> = {
  name: ["name", "product", "productname", "description", "productdescription", "item", "itemname", "itemdescription"],
  supplier: ["supplier", "suppliername", "vendor", "brand"],
  code: ["code", "suppliercode", "productcode", "sku", "itemcode", "ref", "reference", "stockcode"],
  unit: ["unit", "units", "uom", "unitofmeasure", "measuredin", "baseunit"],
  packSize: ["packsize", "pack", "size", "quantity", "qty", "packqty", "packquantity", "weight", "volume"],
  packCost: ["packcost", "cost", "price", "packprice", "costprice", "casecost", "caseprice", "unitprice", "packcostgbp"],
  eachWeight: ["eachweight", "eachweightg", "weightofone", "weightofoneg", "unitweight", "unitweightg"],
  contains: ["allergens", "contains", "allergen", "allergeninfo", "containsallergens"],
  mayContain: ["maycontain", "maycontainallergens", "traces", "crosscontamination", "maycontaintraces"],
  diets: ["diet", "diets", "suitablefor", "dietary"],
  kcal: ["kcal", "energy", "energykcal", "kcalper100", "kcalper100g", "kcal100g", "calories"],
  fat: ["fat", "fatg", "fatper100", "fatper100g", "totalfat"],
  salt: ["salt", "saltg", "saltper100", "saltper100g"],
};

export const FIELD_LABELS: Record<UploadField, string> = {
  name: "Product name", supplier: "Supplier", code: "Supplier code", unit: "Measured in", packSize: "Pack size",
  packCost: "Pack cost (£)", eachWeight: "Weight of one (g)", contains: "Contains", mayContain: "May contain",
  diets: "Suitable for", kcal: "Energy (kcal per 100)", fat: "Fat (g per 100)", salt: "Salt (g per 100)",
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Which column holds which field. Unrecognised columns are ignored. */
export function matchColumns(headers: string[]): Partial<Record<UploadField, number>> {
  const out: Partial<Record<UploadField, number>> = {};
  headers.forEach((h, i) => {
    const k = squash(h);
    if (!k) return;
    for (const f of Object.keys(HEADINGS) as UploadField[]) {
      if (out[f] === undefined && HEADINGS[f].includes(k)) { out[f] = i; return; }
    }
  });
  return out;
}

/** What the server needs for one row. Allergens and diets are ids; null means "the file doesn't say". */
export interface UploadRow {
  line: number;
  name: string;
  supplier: string | null;
  code: string | null;
  baseUnit: BaseUnit;
  packSize: number | null;
  packCostPence: number | null;
  eachWeightG: number | null;
  allergens: { allergenId: string; level: AllergenLevel }[] | null;
  dietIds: string[] | null;
  nutritionPer100: Record<string, number> | null;
}

export interface ReadRow { row: UploadRow | null; problems: string[] }

const ALLERGEN_ALIASES: Record<string, string> = {
  gluten: "gluten", cereals: "gluten", cerealscontaininggluten: "gluten", wheat: "gluten.wheat", rye: "gluten.rye",
  barley: "gluten.barley", oats: "gluten.oats", oat: "gluten.oats", spelt: "gluten.wheat", kamut: "gluten.wheat",
  crustacean: "crustaceans", crustaceans: "crustaceans", egg: "eggs", eggs: "eggs", fish: "fish",
  peanut: "peanuts", peanuts: "peanuts", soy: "soya", soya: "soya", soybean: "soya", soybeans: "soya",
  milk: "milk", dairy: "milk", lactose: "milk", nut: "nuts", nuts: "nuts", treenut: "nuts", treenuts: "nuts",
  almond: "nuts.almond", almonds: "nuts.almond", hazelnut: "nuts.hazelnut", hazelnuts: "nuts.hazelnut",
  walnut: "nuts.walnut", walnuts: "nuts.walnut", cashew: "nuts.cashew", cashews: "nuts.cashew", pecan: "nuts.pecan",
  pecans: "nuts.pecan", brazil: "nuts.brazil", brazilnut: "nuts.brazil", brazilnuts: "nuts.brazil",
  pistachio: "nuts.pistachio", pistachios: "nuts.pistachio", macadamia: "nuts.macadamia", macadamias: "nuts.macadamia",
  macadamianut: "nuts.macadamia", macadamianuts: "nuts.macadamia", queenslandnut: "nuts.macadamia",
  celery: "celery", celeriac: "celery", mustard: "mustard", sesame: "sesame", sesameseeds: "sesame",
  sulphites: "sulphites", sulphite: "sulphites", sulfites: "sulphites", sulphurdioxide: "sulphites",
  sulphurdioxidesulphites: "sulphites", so2: "sulphites", lupin: "lupin", lupine: "lupin", mollusc: "molluscs",
  molluscs: "molluscs", mollusk: "molluscs", mollusks: "molluscs", garlic: "garlic_onion", onion: "garlic_onion",
  garliconion: "garlic_onion",
};
const NONE = new Set(["", "none", "no", "n", "nil", "na", "n/a", "-", "0", "free from all", "nothing"]);

/** One allergen from a word or name ("dairy", "Cereals containing gluten", "Wheat"), or null. */
export function allergenFromText(text: string, allergens: Allergen[]): Allergen | null {
  const k = squash(text);
  if (!k) return null;
  const byName = allergens.find((a) => squash(a.name) === k || squash(a.code) === k);
  const code = byName?.code ?? ALLERGEN_ALIASES[k];
  return (code && allergens.find((x) => x.code === code)) || null;
}

function readAllergens(text: string, level: AllergenLevel, allergens: Allergen[], problems: string[], label: string) {
  const out: { allergenId: string; level: AllergenLevel }[] = [];
  if (NONE.has(text.trim().toLowerCase())) return out;
  for (const raw of text.split(/[,;/|\n]+|\band\b/i)) {
    const t = raw.trim();
    if (NONE.has(t.toLowerCase())) continue;
    const a = allergenFromText(t, allergens);
    if (!a) { problems.push(`${label}: "${t}" isn't an allergen we know. Use a name like Milk, Wheat or Mustard.`); continue; }
    if (!out.some((x) => x.allergenId === a.id)) out.push({ allergenId: a.id, level });
  }
  return out;
}

function readNumber(v: unknown): number | null | undefined {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const s = String(v).trim().replace(/^£/, "").replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** "2.5kg", "500 g", "1L", "6" with a unit column. Returns the size in the base unit. */
function readPack(sizeCell: unknown, unitCell: unknown, problems: string[]): { unit: BaseUnit; size: number | null } {
  const unitText = unitCell == null ? "" : String(unitCell).trim().toLowerCase();
  const sizeText = sizeCell == null ? "" : String(sizeCell).trim().toLowerCase().replace(/,/g, "");
  const m = sizeText.match(/^(\d+(?:\.\d+)?)\s*([a-z]*)$/);
  if (sizeText && !m) problems.push(`Pack size "${sizeCell}" isn't a number. Use something like 2.5kg, 500g or 12.`);
  const n = m ? Number(m[1]) : null;
  const u = (m?.[2] || unitText).replace(/s$/, "");
  const table: Record<string, [BaseUnit, number]> = {
    g: ["g", 1], gram: ["g", 1], gm: ["g", 1], kg: ["g", 1000], kilo: ["g", 1000], kilogram: ["g", 1000],
    ml: ["ml", 1], millilitre: ["ml", 1], milliliter: ["ml", 1], cl: ["ml", 10], l: ["ml", 1000], ltr: ["ml", 1000],
    litre: ["ml", 1000], liter: ["ml", 1000], ea: ["ea", 1], each: ["ea", 1], pc: ["ea", 1], piece: ["ea", 1],
    unit: ["ea", 1], x: ["ea", 1], "": ["g", 1],
  };
  const hit = table[u];
  if (!hit) { problems.push(`Unit "${m?.[2] || unitCell}" isn't one we know. Use g, kg, ml, l or each.`); return { unit: "g", size: null }; }
  if (!u && n != null && !unitText) problems.push("Say what the pack size is measured in: add g, kg, ml, l or each, or a Unit column.");
  return { unit: hit[0], size: n == null ? null : Math.round(n * hit[1] * 1000) / 1000 };
}

/** Reads one spreadsheet row. `has` says which optional columns the file has at all. */
export function readRow(cells: unknown[], line: number, cols: Partial<Record<UploadField, number>>, allergens: Allergen[], diets: Diet[]): ReadRow {
  const problems: string[] = [];
  const cell = (f: UploadField) => (cols[f] === undefined ? undefined : cells[cols[f]!]);
  const text = (f: UploadField) => { const v = cell(f); return v == null ? "" : String(v).trim(); };

  const name = text("name");
  if (!name) return { row: null, problems: ["No product name."] };
  if (name.length > 160) problems.push("The name is longer than 160 characters.");

  const { unit, size } = readPack(cell("packSize"), cell("unit"), problems);
  const cost = readNumber(cell("packCost"));
  if (cost === undefined || (cost != null && cost < 0)) problems.push(`Pack cost "${text("packCost")}" isn't an amount. Use something like 12.50.`);
  const each = readNumber(cell("eachWeight"));
  if (each === undefined || (each != null && each <= 0)) problems.push(`Weight of one "${text("eachWeight")}" isn't a number of grams.`);

  const hasAllergens = cols.contains !== undefined || cols.mayContain !== undefined;
  let list: UploadRow["allergens"] = null;
  if (hasAllergens) {
    const contains = cols.contains !== undefined ? readAllergens(text("contains"), "contains", allergens, problems, "Contains") : [];
    const may = cols.mayContain !== undefined ? readAllergens(text("mayContain"), "may_contain", allergens, problems, "May contain") : [];
    list = [...contains, ...may.filter((m) => !contains.some((c) => c.allergenId === m.allergenId))];
  }

  let dietIds: string[] | null = null;
  if (cols.diets !== undefined) {
    dietIds = [];
    for (const t of text("diets").split(/[,;/|]+/).map((x) => x.trim()).filter((x) => x && !NONE.has(x.toLowerCase()))) {
      const k = squash(t);
      const d = diets.find((x) => squash(x.name) === k || squash(x.short) === k || squash(x.code) === k);
      if (!d) problems.push(`Suitable for: "${t}" isn't a diet we know (${diets.map((x) => x.short).join(", ")}).`);
      else if (!dietIds.includes(d.id)) dietIds.push(d.id);
    }
  }

  let nutrition: Record<string, number> | null = null;
  for (const [f, key] of [["kcal", "kcal"], ["fat", "fat_g"], ["salt", "salt_g"]] as const) {
    if (cols[f] === undefined) continue;
    const n = readNumber(cell(f));
    if (n === undefined || (n != null && n < 0)) { problems.push(`${FIELD_LABELS[f]} "${text(f)}" isn't a number.`); continue; }
    nutrition ??= {};
    if (n != null) nutrition[key] = n;
  }

  const code = text("code") || null;
  if (code && code.length > 60) problems.push("The supplier code is longer than 60 characters.");
  const supplier = text("supplier") || null;
  if (supplier && supplier.length > 120) problems.push("The supplier name is longer than 120 characters.");

  return {
    problems,
    row: problems.length ? null : {
      line, name, supplier, code, baseUnit: unit, packSize: size,
      packCostPence: cost == null ? null : Math.round(cost * 100),
      eachWeightG: unit === "ea" ? (each ?? null) : null,
      allergens: list, dietIds, nutritionPer100: nutrition,
    },
  };
}

/** Finds the heading row: the first of the top 10 rows that names a product column. */
export function findHeader(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (matchColumns(rows[i].map((c) => (c == null ? "" : String(c)))).name !== undefined) return i;
  }
  return -1;
}

/** Same supplier and code, or failing that the same supplier and name. */
export const matchKey = {
  code: (supplier: string | null, code: string | null) => (code ? `${(supplier ?? "").toLowerCase()}\u0000${code.toLowerCase()}` : null),
  name: (supplier: string | null, name: string) => `${(supplier ?? "").toLowerCase()}\u0000${name.trim().toLowerCase()}`,
};

export const TEMPLATE_CSV = [
  "Product name,Supplier,Supplier code,Pack size,Pack cost,Weight of one (g),Contains,May contain,Suitable for,kcal per 100,Fat per 100,Salt per 100",
  "Salted butter,Brakes,BR-1001,2.5kg,14.20,,Milk,,V,744,82,1.5",
  "Brioche bun,Brakes,BR-2210,24 each,9.60,75,\"Wheat, Eggs, Milk\",Sesame,V,290,7.5,1",
  "Rapeseed oil,Booker,BK-0450,5l,11.99,,,,\"VG, V\",824,92,0",
].join("\n");

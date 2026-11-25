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

// ---------- Zonal exports (Price change, Nutrition and Allergen templates) ----------

export type ZonalKind = "price" | "nutrition" | "allergen";
export const ZONAL_LABEL: Record<ZonalKind, string> = { price: "Zonal price change template", nutrition: "Zonal nutrition template", allergen: "Zonal allergen template" };

/** Which Zonal export this is, from its heading row. */
export function detectZonal(headers: string[]): ZonalKind | null {
  const h = new Set(headers.map((x) => x.trim().toLowerCase()));
  if (h.has("supplieritemname") && h.has("packsizename") && h.has("currentprice")) return "price";
  if (h.has("energykcal") && h.has("supplierproduct")) return "nutrition";
  if (h.has("cerealscontgluten") && h.has("supplierproduct")) return "allergen";
  return null;
}

/** The fields each Zonal export fills in; anything else on an existing product is left alone. */
export function zonalPresent(kind: ZonalKind): UploadField[] {
  if (kind === "price") return ["name", "code", "supplier", "packSize", "unit", "packCost"];
  if (kind === "nutrition") return ["name", "supplier", "code", "kcal", "fat", "salt"];
  // The allergen template's "costs 1.96 per KG" also gives a usable price.
  return ["name", "supplier", "contains", "mayContain", "diets", "packSize", "unit", "packCost"];
}

const CONTAINER = /\b(BOT|BOTTLE|TIN|BAG|TUB|JAR|BOX|CASE|PACK|PKT|PUNNET|BUNCH|SINGLE|EACH|ITEM|ITEMS|PORTION|PORTIONS|EA)\b/g;
const PACK_UNITS: Record<string, [BaseUnit, number]> = {
  G: ["g", 1], GM: ["g", 1], GR: ["g", 1], K: ["g", 1000], KG: ["g", 1000], ML: ["ml", 1], CL: ["ml", 10], L: ["ml", 1000],
  LT: ["ml", 1000], LTR: ["ml", 1000], LITR: ["ml", 1000], LITRE: ["ml", 1000], LITER: ["ml", 1000], DZ: ["ea", 12],
};

/** Zonal pack size names: "1X1KG", "6 x100g", "72X76G", "1X 15DZ", "70CL BOT", "TUB 4.3KG", "PACK 40", "KG", "EA", "Box24". */
export function readZonalPack(raw: string): { unit: BaseUnit; size: number } | null {
  const s0 = raw.toUpperCase().replace(/,/g, ".").trim()
    .replace(/\b(BOX|CASE|PACK|TUB|BAG|TIN)(?=\d)/g, "$1 ").replace(/(\d)(BOX|CASE|PACK|TUB|EACH|BAG|TIN)\b/g, "$1 $2")
    .replace(/^PINT$/, "568ML");
  if (!s0) return null;
  const s = s0.replace(CONTAINER, " ").replace(/\s+/g, " ").trim();
  if (!s) return { unit: "ea", size: 1 }; // EA, SINGLE, PUNNET, BUNCH, CASE
  const num = "(\\d+(?:\\.\\d+)?)";
  const unit = (u: string | undefined) => (u ? PACK_UNITS[u.replace(/\s/g, "")] : undefined);
  let m = s.match(new RegExp(`^${num}\\s*X\\s*${num}\\s*([A-Z]+)?$`));
  if (m) {
    const u = unit(m[3]);
    if (m[3] && !u) return null;
    return { unit: u?.[0] ?? "ea", size: Math.round(Number(m[1]) * Number(m[2]) * (u?.[1] ?? 1) * 1000) / 1000 };
  }
  m = s.match(new RegExp(`^${num}\\s*([A-Z]+)\\s*X\\s*${num}$`)); // 90GX30
  if (m && unit(m[2])) return { unit: unit(m[2])![0], size: Number(m[1]) * Number(m[3]) * unit(m[2])![1] };
  m = s.match(new RegExp(`^${num}?\\s*([A-Z]+)?$`));
  if (!m) return null;
  if (!m[1] && m[2]) { const u = unit(m[2]); return u ? { unit: u[0], size: u[1] } : null; } // "KG", "LITR"
  if (m[1] && !m[2]) return /^\d+$/.test(m[1]) || s0.match(CONTAINER) ? { unit: "ea", size: Number(m[1]) } : null; // "48", "10 PACK"; "1.2" is a guess
  const u = unit(m[2]);
  return u ? { unit: u[0], size: Math.round(Number(m[1]) * u[1] * 1000) / 1000 } : null;
}

const ZONAL_ALLERGENS: Record<string, string> = {
  peanuts: "peanuts", nuts: "nuts", cerealscontgluten: "gluten", milk: "milk", sesame: "sesame", soya: "soya",
  molluscs: "molluscs", sulphites: "sulphites", mustard: "mustard", celery: "celery", fish: "fish", lupin: "lupin",
  crustaceans: "crustaceans", eggs: "eggs",
};
const NUTRIENTS: [string, string, number][] = [
  ["energykcal", "kcal", 900], ["energykj", "kj", 3800], ["fat", "fat_g", 100], ["saturates", "saturates_g", 100],
  ["carbohydrate", "carbs_g", 100], ["sugars", "sugars_g", 100], ["protein", "protein_g", 100], ["fibre", "fibre_g", 100], ["salt", "salt_g", 100],
];

export interface ZonalRead extends ReadRow { warnings: string[]; isDefault: boolean }

/** One row of a Zonal export. `supplier` is used when the file has no Supplier column (the price change template). */
export function readZonalRow(kind: ZonalKind, cells: unknown[], headers: string[], line: number, allergens: Allergen[], diets: Diet[], supplier: string | null): ZonalRead {
  const idx = new Map(headers.map((h, i) => [h.trim().toLowerCase(), i]));
  const get = (h: string) => { const i = idx.get(h); const v = i === undefined ? "" : cells[i]; return v == null ? "" : String(v).replace(/&amp;/g, "&").trim(); };
  const problems: string[] = [];
  const warnings: string[] = [];
  const isDefault = get("defaultyn").toUpperCase() === "Y";
  const name = (kind === "price" ? get("supplieritemname") : get("supplierproduct")).replace(/\s+/g, " ");
  if (!name) return { row: null, problems: ["No product name."], warnings, isDefault };
  const dept = get("stockdepartment").toUpperCase();
  if (dept && dept !== "FOOD") return { row: null, problems: [`Not food (${dept.toLowerCase()}), so not added.`], warnings, isDefault };
  const sup = (get("supplier") || supplier || "").trim() || null;
  const titleSup = sup ? sup.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()) : null;
  const row: UploadRow = {
    line, name: name.slice(0, 160), supplier: titleSup, code: null, baseUnit: "g", packSize: null, packCostPence: null,
    eachWeightG: null, allergens: null, dietIds: null, nutritionPer100: null,
  };

  if (kind === "price") {
    row.code = get("productcode").slice(0, 60) || null;
    const pack = readZonalPack(get("packsizename"));
    if (pack) { row.baseUnit = pack.unit; row.packSize = pack.size; }
    else warnings.push(`Pack size "${get("packsizename")}" couldn't be read, so this product won't cost recipes until you add it.`);
    const price = readNumber(get("newprice")) ?? readNumber(get("currentprice"));
    if (price === undefined || price == null) problems.push("No price.");
    else row.packCostPence = Math.round(price * 100);
    if (!sup) problems.push("No supplier. Type the supplier for this file above.");
  }

  if (kind === "nutrition") {
    row.code = get("productcode").slice(0, 60) || null;
    const values: Record<string, number> = {};
    let odd: string | null = null;
    for (const [col, key, max] of NUTRIENTS) {
      const n = readNumber(get(col));
      if (n == null || n === undefined) continue;
      if (n > max && !odd) odd = `${n} for ${col.replace("energy", "energy ")}`;
      values[key] = n;
    }
    const any = Object.values(values).some((v) => v > 0);
    if (!any) warnings.push("No nutrition filled in for this product in Zonal.");
    else if (odd) warnings.push(`Nutrition skipped: ${odd} doesn't look like a per 100 g figure. Check it in Zonal.`);
    else row.nutritionPer100 = values;
  }

  if (kind === "allergen") {
    const codes = get("supplierstockcodes").split(",").map((c) => c.trim()).filter(Boolean);
    if (codes.length === 1) row.code = codes[0].slice(0, 60);
    const list: { allergenId: string; level: AllergenLevel }[] = [];
    const add = (code: string, level: AllergenLevel) => {
      const a = allergens.find((x) => x.code === code);
      if (a && !list.some((x) => x.allergenId === a.id)) list.push({ allergenId: a.id, level });
    };
    let filled = get("noallergens").toUpperCase() === "Y";
    for (const [col, code] of Object.entries(ZONAL_ALLERGENS)) {
      const v = get(col).toUpperCase();
      if (v === "Y") { add(code, "contains"); filled = true; }
      else if (v === "M") { add(code, "may_contain"); filled = true; }
    }
    for (const [col, parent] of [["typeofnutslist", "nuts"], ["typeofglutenlist", "gluten"]] as const) {
      const p = list.find((x) => allergens.find((a) => a.id === x.allergenId)?.code === parent);
      for (const t of get(col).split(/[,;/]+/).map((x) => x.trim()).filter(Boolean)) {
        const a = allergenFromText(t, allergens);
        if (a && a.code !== parent && p) add(a.code, p.level);
      }
    }
    if (filled) row.allergens = list;
    else warnings.push("Allergens not filled in for this product in Zonal, so they stay not confirmed.");
    const dietIds: string[] = [];
    for (const [col, code] of [["suitableforvegetarian", "vegetarian"], ["suitableforvegan", "vegan"], ["suitableforcoeliacs", "gluten_free"]] as const) {
      const d = diets.find((x) => x.code === code);
      if (d && get(col).toUpperCase() === "Y") dietIds.push(d.id);
    }
    row.dietIds = filled ? dietIds : null;
    // "costs 1.96 per KG": a price per unit, which is enough to cost recipes.
    const c = get("costpersize").match(/costs\s+([\d.]+)\s+per\s+([A-Z]+)/i);
    const u = c ? ({ KG: ["g", 1000], G: ["g", 1], LITRE: ["ml", 1000], LTR: ["ml", 1000], ML: ["ml", 1], EACH: ["ea", 1] } as Record<string, [BaseUnit, number]>)[c[2].toUpperCase()] : undefined;
    if (c && u) { row.baseUnit = u[0]; row.packSize = u[1]; row.packCostPence = Math.round(Number(c[1]) * 100); }
  }

  return { row: problems.length ? null : row, problems, warnings, isDefault };
}

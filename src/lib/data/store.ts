// Fake data layer: an in-memory store saved to .data/store.json so edits survive a restart.
// It exposes the same function signatures the Supabase layer will (see ./index.ts).
import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { Allergen, Brand, Diet, Menu, Organisation, Product, Publication, Recipe, Site, Supplier, User } from "../types";
import * as seed from "./seed";

export interface StoreData {
  org: Organisation;
  users: User[];
  allergens: Allergen[];
  diets: Diet[];
  suppliers: Supplier[];
  products: Product[];
  recipes: Recipe[];
  menus: Menu[];
  brands: Brand[];
  sites: Site[];
  publications: Publication[];
}

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "store.json");

function fresh(): StoreData {
  return structuredClone({
    org: seed.seedOrg,
    users: seed.seedUsers,
    allergens: seed.seedAllergens,
    diets: seed.seedDiets,
    suppliers: seed.seedSuppliers,
    products: seed.seedProducts,
    recipes: seed.seedRecipes,
    menus: seed.seedMenus,
    brands: seed.seedBrands,
    sites: seed.seedSites,
    publications: [],
  });
}

const g = globalThis as unknown as { __specStore?: StoreData };

export function store(): StoreData {
  if (!g.__specStore) {
    try {
      const loaded = JSON.parse(fs.readFileSync(FILE, "utf8")) as StoreData;
      // Stores saved before milestone 2 lack these; fill them from the seed.
      loaded.brands ??= structuredClone(seed.seedBrands);
      loaded.sites ??= structuredClone(seed.seedSites);
      loaded.publications ??= [];
      for (const m of loaded.menus) m.brandIds ??= [];
      g.__specStore = loaded;
    } catch {
      g.__specStore = fresh();
    }
  }
  return g.__specStore;
}

export function save() {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store(), null, 1));
}

export function resetStore() {
  g.__specStore = fresh();
  save();
}

export const uploadsDir = path.join(DIR, "uploads");

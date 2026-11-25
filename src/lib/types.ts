// Shapes mirror replica/schema.sql so the Supabase layer can replace the fake one without screen changes.

export type Unit = "g" | "kg" | "ml" | "l" | "ea";
export type BaseUnit = "g" | "ml" | "ea";
export type Rag = "green" | "amber" | "red";
export type AllergenLevel = "contains" | "may_contain";

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  calorieStatement: string | null;
  disclaimer: string;
}

export interface Allergen {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  sort: number;
}

export interface Diet {
  id: string;
  code: string;
  name: string;
  short: string;
  sort: number;
}

export interface Supplier {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  supplierId: string | null;
  name: string;
  supplierCode: string | null;
  baseUnit: BaseUnit;
  eachWeightG: number | null;
  densityGPerMl: number | null;
  packSize: number | null;
  packCostPence: number | null;
  allergenStatus: "complete" | "unknown";
  allergens: { allergenId: string; level: AllergenLevel }[];
  dietIds: string[];
  nutritionPer100: Record<string, number>;
  archived: boolean;
  updatedAt: string;
}

export interface MethodStep {
  text: string;
  steps?: string[];
}

export interface RecipeLine {
  id: string;
  sort: number;
  productId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unit: Unit;
  note?: string | null;
}

export interface Recipe {
  id: string;
  kind: "dish" | "batch";
  name: string;
  code: string | null;
  description: string | null;
  photoPath: string | null;
  yieldQty: number | null;
  yieldUnit: BaseUnit | null;
  portions: number;
  method: MethodStep[];
  skillRating: Rag | null;
  timeRating: Rag | null;
  status: "draft" | "approved" | "archived";
  lines: RecipeLine[];
  overrides: { allergenId: string; level: AllergenLevel; reason: string }[];
  pricePence: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface Rollup {
  contains: string[];
  mayContain: string[];
  unknownProducts: string[];
  diets: string[];
  nutritionPerPortion: Record<string, number>;
  nutritionComplete: boolean;
  costPerPortionPence: number | null;
}

// byo = a build-your-own group inside a section: guests pick from its options, each option a recipe (item row).
export type MenuRowKind = "section" | "info" | "item" | "byo";

export interface MenuRow {
  id: string;
  kind: MenuRowKind;
  title: string | null;
  description: string | null;
  recipeId: string | null;
  pricePence: number | null;
  children?: MenuRow[]; // sections hold items, info rows and byo groups; byo groups hold items
}

export interface Menu {
  id: string;
  name: string;
  displayName: string | null;
  code: string | null;
  description: string | null;
  subHeading1: string | null;
  subHeading2: string | null;
  menuDate: string | null;
  rows: MenuRow[]; // sections at top level, items and info rows as children
  brandIds: string[]; // brands allowed to publish this menu
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: "org_admin" | "central_chef" | "head_chef" | "viewer";
  brandId?: string | null; // null or missing = whole group
  status?: "active" | "disabled";
}

// What guests and chefs read. Built from a menu; never the live tables.
export interface SnapshotDish {
  recipeId: string;
  name: string;
  description: string | null;
  code: string | null;
  pricePence: number | null;
  photoPath: string | null;
  contains: string[];
  mayContain: string[];
  unknown: boolean;
  diets: string[];
  kcal: number | null;
}

export type SnapshotRow =
  | { kind: "item"; dish: SnapshotDish }
  | { kind: "info"; text: string }
  | { kind: "byo"; title: string; text: string | null; options: SnapshotDish[] };

export interface SnapshotSection {
  title: string;
  description: string | null;
  rows: SnapshotRow[];
}

export interface MenuSnapshot {
  menuId: string;
  name: string;
  description: string | null;
  subHeading1: string | null;
  subHeading2: string | null;
  sections: SnapshotSection[];
  hasUnknownAllergens: boolean;
  builtAt: string;
}

// ---------- milestone 2: brands, sites, publishing, members ----------

export interface GuestSettings {
  disclaimer: string;
  showKcal: boolean;
  headerNote: string | null; // e.g. "Food served 12 to 9"
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logoPath: string | null;
  enabled: boolean;
  guest: GuestSettings;
  updatedAt: string;
}

export interface Site {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  address: string | null;
  enabled: boolean;
}

export type Stage = "staging" | "live";

export interface Publication {
  id: string;
  brandId: string;
  menuId: string;
  stage: Stage;
  sort: number;
  liveFrom: string | null; // a staging row with liveFrom in the past counts as live
  autoRefresh: boolean;
  snapshot: MenuSnapshot;
  publishedBy: string | null;
  updatedAt: string;
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: User["role"];
  brandId: string | null;
  status: "active" | "disabled";
  invitedAt: string;
}

/** What a guest sees at a site's address: the brand's live menus, freshest safe version of each. */
export interface SiteMenus {
  org: Organisation;
  brand: Brand;
  site: Site;
  menus: MenuSnapshot[];
  allergens: Allergen[];
  diets: Diet[];
}

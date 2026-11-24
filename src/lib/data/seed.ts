// Demo data so every screen has something real to show. All dishes, codes, suppliers and
// nutrition figures here are invented for testing. They are not real specs.
import type { Allergen, Diet, Menu, Organisation, Product, Recipe, Supplier, User } from "../types";

const now = "2026-11-24T09:00:00.000Z";

export const seedOrg: Organisation = {
  id: "org-demo",
  name: "Demo Pub Co.",
  slug: "demo",
  calorieStatement: "Adults need around 2000 kcal a day.",
  disclaimer:
    "Our kitchens handle all 14 major allergens, so we can't rule out traces. If you have an allergy, please speak to the team before you order.",
};

export const seedUsers: User[] = [
  { id: "u-central", name: "Demo Central Chef", email: "central@demo.test", role: "central_chef" },
  { id: "u-head", name: "Demo Head Chef", email: "head@demo.test", role: "head_chef" },
  { id: "u-site", name: "Demo Site Chef", email: "site@demo.test", role: "viewer" },
];

const A = (code: string, name: string, sort: number, parentId: string | null = null): Allergen => ({
  id: `al-${code}`,
  code,
  name,
  parentId,
  sort,
});

export const seedAllergens: Allergen[] = [
  A("gluten", "Cereals containing gluten", 1),
  A("crustaceans", "Crustaceans", 2),
  A("eggs", "Eggs", 3),
  A("fish", "Fish", 4),
  A("peanuts", "Peanuts", 5),
  A("soya", "Soya", 6),
  A("milk", "Milk", 7),
  A("nuts", "Tree nuts", 8),
  A("celery", "Celery", 9),
  A("mustard", "Mustard", 10),
  A("sesame", "Sesame", 11),
  A("sulphites", "Sulphur dioxide / sulphites", 12),
  A("lupin", "Lupin", 13),
  A("molluscs", "Molluscs", 14),
  A("garlic_onion", "Garlic / onion", 15),
  A("gluten.wheat", "Wheat", 1, "al-gluten"),
  A("gluten.rye", "Rye", 2, "al-gluten"),
  A("gluten.barley", "Barley", 3, "al-gluten"),
  A("gluten.oats", "Oats", 4, "al-gluten"),
  A("nuts.almond", "Almonds", 1, "al-nuts"),
  A("nuts.hazelnut", "Hazelnuts", 2, "al-nuts"),
  A("nuts.walnut", "Walnuts", 3, "al-nuts"),
  A("nuts.cashew", "Cashews", 4, "al-nuts"),
  A("nuts.pecan", "Pecans", 5, "al-nuts"),
  A("nuts.brazil", "Brazil nuts", 6, "al-nuts"),
  A("nuts.pistachio", "Pistachios", 7, "al-nuts"),
  A("nuts.macadamia", "Macadamia nuts", 8, "al-nuts"),
];

export const seedDiets: Diet[] = [
  { id: "di-vegan", code: "vegan", name: "Vegan", short: "VG", sort: 1 },
  { id: "di-plant_based", code: "plant_based", name: "Plant based", short: "PB", sort: 2 },
  { id: "di-vegetarian", code: "vegetarian", name: "Vegetarian", short: "V", sort: 3 },
  { id: "di-gluten_free", code: "gluten_free", name: "Gluten free", short: "GF", sort: 4 },
];

export const seedSuppliers: Supplier[] = [
  { id: "su-market", name: "Market Fresh Ltd" },
  { id: "su-butcher", name: "Northfield Butchers" },
  { id: "su-bakery", name: "Hill Street Bakery" },
];

const VEG = ["di-vegan", "di-plant_based", "di-vegetarian", "di-gluten_free"];
const VEGGIE_GF = ["di-vegetarian", "di-gluten_free"];
const GF = ["di-gluten_free"];

function P(
  id: string,
  name: string,
  supplierId: string,
  code: string,
  baseUnit: Product["baseUnit"],
  packSize: number,
  packCostPence: number,
  allergens: [string, "contains" | "may_contain"][],
  dietIds: string[],
  nutrition: Record<string, number>,
  extra: Partial<Product> = {},
): Product {
  return {
    id,
    supplierId,
    name,
    supplierCode: code,
    baseUnit,
    eachWeightG: null,
    densityGPerMl: null,
    packSize,
    packCostPence,
    allergenStatus: "complete",
    allergens: allergens.map(([c, level]) => ({ allergenId: `al-${c}`, level })),
    dietIds,
    nutritionPer100: nutrition,
    archived: false,
    updatedAt: now,
    ...extra,
  };
}

export const seedProducts: Product[] = [
  P("pr-butter", "BUTTER UNSALTED 2KG", "su-market", "BUTUN2-cs", "g", 2000, 1540, [["milk", "contains"]], VEGGIE_GF, { kcal: 744, fat_g: 82, salt_g: 0 }),
  P("pr-chipotle", "CHIPOTLE PASTE 1KG", "su-market", "CHIP1-ea", "g", 1000, 1150, [], [], {}, { allergenStatus: "unknown" }),
  P("pr-paprika", "SMOKED PAPRIKA 500G", "su-market", "SPPAP5-ea", "g", 500, 620, [], VEG, { kcal: 282, fat_g: 13, salt_g: 0.1 }),
  P("pr-garlic", "GARLIC", "su-market", "GAR-ea", "ea", 1, 30, [["garlic_onion", "contains"]], VEG, { kcal: 149, fat_g: 0.5, salt_g: 0 }, { eachWeightG: 50 }),
  P("pr-corn", "CORN ON THE COB x 12", "su-market", "CORN12-cs", "ea", 12, 456, [], VEG, { kcal: 86, fat_g: 1.4, salt_g: 0 }, { eachWeightG: 250 }),
  P("pr-lime", "LIME (1/60 EA)", "su-market", "LIM-ea", "ea", 1, 24, [], VEG, { kcal: 30, fat_g: 0.2, salt_g: 0 }, { eachWeightG: 67 }),
  P("pr-salt", "SEA SALT FLAKES 1.4KG", "su-market", "SALTFL-ea", "g", 1400, 690, [], VEG, { kcal: 0, fat_g: 0, salt_g: 100 }),
  P("pr-squid", "SQUID TUBES CLEANED 1KG", "su-market", "SQUID1-kg", "g", 1000, 1190, [["molluscs", "contains"]], GF, { kcal: 92, fat_g: 1.4, salt_g: 0.1 }),
  P("pr-cornflour", "CORNFLOUR 3KG", "su-market", "CFLOUR3-ea", "g", 3000, 540, [], VEG, { kcal: 381, fat_g: 0.1, salt_g: 0 }),
  P("pr-flour", "FLOUR PLAIN 16KG", "su-market", "FLOURP-EA", "g", 16000, 1280, [["gluten.wheat", "contains"]], ["di-vegan", "di-plant_based", "di-vegetarian"], { kcal: 364, fat_g: 1, salt_g: 0 }),
  P("pr-oil", "OIL RAPESEED 20LTR", "su-market", "RAPE20-cs", "ml", 20000, 3200, [], VEG, { kcal: 828, fat_g: 92, salt_g: 0 }, { densityGPerMl: 0.92 }),
  P("pr-mayo", "MAYONNAISE 5L", "su-market", "MAYO5-cs", "g", 5000, 1395, [["eggs", "contains"], ["mustard", "contains"]], VEGGIE_GF, { kcal: 680, fat_g: 75, salt_g: 1.2 }),
  P("pr-tomato", "TOMATOES HERITAGE MIXED 3KG", "su-market", "TOMHER3-cs", "g", 3000, 1290, [], VEG, { kcal: 18, fat_g: 0.2, salt_g: 0 }),
  P("pr-shallot", "SHALLOTS BANANA", "su-market", "SHALBAN-kg", "g", 1000, 390, [["garlic_onion", "contains"]], VEG, { kcal: 72, fat_g: 0.1, salt_g: 0 }),
  P("pr-vinegar", "VINEGAR WHITE WINE 5L", "su-market", "VINWW5-EA", "ml", 5000, 890, [["sulphites", "contains"]], VEG, { kcal: 20, fat_g: 0, salt_g: 0 }),
  P("pr-basil", "HERB BASIL 100G", "su-market", "HERBAS-ea", "g", 100, 135, [], VEG, { kcal: 23, fat_g: 0.6, salt_g: 0 }),
  P("pr-sugar", "SUGAR CASTER 2KG", "su-market", "CASSUG2-EA", "g", 2000, 260, [], VEG, { kcal: 400, fat_g: 0, salt_g: 0 }),
  P("pr-mince", "BEEF MINCE 15% 2.5KG", "su-butcher", "BMINCE15-kg", "g", 2500, 2125, [], GF, { kcal: 250, fat_g: 15, salt_g: 0.2 }),
  P("pr-bun", "BRIOCHE BUN 4.5\" x 12", "su-bakery", "BRIO12-cs", "ea", 12, 540, [["gluten.wheat", "contains"], ["eggs", "contains"], ["milk", "contains"], ["sesame", "may_contain"]], ["di-vegetarian"], { kcal: 330, fat_g: 9, salt_g: 1.1 }, { eachWeightG: 80 }),
  P("pr-cheddar", "CHEDDAR SLICES 1KG", "su-market", "CHEDSL1-ea", "g", 1000, 990, [["milk", "contains"]], VEGGIE_GF, { kcal: 410, fat_g: 34, salt_g: 1.8 }),
  P("pr-gem", "LETTUCE BABY GEM x 2", "su-market", "GEM2-ea", "ea", 2, 95, [], VEG, { kcal: 15, fat_g: 0.2, salt_g: 0 }, { eachWeightG: 120 }),
];

let lineN = 0;
const L = (productId: string | null, subRecipeId: string | null, quantity: number, unit: Recipe["lines"][number]["unit"]) => ({
  id: `ln-${++lineN}`,
  sort: lineN,
  productId,
  subRecipeId,
  quantity,
  unit,
});

function R(r: Partial<Recipe> & Pick<Recipe, "id" | "kind" | "name" | "lines" | "method">): Recipe {
  return {
    code: null,
    description: null,
    photoPath: null,
    yieldQty: null,
    yieldUnit: null,
    portions: 1,
    skillRating: null,
    timeRating: null,
    status: "approved",
    overrides: [],
    pricePence: null,
    updatedAt: now,
    updatedBy: "u-central",
    ...r,
  };
}

const chill = "COOL to 20°C within 2 hours, then FRIDGE. Label and date.";

export const seedRecipes: Recipe[] = [
  R({
    id: "re-chilli-butter", kind: "batch", name: "Smoked chilli butter", code: "B-1001", yieldQty: 1200, yieldUnit: "g",
    lines: [L("pr-butter", null, 1000, "g"), L("pr-chipotle", null, 150, "g"), L("pr-paprika", null, 20, "g"), L("pr-garlic", null, 2, "ea"), L("pr-salt", null, 15, "g")],
    method: [{ text: "SOFTEN the butter at room temperature for 30 minutes." }, { text: "CRUSH the garlic. BEAT all ingredients together until even." }, { text: "ROLL into logs in cling film, 200 g each. " + chill }],
  }),
  R({
    id: "re-lime-mayo", kind: "batch", name: "Lime and garlic mayo", code: "B-1002", yieldQty: 1000, yieldUnit: "g",
    lines: [L("pr-mayo", null, 950, "g"), L("pr-lime", null, 3, "ea"), L("pr-garlic", null, 1, "ea")],
    method: [{ text: "ZEST and JUICE the limes. CRUSH the garlic." }, { text: "WHISK into the mayonnaise until smooth." }, { text: "Into squeezy bottles. Label and date. Use within 3 days." }],
  }),
  R({
    id: "re-shallots", kind: "batch", name: "Quick pickled shallots", code: "B-1003", yieldQty: 500, yieldUnit: "g",
    lines: [L("pr-shallot", null, 300, "g"), L("pr-vinegar", null, 150, "ml"), L("pr-sugar", null, 50, "g"), L("pr-salt", null, 5, "g")],
    method: [{ text: "PEEL and finely SLICE the shallots into rings." }, { text: "WARM vinegar, sugar and salt until dissolved. POUR over the shallots." }, { text: "LEAVE for 1 hour before use. " + chill }],
  }),
  R({
    id: "re-basil-oil", kind: "batch", name: "Basil oil", code: "B-1004", yieldQty: 300, yieldUnit: "ml",
    lines: [L("pr-basil", null, 100, "g"), L("pr-oil", null, 250, "ml")],
    method: [{ text: "BLANCH basil for 10 seconds, REFRESH in iced water, squeeze dry." }, { text: "BLEND with the oil for 2 minutes. STRAIN through muslin." }, { text: "Into squeezy bottles. " + chill }],
  }),
  R({
    id: "re-patty", kind: "batch", name: "Smash burger patty", code: "B-1005", yieldQty: 20, yieldUnit: "ea",
    lines: [L("pr-mince", null, 1.2, "kg"), L("pr-salt", null, 12, "g")],
    method: [{ text: "Keep mince below 5°C at all times." }, { text: "WEIGH into 60 g balls. Do not season until cooking." }, { text: "Tray up between parchment. Label and date. Use within 2 days." }],
  }),
  R({
    id: "re-dredge", kind: "batch", name: "Squid dredge", code: "B-1006", yieldQty: 1000, yieldUnit: "g",
    lines: [L("pr-flour", null, 480, "g"), L("pr-cornflour", null, 480, "g"), L("pr-salt", null, 20, "g"), L("pr-paprika", null, 20, "g")],
    method: [{ text: "MIX all dry ingredients thoroughly." }, { text: "Store in a lidded tub. Label and date." }],
  }),
  R({
    id: "re-corn", kind: "dish", name: "Charred corn, smoked chilli butter", code: "SP-0142", pricePence: 650,
    description: "Grilled corn on the cob, smoked chilli butter, lime", skillRating: "green", timeRating: "amber",
    lines: [L("pr-corn", null, 1, "ea"), L(null, "re-chilli-butter", 25, "g"), L("pr-lime", null, 0.25, "ea"), L("pr-salt", null, 1, "g")],
    method: [{ text: "CHAR the corn on the grill for 6 to 8 minutes, turning, until blackened in places." }, { text: "SPOON 25 g smoked chilli butter over the hot corn." }, { text: "FINISH with a lime wedge and sea salt. Serve as shown." }],
  }),
  R({
    id: "re-squid", kind: "dish", name: "Crispy squid, lime mayo", code: "SP-0117", pricePence: 800,
    description: "Salt and pepper squid, lime and garlic mayo", skillRating: "amber", timeRating: "green",
    lines: [L("pr-squid", null, 120, "g"), L(null, "re-dredge", 40, "g"), L("pr-oil", null, 15, "ml"), L(null, "re-lime-mayo", 40, "g"), L("pr-lime", null, 0.25, "ea")],
    method: [{ text: "CUT squid into 1 cm rings. TOSS in the dredge, shake off excess." }, { text: "DEEP FRY at 180°C for 90 seconds until golden. DRAIN." }, { text: "SQUEEZE 40 g lime mayo into a ramekin. PILE squid beside it, lime wedge on top." }],
    overrides: [{ allergenId: "al-fish", level: "may_contain", reason: "Shared fryer with fish" }],
  }),
  R({
    id: "re-tomato", kind: "dish", name: "Heritage tomato salad", code: "SP-0150", pricePence: 750,
    description: "Pickled shallot, basil oil", skillRating: "green", timeRating: "green",
    lines: [L("pr-tomato", null, 180, "g"), L(null, "re-shallots", 25, "g"), L(null, "re-basil-oil", 10, "ml"), L("pr-salt", null, 1, "g")],
    method: [{ text: "SLICE and WEDGE tomatoes, a mix of colours. SEASON with salt." }, { text: "SCATTER pickled shallots over. DRIZZLE 10 ml basil oil." }, { text: "Serve as shown, at room temperature." }],
  }),
  R({
    id: "re-burger", kind: "dish", name: "Double smash burger", code: "MN-0201", pricePence: 1500,
    description: "Two smashed patties, cheddar, gem, lime mayo, brioche", skillRating: "amber", timeRating: "amber",
    lines: [L("pr-bun", null, 1, "ea"), L(null, "re-patty", 2, "ea"), L("pr-cheddar", null, 40, "g"), L("pr-gem", null, 0.25, "ea"), L(null, "re-lime-mayo", 20, "g"), L("pr-salt", null, 1, "g")],
    method: [{ text: "TOAST the bun cut side down on the plancha, 30 seconds." }, { text: "SMASH 2 patties on the plancha, SEASON, cook 90 seconds, FLIP, cheddar on, 60 seconds. PROBE to 75°C." }, { text: "BUILD: bun base, 20 g lime mayo, gem, patties, bun lid." }],
  }),
];

export const seedMenus: Menu[] = [
  {
    id: "me-winter",
    name: "Winter menu 2026",
    displayName: "Food",
    code: "WM26",
    description: "Served 12 to 9, every day",
    subHeading1: null,
    subHeading2: null,
    menuDate: "2026-11-24",
    updatedAt: now,
    rows: [
      {
        id: "mr-1", kind: "section", title: "Small plates", description: null, recipeId: null, pricePence: null,
        children: [
          { id: "mr-2", kind: "item", title: null, description: null, recipeId: "re-corn", pricePence: null },
          { id: "mr-3", kind: "item", title: null, description: null, recipeId: "re-squid", pricePence: null },
          { id: "mr-4", kind: "item", title: null, description: null, recipeId: "re-tomato", pricePence: null },
          { id: "mr-5", kind: "info", title: "Any 3 small plates for £18, Monday to Thursday", description: null, recipeId: null, pricePence: null },
        ],
      },
      {
        id: "mr-6", kind: "section", title: "Mains", description: null, recipeId: null, pricePence: null,
        children: [{ id: "mr-7", kind: "item", title: null, description: null, recipeId: "re-burger", pricePence: null }],
      },
    ],
  },
];

"use client";
// Import wizard: supplier prices (optional) -> pick books -> check ingredient matches -> import.
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileUp } from "lucide-react";
import { importDishAction, uploadProductsAction } from "@/lib/actions";
import { UPLOAD_CHUNK, type UploadRow } from "@/lib/product-upload";
import { BOOK_NAMES, applyChoices, buildPlan, catalogueKey, type CatalogueItem, type OldRecipe } from "@/lib/recipe-import";
import type { Allergen, BaseUnit } from "@/lib/types";
import { Button, Card, Notice, Pill, inputClass } from "@/components/ui";
import { RecipeCardPreview } from "./recipe-card-preview";

type PriceRow = { name: string; pack?: string; price?: number; per?: number; dim?: string; sup?: string; at?: number };

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();

/** Supplier prices saved in a Recipe build / Recipe cards file (its rcData block). */
async function readPrices(file: File): Promise<UploadRow[]> {
  const text = await file.text();
  const marker = '<script id="rcData" type="application/json">';
  let i = text.indexOf(marker);
  while (i >= 0 && text[i + marker.length] !== "{") i = text.indexOf(marker, i + 1);
  if (i < 0) throw new Error("That file has no saved recipe data. Choose your Recipe build for chefs file.");
  const json = JSON.parse(text.slice(i + marker.length, text.indexOf("</script>", i)));
  const prices: PriceRow[] = json?.state?.prices ?? json?.prices ?? [];
  if (!Array.isArray(prices) || prices.length === 0) throw new Error("That file has no supplier prices in it.");
  // Latest price wins when the same product appears in more than one price file.
  const latest = new Map<string, PriceRow>();
  for (const p of prices) {
    if (!p?.name) continue;
    const k = catalogueKey(p.sup ?? null, p.name);
    if (!latest.has(k) || (p.at ?? 0) >= (latest.get(k)!.at ?? 0)) latest.set(k, p);
  }
  return [...latest.values()].map((p, n): UploadRow => {
    const unit: BaseUnit = p.dim === "v" ? "ml" : p.dim === "e" ? "ea" : "g";
    // "per" is the price per kg, per litre or per item, so the pack size follows from the pack price.
    const size = p.price && p.per ? (unit === "ea" ? p.price / p.per : (p.price / p.per) * 1000) : null;
    return {
      line: n + 1, name: titleCase(p.name).slice(0, 160), supplier: p.sup ? titleCase(p.sup).slice(0, 120) : null, code: null,
      baseUnit: unit, packSize: size ? Math.round(size * 100) / 100 : null, packCostPence: p.price != null ? Math.round(p.price * 100) : null,
      eachWeightG: null, allergens: null, dietIds: null, nutritionPer100: null,
    };
  });
}

export function RecipeImport({ old, allergens, products }: { old: OldRecipe[]; allergens: Allergen[]; products: { name: string; supplier: string | null; baseUnit: BaseUnit }[] }) {
  const [prices, setPrices] = useState<UploadRow[] | null>(null);
  const [priceFile, setPriceFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const books = useMemo(() => [...new Set(old.map((r) => r.book))], [old]);
  const [chosenBooks, setChosenBooks] = useState<Set<string>>(() => new Set(books));
  const [withPhotos, setWithPhotos] = useState(true);
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const [showAll, setShowAll] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState<null | { dishes: number; batches: number; newProducts: number; photos: number; prices: string | null; failed: string[] }>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const catalogue = useMemo<CatalogueItem[]>(() => {
    const items: CatalogueItem[] = products.map((p) => ({ key: catalogueKey(p.supplier, p.name), name: p.name, supplier: p.supplier, baseUnit: p.baseUnit, fromPrices: false }));
    const seen = new Set(items.map((x) => x.key));
    for (const p of prices ?? []) {
      const key = catalogueKey(p.supplier, p.name);
      if (!seen.has(key)) { items.push({ key, name: p.name, supplier: p.supplier, baseUnit: p.baseUnit, fromPrices: true }); seen.add(key); }
    }
    return items;
  }, [products, prices]);
  const byKey = useMemo(() => new Map(catalogue.map((c) => [c.key, c])), [catalogue]);
  const recipes = useMemo(() => old.filter((r) => chosenBooks.has(r.book)), [old, chosenBooks]);
  const plan = useMemo(() => buildPlan(recipes, catalogue, allergens), [recipes, catalogue, allergens]);
  const choiceOf = (name: string) => (name in choices ? choices[name] : plan.ingredients.find((i) => i.name === name)?.chosen ?? null);
  const needLook = plan.ingredients.filter((i) => !i.chosen && i.suggestions.length > 0);
  const shown = showAll ? plan.ingredients : needLook;
  const checked = plan.dishes.filter((d) => d.overrides.length && !d.allergenNote.startsWith("Not checked")).length;
  const unknownAllergenWords = [...new Set(plan.dishes.flatMap((d) => d.unknownAllergens))];

  if (old.length === 0) {
    return (
      <Card className="grid gap-2 p-5 text-sm">
        <h2 className="text-lg">No old spec book found</h2>
        <p>Recipes are read from your earlier spec book app with your own login. Sign in with the account you use there (your Portobello email) and open this page again.</p>
        <p className="text-text-muted">A Zonal recipe import comes later and needs a sample export first.</p>
      </Card>
    );
  }

  const run = () => start(async () => {
    setError(null);
    setLog([]);
    const say = (m: string) => setLog((x) => [...x, m]);
    const failed: string[] = [];
    let priceSummary: string | null = null;
    if (prices?.length) {
      let added = 0, updated = 0;
      for (let i = 0; i < prices.length; i += UPLOAD_CHUNK) {
        const res = await uploadProductsAction(prices.slice(i, i + UPLOAD_CHUNK), ["name", "supplier", "packSize", "packCost"], false);
        if (!res.ok) { setError(`Supplier prices stopped: ${res.error}`); return; }
        added += res.value!.added; updated += res.value!.updated;
        failed.push(...res.value!.failed.map((f) => `Price ${f.name}: ${f.error}`));
        say(`Supplier prices: ${Math.min(i + UPLOAD_CHUNK, prices.length)} of ${prices.length}`);
      }
      priceSummary = `${added} products added and ${updated} updated from supplier prices`;
    }
    const full = applyChoices(structuredClone(plan), Object.fromEntries(plan.ingredients.map((i) => [i.name, choiceOf(i.name)])));
    let batchIds: Record<string, string> = {};
    let dishes = 0, newProducts = 0, photos = 0;
    for (const d of full.dishes) {
      const need = d.batches.filter((k) => !batchIds[k]).map((k) => full.batches[k]);
      const res = await importDishAction(d, need, batchIds, withPhotos);
      if (!res.ok) { failed.push(`${d.name}: ${res.error}`); continue; }
      batchIds = res.value!.batchIds;
      dishes++; newProducts += res.value!.newProducts; if (res.value!.photo) photos++;
      say(`Recipes: ${dishes} of ${full.dishes.length} (${d.name})`);
    }
    setDone({ dishes, batches: Object.keys(batchIds).length, newProducts, photos, prices: priceSummary, failed });
  });

  if (done) {
    return (
      <Card className="grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Import finished</h2>
        <ul role="status" className="grid gap-1">
          {done.prices && <li>{done.prices}.</li>}
          <li>{done.dishes} dishes and {done.batches} batch recipes saved as drafts.</li>
          <li>{done.newProducts} new products made from ingredient names, with allergens not confirmed.</li>
          {withPhotos && <li>{done.photos} photos attached.</li>}
        </ul>
        {done.failed.length > 0 && <Notice tone="danger">Some things weren&apos;t saved: {done.failed.join("; ")}</Notice>}
        <p className="text-text-muted">Next: open Products and use the Allergens missing filter to confirm each product from its spec sheet. Until then, these dishes stay off guest menus.</p>
        <div className="flex flex-wrap gap-4">
          <Link className="font-semibold underline" href="/app/recipes">See the recipes</Link>
          <Link className="font-semibold underline" href="/app/products?missing=1">Products to confirm</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      {error && <Notice tone="danger">{error}</Notice>}

      <Card className="grid gap-3 p-5 text-sm">
        <h2 className="text-lg">1. Supplier prices <span className="font-normal text-text-muted">(optional)</span></h2>
        <p>Choose your <span className="font-semibold">Recipe build for chefs</span> file to bring in the supplier prices saved in it. Ingredients can then link to real products, so recipes cost themselves.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} id="price-file" type="file" accept=".html,.htm" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError(null);
            try { setPrices(await readPrices(f)); setPriceFile(f.name); setChoices({}); } catch (err) { setError(err instanceof Error ? err.message : "That file couldn't be read."); }
          }} />
          <label htmlFor="price-file" className="sr-only">Recipe build file</label>
          <Button type="button" variant="secondary" onClick={() => input.current?.click()} disabled={pending}><FileUp aria-hidden />Choose the file</Button>
          <span className="text-text-muted">{prices ? `${prices.length} supplier products found in ${priceFile}` : "No file chosen. You can skip this."}</span>
        </div>
      </Card>

      <Card className="grid gap-3 p-5 text-sm">
        <h2 className="text-lg">2. Recipes from your old spec book</h2>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Books to import</legend>
          {books.map((b) => (
            <label key={b} className="flex items-center gap-3 rounded-md border border-border p-3">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={chosenBooks.has(b)}
                onChange={(e) => setChosenBooks((s) => { const n = new Set(s); if (e.target.checked) n.add(b); else n.delete(b); return n; })} />
              <span><span className="font-semibold">{BOOK_NAMES[b] ?? b}</span> <span className="text-text-muted">{old.filter((r) => r.book === b).length} recipes</span></span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} />
          Bring the dish photos too
        </label>
        <p aria-live="polite">
          {plan.dishes.length} dishes and {Object.keys(plan.batches).length} batch recipes (one per component, shared where two dishes use the same one).
          {" "}{checked} {checked === 1 ? "dish keeps" : "dishes keep"} the allergens you checked against Zonal, as dish-level allergen notes.
        </p>
        <details>
          <summary className="cursor-pointer font-semibold underline">Preview the recipe cards ({plan.dishes.length})</summary>
          <p className="mt-2 text-text-muted">How each dish will come across, with its batch recipes, method and allergens. Open one to see its photo. Pick the ingredient matches below first: the cards show the ingredient names, and the matches decide which products they link to.</p>
          <div className="mt-2 grid gap-2">
            {plan.dishes.map((d) => <RecipeCardPreview key={d.oldId} dish={d} batches={plan.batches} allergens={allergens} />)}
          </div>
        </details>
        {unknownAllergenWords.length > 0 && <Notice tone="warning">These allergen words weren&apos;t recognised and won&apos;t be carried across: {unknownAllergenWords.join(", ")}. Add them by hand after the import.</Notice>}
      </Card>

      <Card className="grid gap-3 p-5 text-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg">3. Check the ingredient matches</h2>
            <p className="text-text-muted">
              {plan.ingredients.length} different ingredients. {plan.ingredients.filter((i) => i.chosen).length} matched a product on their own.
              {" "}{needLook.length} have possible matches for you to pick. The rest become new products. A wrong match can add or hide an allergen, so only pick a product that really is that ingredient.
            </p>
          </div>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all {plan.ingredients.length}
          </label>
        </div>
        <div className="relative max-h-[60vh] overflow-auto rounded-md border border-border">
          <table className="w-full min-w-[640px]">
            <caption className="sr-only">Ingredient matches</caption>
            <thead className="sticky top-0 bg-surface"><tr className="text-left text-text-muted">
              <th scope="col" className="px-3 py-2 font-semibold">Ingredient in the old recipes</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Lines</th>
              <th scope="col" className="px-3 py-2 font-semibold">Becomes</th>
            </tr></thead>
            <tbody>
              {shown.map((i) => {
                const v = choiceOf(i.name);
                const id = `m-${i.name.replace(/[^a-z0-9]/g, "-")}`;
                return (
                  <tr key={i.name} className="border-t border-border">
                    <td className="px-3 py-2"><label htmlFor={id} className="font-semibold">{i.name}</label></td>
                    <td className="px-3 py-2 text-right tabular">{i.uses}</td>
                    <td className="px-3 py-2">
                      <select id={id} className={`${inputClass} w-full`} value={v ?? ""} onChange={(e) => setChoices((c) => ({ ...c, [i.name]: e.target.value || null }))}>
                        <option value="">New product: {i.name}</option>
                        {[...new Set([...(v ? [v] : []), ...i.suggestions])].map((k) => {
                          const c = byKey.get(k);
                          return c ? <option key={k} value={k}>{c.name}{c.supplier ? ` (${c.supplier})` : ""}</option> : null;
                        })}
                      </select>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-text-muted">Nothing needs a look. Tick &quot;Show all&quot; to see every match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="grid gap-3 p-5 text-sm">
        <h2 className="text-lg">4. Import</h2>
        <p>
          Everything is saved as a draft. A recipe with the same name as one you already have is updated, not added twice.
          New products from ingredient names have no allergens yet, so these dishes stay off guest menus until you confirm each product.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={run} loading={pending} disabled={plan.dishes.length === 0}>Import {plan.dishes.length} dishes{prices?.length ? ` and ${prices.length} prices` : ""}</Button>
          {pending && <Pill tone="staging">Don&apos;t close this page</Pill>}
        </div>
        {log.length > 0 && <p role="status" className="text-text-muted">{log[log.length - 1]}</p>}
      </Card>
    </div>
  );
}

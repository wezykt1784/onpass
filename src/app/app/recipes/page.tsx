import type { Metadata } from "next";
import Link from "next/link";
import { ChefHat, Search } from "lucide-react";
import { listAllergens, listRecipes } from "@/lib/data";
import { allergenNames, money, topLevelAllergens } from "@/lib/format";
import { AllergenChip, EmptyState, PageHeader, Pill, RagChip, buttonClass, inputClass } from "@/components/ui";
import { NewRecipeButton } from "./new-recipe";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage({ searchParams }: PageProps<"/app/recipes">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const kind = sp.kind === "dish" || sp.kind === "batch" ? sp.kind : undefined;
  const status = sp.status === "draft" || sp.status === "approved" || sp.status === "archived" ? sp.status : undefined;
  const allergen = typeof sp.allergen === "string" ? sp.allergen : "";
  const [all, allergens] = await Promise.all([listRecipes({ q, kind, status }), listAllergens()]);
  const rows = allergen === "missing" ? all.filter((r) => r.rollup.unknownProducts.length > 0)
    : allergen ? all.filter((r) => topLevelAllergens([...r.rollup.contains, ...r.rollup.mayContain], allergens).has(allergen)) : all;
  const filtered = Boolean(status || allergen);
  const tab = (k?: string) =>
    `h-9 rounded-pill px-4 text-sm font-semibold inline-flex items-center ${kind === k ? "bg-text text-bg" : "border border-border-input bg-bg text-text"}`;
  const qs = (k?: string) => `/app/recipes?${new URLSearchParams({ ...(q && { q }), ...(k && { kind: k }), ...(status && { status }), ...(allergen && { allergen }) })}`;

  return (
    <>
      <PageHeader title="Recipes" sub="Dishes and the batch recipes that go into them." actions={<NewRecipeButton />} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form role="search" className="relative w-full max-w-sm" action="/app/recipes">
          {kind && <input type="hidden" name="kind" value={kind} />}
          <label htmlFor="q" className="sr-only">Search recipes</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Search by name or code" className={`${inputClass} pl-9`} />
        </form>
        <div className="flex gap-2" role="group" aria-label="Show">
          <Link href={qs()} className={tab(undefined)} aria-current={!kind ? "true" : undefined}>All</Link>
          <Link href={qs("dish")} className={tab("dish")} aria-current={kind === "dish" ? "true" : undefined}>Dishes</Link>
          <Link href={qs("batch")} className={tab("batch")} aria-current={kind === "batch" ? "true" : undefined}>Batch recipes</Link>
        </div>
        <p className="ml-auto text-sm text-text-muted" aria-live="polite">{rows.length} {rows.length === 1 ? "recipe" : "recipes"}</p>
      </div>
      <form action="/app/recipes" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter recipes">
        {q && <input type="hidden" name="q" value={q} />}
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label className="grid gap-1 text-sm font-semibold" htmlFor="f-allergen">
          Contains
          <select id="f-allergen" name="allergen" defaultValue={allergen} className={`${inputClass} w-64`}>
            <option value="">Any allergen or none</option>
            <option value="missing">Allergen data missing</option>
            {allergens.filter((a) => !a.parentId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="f-status">
          Status
          <select id="f-status" name="status" defaultValue={status ?? ""} className={`${inputClass} w-44`}>
            <option value="">Draft and approved</option>
            <option value="draft">Drafts only</option>
            <option value="approved">Approved only</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button className={buttonClass("secondary")}>Apply</button>
        {filtered && <Link className={buttonClass("ghost")} href={`/app/recipes?${new URLSearchParams({ ...(q && { q }), ...(kind && { kind }) })}`}>Clear filters</Link>}
      </form>

      {rows.length === 0 ? (
        q || filtered ? (
          <EmptyState icon={<Search />} text={q ? `No recipes match "${q}". Check the spelling or clear the search.` : "No recipes match these filters."}
            action={<Link className={buttonClass("secondary")} href={kind ? `/app/recipes?kind=${kind}` : "/app/recipes"}>Clear search and filters</Link>} />
        ) : (
          <EmptyState icon={<ChefHat />} text="No recipes yet. Start with a batch recipe, then build the dish on top of it." action={<NewRecipeButton />} />
        )
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-border bg-bg">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">Name</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Type</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Allergens</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Ratings</th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ recipe: r, rollup }) => {
                const names = allergenNames(rollup.contains, allergens);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-sunken">
                    <td className="px-4 py-3">
                      <Link href={`/app/recipes/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <span className="font-mono">{r.code}</span>{r.status === "draft" && <Pill tone="draft">Draft</Pill>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Pill tone={r.kind}>{r.kind === "batch" ? `Batch${r.yieldQty ? `, ${r.yieldQty} ${r.yieldUnit}` : ""}` : "Dish"}</Pill></td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {rollup.unknownProducts.length > 0 && <AllergenChip size="sm" level="unknown" name="Data missing" />}
                        {names.map((n) => <AllergenChip key={n} size="sm" name={n.replace(/ \(.+\)/, "")} />)}
                        {!names.length && !rollup.unknownProducts.length && <span className="text-text-muted">None</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><RagChip label="Skill" value={r.skillRating} /><RagChip label="Time" value={r.timeRating} /></div></td>
                    <td className="px-4 py-3 text-right tabular">{money(r.pricePence)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

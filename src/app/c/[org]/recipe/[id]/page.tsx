import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Link2 } from "lucide-react";
import { getRecipe, getRollup, listAllergens, listDiets, listProducts, listRecipes, listSuppliers } from "@/lib/data";
import { allergenNames, dateTimeUk, dietNames, qty } from "@/lib/format";
import { AllergenBars, RagChip } from "@/components/ui";
import { photoUrl } from "@/lib/supabase/env";
import { BackLink } from "./back-link";

export const metadata: Metadata = { title: "Spec" };

export default async function SpecView({ params }: PageProps<"/c/[org]/recipe/[id]">) {
  const { org, id } = await params;
  const r = await getRecipe(id);
  if (!r) notFound();
  const [rollup, allergens, diets, products, suppliers, batches] = await Promise.all([
    getRollup(id), listAllergens(), listDiets(), listProducts(), listSuppliers(), listRecipes({ kind: "batch" }),
  ]);
  const pmap = new Map(products.map((p) => [p.id, p]));
  const bmap = new Map(batches.map((b) => [b.recipe.id, b.recipe]));
  const smap = new Map(suppliers.map((s) => [s.id, s.name]));
  return (
    <article>
      <BackLink fallback={`/c/${org}`} />
      {r.photoPath && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(r.photoPath)!} alt={`${r.name}, as served`} className="mb-4 aspect-[4/3] w-full rounded-lg object-cover" />
      )}
      <p className="text-sm text-text-muted">{r.kind === "batch" ? `Batch recipe · makes ${r.yieldQty} ${r.yieldUnit}` : "Dish"}</p>
      <h1 className="mb-2 text-xl break-words">{r.name}</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {r.code && <span className="font-mono text-sm text-text-muted">{r.code}</span>}
        <RagChip label="Skill" value={r.skillRating} /><RagChip label="Time" value={r.timeRating} />
      </div>
      <AllergenBars contains={allergenNames(rollup.contains, allergens)} mayContain={allergenNames(rollup.mayContain, allergens)}
        unknown={rollup.unknownProducts.map((p) => pmap.get(p)?.name ?? "")} diets={dietNames(rollup.diets, diets)} />

      <h2 className="mb-2 mt-6 text-lg">Ingredients</h2>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {r.lines.map((l) => {
          const p = l.productId ? pmap.get(l.productId) : null;
          const b = l.subRecipeId ? bmap.get(l.subRecipeId) : null;
          return (
            <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
              {b ? (
                <Link href={`/c/${org}/recipe/${b.id}`} className="flex min-h-8 items-center gap-1.5 font-bold text-accent"><Link2 aria-hidden className="size-4" />{b.name}</Link>
              ) : (
                <details className="min-w-0">
                  <summary className="cursor-pointer list-none font-semibold">{p?.name ?? "Missing product"}</summary>
                  <p className="text-sm text-text-muted">{p?.supplierId ? smap.get(p.supplierId) : ""} <span className="font-mono">{p?.supplierCode}</span></p>
                </details>
              )}
              <span className="shrink-0 text-lg font-bold tabular">{qty(l.quantity, l.unit)}</span>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-2 mt-6 text-lg">Method</h2>
      <ol className="grid">
        {r.method.map((m, i) => (
          <li key={i} className="flex gap-3 border-b border-border py-3 text-lg leading-7">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-on-ink">{i + 1}</span>
            <span>{m.text}</span>
          </li>
        ))}
        {r.method.length === 0 && <li className="text-text-muted">No method written yet. Ask the head chef.</li>}
      </ol>
      <p className="mt-6 text-sm text-text-muted">Spec updated {dateTimeUk(r.updatedAt)}</p>
    </article>
  );
}

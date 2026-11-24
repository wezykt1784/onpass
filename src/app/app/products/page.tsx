import type { Metadata } from "next";
import Link from "next/link";
import { Carrot, Plus, Search } from "lucide-react";
import { listAllergens, listProducts, listSuppliers } from "@/lib/data";
import { allergenNames, money } from "@/lib/format";
import { AllergenChip, ButtonLink, EmptyState, PageHeader, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/app/products">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const missingOnly = sp.missing === "1";
  const [all, suppliers, allergens] = await Promise.all([listProducts(q), listSuppliers(), listAllergens()]);
  const products = missingOnly ? all.filter((p) => p.allergenStatus === "unknown") : all;
  const sup = new Map(suppliers.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Products" sub="What you buy, with supplier codes, allergens and nutrition." actions={<ButtonLink href="/app/products/new"><Plus aria-hidden />New product</ButtonLink>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form role="search" className="relative w-full max-w-sm" action="/app/products">
          <label htmlFor="q" className="sr-only">Search products</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Search by name or supplier code" className={`${inputClass} pl-9`} />
          {missingOnly && <input type="hidden" name="missing" value="1" />}
        </form>
        <Link href={missingOnly ? "/app/products" : "/app/products?missing=1"} aria-current={missingOnly ? "true" : undefined}
          className={`inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold ${missingOnly ? "bg-text text-bg" : "border border-border-input bg-bg"}`}>
          Allergens missing
        </Link>
        <p className="ml-auto text-sm text-text-muted" aria-live="polite">{products.length} products</p>
      </div>
      {products.length === 0 ? (
        <EmptyState icon={q ? <Search /> : <Carrot />} text={q ? `No products match "${q}".` : missingOnly ? "Every product has its allergens confirmed." : "No products yet. Add what you buy, then use it in recipes."} />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-border bg-bg">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border bg-surface text-left text-text-muted">
              <th scope="col" className="px-4 py-2.5 font-semibold">Product</th><th scope="col" className="px-4 py-2.5 font-semibold">Supplier</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Allergens</th><th scope="col" className="px-4 py-2.5 text-right font-semibold">Pack</th>
            </tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-sunken">
                  <td className="px-4 py-3"><Link className="font-semibold hover:underline" href={`/app/products/${p.id}`}>{p.name}</Link></td>
                  <td className="px-4 py-3">{p.supplierId ? sup.get(p.supplierId) : ""}<div className="font-mono text-xs text-text-muted">{p.supplierCode}</div></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1.5">
                    {p.allergenStatus === "unknown" && <AllergenChip size="sm" level="unknown" name="Not confirmed" />}
                    {allergenNames(p.allergens.filter((a) => a.level === "contains").map((a) => a.allergenId), allergens).map((n) => <AllergenChip key={n} size="sm" name={n} />)}
                    {allergenNames(p.allergens.filter((a) => a.level === "may_contain").map((a) => a.allergenId), allergens).map((n) => <AllergenChip key={n} size="sm" level="may_contain" name={n} />)}
                  </div></td>
                  <td className="px-4 py-3 text-right tabular">{p.packSize ? `${p.packSize} ${p.baseUnit}` : ""}<div className="text-xs text-text-muted">{money(p.packCostPence)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

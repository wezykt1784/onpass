import type { Metadata } from "next";
import Link from "next/link";
import { Search, Utensils } from "lucide-react";
import { listBrands, listMenus, listPublications } from "@/lib/data";
import { effectiveLive } from "@/lib/publishing";
import { dateUk } from "@/lib/format";
import { EmptyState, PageHeader, Pill, buttonClass, inputClass } from "@/components/ui";
import { NewMenuButton } from "./new-menu";

export const metadata: Metadata = { title: "Menus" };

export default async function MenusPage({ searchParams }: PageProps<"/app/menus">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const brandId = typeof sp.brand === "string" ? sp.brand : "";
  const state = sp.state === "live" || sp.state === "offline" ? sp.state : "";
  const [all, brands] = await Promise.all([listMenus(q), listBrands()]);
  const liveBy = new Map<string, string[]>(); // menu id -> brand names where it's live
  for (const b of brands) for (const p of effectiveLive(await listPublications(b.id))) liveBy.set(p.menuId, [...(liveBy.get(p.menuId) ?? []), b.name]);
  const menus = all
    .filter((m) => !brandId || m.menu.brandIds.includes(brandId))
    .filter((m) => !state || (state === "live") === liveBy.has(m.menu.id));
  const filtered = Boolean(brandId || state);
  return (
    <>
      <PageHeader title="Menus" sub="Build menus from your dishes, then print the spec book or publish to guests." actions={<NewMenuButton />} />
      <form role="search" className="relative mb-4 w-full max-w-sm" action="/app/menus">
        <label htmlFor="q" className="sr-only">Search menus</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or code" className={`${inputClass} pl-9`} />
      </form>
      <form action="/app/menus" className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filter menus">
        {q && <input type="hidden" name="q" value={q} />}
        <label className="grid gap-1 text-sm font-semibold" htmlFor="f-brand">
          Brand
          <select id="f-brand" name="brand" defaultValue={brandId} className={`${inputClass} w-52`}>
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold" htmlFor="f-state">
          Guests
          <select id="f-state" name="state" defaultValue={state} className={`${inputClass} w-44`}>
            <option value="">Live or not</option>
            <option value="live">Live somewhere</option>
            <option value="offline">Not live anywhere</option>
          </select>
        </label>
        <button className={buttonClass("secondary")}>Apply</button>
        {filtered && <Link className={buttonClass("ghost")} href={q ? `/app/menus?q=${encodeURIComponent(q)}` : "/app/menus"}>Clear filters</Link>}
      </form>
      {menus.length === 0 ? (
        <EmptyState icon={q ? <Search /> : <Utensils />} text={q ? `No menus match "${q}".` : filtered ? "No menus match these filters." : "No menus yet. Build one from your recipes."} action={q || filtered ? undefined : <NewMenuButton />} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map(({ menu: m, dishCount }) => (
            <li key={m.id}>
              <Link href={`/app/menus/${m.id}`} className="block h-full rounded-lg border border-border bg-bg p-5 hover:shadow-card">
                <p className="font-bold break-words">{m.name}</p>
                <p className="font-mono text-xs text-text-muted">{m.code ?? "No code"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                  {liveBy.has(m.id) ? <Pill tone="live">Live: {liveBy.get(m.id)!.join(", ")}</Pill> : <Pill tone="staging">Not live</Pill>}
                  <span>{dishCount} {dishCount === 1 ? "dish" : "dishes"}</span>
                  {m.menuDate && <span>· {dateUk(m.menuDate)}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

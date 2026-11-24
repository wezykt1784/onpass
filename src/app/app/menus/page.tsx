import type { Metadata } from "next";
import Link from "next/link";
import { Search, Utensils } from "lucide-react";
import { listMenus } from "@/lib/data";
import { dateUk } from "@/lib/format";
import { EmptyState, PageHeader, Pill, inputClass } from "@/components/ui";
import { NewMenuButton } from "./new-menu";

export const metadata: Metadata = { title: "Menus" };

export default async function MenusPage({ searchParams }: PageProps<"/app/menus">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const menus = await listMenus(q);
  return (
    <>
      <PageHeader title="Menus" sub="Build menus from your dishes, then print the spec book or publish to guests." actions={<NewMenuButton />} />
      <form role="search" className="relative mb-4 w-full max-w-sm" action="/app/menus">
        <label htmlFor="q" className="sr-only">Search menus</label>
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or code" className={`${inputClass} pl-9`} />
      </form>
      {menus.length === 0 ? (
        <EmptyState icon={q ? <Search /> : <Utensils />} text={q ? `No menus match "${q}".` : "No menus yet. Build one from your recipes."} action={q ? undefined : <NewMenuButton />} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {menus.map(({ menu: m, dishCount }) => (
            <li key={m.id}>
              <Link href={`/app/menus/${m.id}`} className="block h-full rounded-lg border border-border bg-bg p-5 hover:shadow-card">
                <p className="font-bold break-words">{m.name}</p>
                <p className="font-mono text-xs text-text-muted">{m.code ?? "No code"}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-text-muted">
                  <Pill tone="staging">Not published</Pill>
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

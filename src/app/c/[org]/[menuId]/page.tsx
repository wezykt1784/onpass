import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildSnapshot } from "@/lib/data";
import { AllergenChip } from "@/components/ui";

export const metadata: Metadata = { title: "Menu specs" };

export default async function CookbookMenu({ params }: PageProps<"/c/[org]/[menuId]">) {
  const { org, menuId } = await params;
  const snap = await buildSnapshot(menuId);
  if (!snap) notFound();
  return (
    <>
      <Link href={`/c/${org}`} className="mb-2 inline-flex min-h-11 items-center gap-1 font-semibold text-text-muted"><ChevronLeft aria-hidden className="size-5" />Menus</Link>
      <h1 className="mb-4 text-xl">{snap.name}</h1>
      {snap.sections.map((sec) => (
        <section key={sec.title} className="mb-6" aria-labelledby={`h-${sec.title}`}>
          <h2 id={`h-${sec.title}`} className="mb-2 text-sm font-bold uppercase tracking-wide text-text-muted">{sec.title}</h2>
          <ul className="grid gap-2">
            {sec.rows.filter((r) => r.kind === "item").map((r) => r.kind === "item" && (
              <li key={r.dish.recipeId}>
                <Link href={`/c/${org}/recipe/${r.dish.recipeId}`} className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block font-bold">{r.dish.name}</span>
                    <span className="font-mono text-xs text-text-muted">{r.dish.code}</span>
                    {r.dish.unknown && <span className="ml-2"><AllergenChip size="sm" level="unknown" name="Allergens missing" /></span>}
                  </span>
                  <ChevronRight aria-hidden className="size-6 shrink-0 text-text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

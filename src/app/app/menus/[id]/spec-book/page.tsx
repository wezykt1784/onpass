import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, Eye, TriangleAlert } from "lucide-react";
import { getSpecBookData } from "@/lib/data";
import { dateUk } from "@/lib/format";
import { Card, Notice, PageHeader, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Spec book" };

export default async function SpecBookPage({ params }: PageProps<"/app/menus/[id]/spec-book">) {
  const { id } = await params;
  const d = await getSpecBookData(id);
  if (!d) notFound();
  const dishes = d.sections.flatMap((s) => s.dishes);
  const batchPages = dishes.filter((x) => x.batches.length).length;
  const pages = 1 + d.sections.length + dishes.length + batchPages;
  const missing = dishes.filter((x) => x.rollup.unknownProducts.length);
  const noPhoto = dishes.filter((x) => !x.recipe.photoPath);
  const noMethod = [...dishes.map((x) => x.recipe), ...dishes.flatMap((x) => x.batches)].filter((r) => !r.method.length);
  return (
    <>
      <Link href={`/app/menus/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />{d.menu.name}
      </Link>
      <PageHeader title="Spec book" sub={`${d.menu.name}${d.menu.menuDate ? `, dated ${dateUk(d.menu.menuDate)}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <h2 className="mb-1 text-lg">What&apos;s in it</h2>
          <p className="mb-4 text-text-muted">About {pages} pages, A4 landscape: a cover, a page for each section, one page per dish, and the batch recipes for each dish straight after it.</p>
          <dl className="mb-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md bg-surface p-3"><dt className="text-sm text-text-muted">Sections</dt><dd className="text-xl tabular">{d.sections.length}</dd></div>
            <div className="rounded-md bg-surface p-3"><dt className="text-sm text-text-muted">Dishes</dt><dd className="text-xl tabular">{dishes.length}</dd></div>
            <div className="rounded-md bg-surface p-3"><dt className="text-sm text-text-muted">Batch pages</dt><dd className="text-xl tabular">{batchPages}</dd></div>
          </dl>
          {dishes.length === 0 ? (
            <Notice tone="warning">This menu has no dishes yet, so the spec book would only have a cover. Add dishes first.</Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              <a className={buttonClass("primary", "lg")} href={`/api/spec-book/${id}`} download><Download aria-hidden />Download PDF</a>
              <a className={buttonClass("secondary", "lg")} href={`/api/spec-book/${id}?view=1`} target="_blank" rel="noopener"><Eye aria-hidden />Open in a new tab</a>
            </div>
          )}
          <p className="mt-3 text-sm text-text-muted">It&apos;s built fresh each time, so it always matches the recipes as they are now.</p>
        </Card>
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-lg">Before you print</h2>
          <ul className="grid gap-3 text-sm">
            <Check ok={!missing.length} good="Every dish has full allergen data" bad={`${missing.length} ${missing.length === 1 ? "dish is" : "dishes are"} missing allergen data`} items={missing.map((x) => ({ id: x.recipe.id, name: x.recipe.name }))} />
            <Check ok={!noPhoto.length} good="Every dish has a photo" bad={`${noPhoto.length} ${noPhoto.length === 1 ? "dish has" : "dishes have"} no photo`} items={noPhoto.map((x) => ({ id: x.recipe.id, name: x.recipe.name }))} />
            <Check ok={!noMethod.length} good="Every recipe has a method" bad={`${noMethod.length} ${noMethod.length === 1 ? "recipe has" : "recipes have"} no method`} items={noMethod.map((r) => ({ id: r.id, name: r.name }))} />
          </ul>
        </Card>
      </div>
    </>
  );
}

function Check({ ok, good, bad, items }: { ok: boolean; good: string; bad: string; items: { id: string; name: string }[] }) {
  return (
    <li>
      <p className={`flex items-center gap-2 font-semibold ${ok ? "text-suitable" : "text-warning"}`}>
        {!ok && <TriangleAlert aria-hidden className="size-4" />}{ok ? good : bad}
      </p>
      {!ok && <ul className="ml-6 mt-1 list-disc">{items.slice(0, 6).map((x) => <li key={x.id}><Link href={`/app/recipes/${x.id}`} className="hover:underline">{x.name}</Link></li>)}</ul>}
    </li>
  );
}

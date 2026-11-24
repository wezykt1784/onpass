import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { listMenus } from "@/lib/data";
import { EmptyState, PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Spec books" };
export default async function Page() {
  const menus = await listMenus();
  return (
    <>
      <PageHeader title="Spec books" sub="Pick a menu to build its spec book. Styles (colours, logo, cover, cost) arrive in milestone 3." />
      {menus.length === 0 ? <EmptyState icon={<BookOpen />} text="No menus yet, so there's nothing to print." /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {menus.map(({ menu, dishCount }) => (
            <li key={menu.id}><Link href={`/app/menus/${menu.id}/spec-book`} className="flex items-center gap-3 rounded-lg border border-border bg-bg p-4 hover:shadow-card">
              <BookOpen aria-hidden className="size-6 text-text-muted" /><span><span className="block font-bold">{menu.name}</span><span className="text-sm text-text-muted">{dishCount} dishes</span></span>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}

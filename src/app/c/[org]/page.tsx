import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { listMenus } from "@/lib/data";
import { dateUk } from "@/lib/format";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Specs" };

export default async function CookbookHome({ params }: PageProps<"/c/[org]">) {
  const { org } = await params;
  const menus = await listMenus();
  return (
    <>
      <h1 className="mb-4 text-xl">Menus</h1>
      {menus.length === 0 ? <EmptyState text="No menus have been shared with your kitchen yet." /> : (
        <ul className="grid gap-3">
          {menus.map(({ menu, dishCount }) => (
            <li key={menu.id}>
              <Link href={`/c/${org}/${menu.id}`} className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 hover:bg-surface">
                <span><span className="block text-lg font-bold">{menu.name}</span><span className="text-sm text-text-muted">{dishCount} dishes{menu.menuDate ? ` · ${dateUk(menu.menuDate)}` : ""}</span></span>
                <ChevronRight aria-hidden className="size-6 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

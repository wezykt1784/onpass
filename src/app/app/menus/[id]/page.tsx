import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getMenu, getOrg, listAllergens, listRecipes } from "@/lib/data";
import { MenuEditor } from "./menu-editor";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage({ params }: PageProps<"/app/menus/[id]">) {
  const { id } = await params;
  const menu = await getMenu(id);
  if (!menu) notFound();
  const [dishes, allergens, org] = await Promise.all([listRecipes({ kind: "dish" }), listAllergens(), getOrg()]);
  return (
    <>
      <Link href="/app/menus" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />Menus
      </Link>
      <MenuEditor key={menu.id} menu={menu} orgSlug={org.slug}
        dishes={dishes.map(({ recipe, rollup }) => ({
          id: recipe.id, name: recipe.name, code: recipe.code, pricePence: recipe.pricePence,
          unknown: rollup.unknownProducts.length > 0, contains: rollup.contains,
        }))}
        allergens={allergens} />
    </>
  );
}

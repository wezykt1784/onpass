import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { currentUser, getMenu, getOrg, listAllergens, listBrands, listRecipes } from "@/lib/data";
import { MenuEditor } from "./menu-editor";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage({ params }: PageProps<"/app/menus/[id]">) {
  const { id } = await params;
  const menu = await getMenu(id);
  if (!menu) notFound();
  const [dishes, allergens, org, brands, user] = await Promise.all([listRecipes({ kind: "dish" }), listAllergens(), getOrg(), listBrands(), currentUser()]);
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
        allergens={allergens}
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        canChooseBrands={user?.role === "org_admin" || user?.role === "central_chef"} />
    </>
  );
}

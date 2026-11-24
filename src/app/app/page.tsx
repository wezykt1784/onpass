import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChefHat, TriangleAlert, Utensils } from "lucide-react";
import { getOrg, listMenus, listRecipes } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const [org, menus, recipes] = await Promise.all([getOrg(), listMenus(), listRecipes()]);
  const dishes = recipes.filter((r) => r.recipe.kind === "dish");
  const missing = recipes.filter((r) => r.rollup.unknownProducts.length > 0);
  const drafts = recipes.filter((r) => r.recipe.status === "draft");
  const stats = [
    { href: "/app/menus", label: "Menus", value: menus.length, icon: Utensils },
    { href: "/app/recipes?kind=dish", label: "Dishes", value: dishes.length, icon: ChefHat },
    { href: "/app/recipes?kind=batch", label: "Batch recipes", value: recipes.length - dishes.length, icon: BookOpen },
  ];
  return (
    <>
      <PageHeader title={org.name} sub="Everything that needs a look today." />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {stats.map(({ href, label, value, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-4 rounded-lg border border-border bg-bg p-5 hover:shadow-card">
            <Icon aria-hidden className="size-6 text-text-muted" />
            <div><p className="text-xl tabular">{value}</p><p className="text-sm text-text-muted">{label}</p></div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg"><TriangleAlert aria-hidden className="size-5 text-warning" />Allergen data missing</h2>
          {missing.length === 0 ? <p className="text-text-muted">Every recipe has full allergen data.</p> : (
            <ul className="grid gap-2">
              {missing.map(({ recipe }) => (
                <li key={recipe.id}><Link className="font-semibold hover:underline" href={`/app/recipes/${recipe.id}`}>{recipe.name}</Link></li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-lg">Drafts</h2>
          {drafts.length === 0 ? <p className="text-text-muted">No drafts waiting.</p> : (
            <ul className="grid gap-2">
              {drafts.map(({ recipe }) => (
                <li key={recipe.id}><Link className="font-semibold hover:underline" href={`/app/recipes/${recipe.id}`}>{recipe.name}</Link></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

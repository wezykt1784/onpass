import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  getRecipe, listAllergens, listDiets, listProducts, listRecipes, listSuppliers, listUsers, recipesUsingRecipe,
} from "@/lib/data";
import { RecipeEditor } from "./recipe-editor";

export async function generateMetadata({ params }: PageProps<"/app/recipes/[id]">): Promise<Metadata> {
  const r = await getRecipe((await params).id);
  return { title: r?.name ?? "Recipe" };
}

export default async function RecipePage({ params }: PageProps<"/app/recipes/[id]">) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const [products, suppliers, allergens, diets, usedIn, users, batchRows] = await Promise.all([
    listProducts(), listSuppliers(), listAllergens(), listDiets(), recipesUsingRecipe(id), listUsers(), listRecipes({ kind: "batch" }),
  ]);
  const batches = batchRows.map((b) => b.recipe);
  const updatedBy = users.find((u) => u.id === recipe.updatedBy)?.name ?? null;

  return (
    <>
      <Link href="/app/recipes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />Recipes
      </Link>
      <RecipeEditor
        key={recipe.id}
        recipe={recipe}
        products={products}
        batches={batches}
        suppliers={suppliers}
        allergens={allergens}
        diets={diets}
        usedIn={usedIn.map((r) => ({ id: r.id, name: r.name }))}
        updatedBy={updatedBy}
      />
    </>
  );
}

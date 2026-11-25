import type { Metadata } from "next";
import { currentUser, listAllergens, listOldSpecBook, listProducts, listSuppliers } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui";
import { RecipeImport } from "./recipe-import";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  const me = await currentUser();
  const canEdit = me?.role === "org_admin" || me?.role === "central_chef";
  if (!canEdit) {
    return (
      <>
        <PageHeader title="Import recipes" />
        <Card className="p-5 text-sm">Only central chefs and admins can import recipes.</Card>
      </>
    );
  }
  const [old, products, suppliers, allergens] = await Promise.all([listOldSpecBook(), listProducts(), listSuppliers(), listAllergens()]);
  const sup = new Map(suppliers.map((s) => [s.id, s.name]));
  return (
    <>
      <PageHeader title="Import recipes" sub="Bring recipes across from your old spec book, with their photos and checked allergens, and supplier prices from your Recipe build file." />
      <RecipeImport
        old={old}
        allergens={allergens}
        products={products.map((p) => ({ name: p.name, supplier: p.supplierId ? sup.get(p.supplierId) ?? null : null, baseUnit: p.baseUnit }))}
      />
    </>
  );
}

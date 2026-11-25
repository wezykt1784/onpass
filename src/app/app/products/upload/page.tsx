import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { currentUser, listAllergens, listDiets, listProducts, listSuppliers } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui";
import { ProductUpload } from "./product-upload";

export const metadata: Metadata = { title: "Upload products" };

export default async function UploadProductsPage() {
  const [me, allergens, diets, products, suppliers] = await Promise.all([currentUser(), listAllergens(), listDiets(), listProducts(), listSuppliers()]);
  const canEdit = me?.role === "org_admin" || me?.role === "central_chef" || me?.role === "head_chef";
  const sup = new Map(suppliers.map((s) => [s.id, s.name]));
  // Just enough to show "new" or "updates" in the preview; the server matches again when saving.
  const existing = products.map((p) => ({ name: p.name, supplier: p.supplierId ? sup.get(p.supplierId) ?? null : null, code: p.supplierCode }));
  return (
    <>
      <Link href="/app/products" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />Products
      </Link>
      <PageHeader title="Upload products" sub="Add or update many products at once from a supplier price list or your own spreadsheet." />
      {canEdit ? (
        <ProductUpload allergens={allergens} diets={diets} existing={existing} />
      ) : (
        <Card className="p-5 text-sm">Your role can read products but not change them. Ask a central chef or an admin to upload them.</Card>
      )}
    </>
  );
}

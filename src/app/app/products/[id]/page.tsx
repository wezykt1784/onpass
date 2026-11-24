import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getProduct, listAllergens, listDiets, listSuppliers, recipesUsingProduct } from "@/lib/data";
import { Card, PageHeader } from "@/components/ui";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/app/products/[id]">) {
  const { id } = await params;
  const isNew = id === "new";
  const product = isNew ? null : await getProduct(id);
  if (!isNew && !product) notFound();
  const [suppliers, allergens, diets, usedIn] = await Promise.all([
    listSuppliers(), listAllergens(), listDiets(), isNew ? Promise.resolve([]) : recipesUsingProduct(id),
  ]);
  return (
    <>
      <Link href="/app/products" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />Products
      </Link>
      <PageHeader title={product?.name ?? "New product"} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="p-5"><ProductForm key={product?.id ?? "new"} product={product ?? undefined} suppliers={suppliers} allergens={allergens} diets={diets} /></Card>
        {usedIn.length > 0 && (
          <Card className="content-start p-5 h-fit">
            <h2 className="mb-2 text-lg">Used in</h2>
            <ul className="grid gap-1 text-sm">{usedIn.map((r) => <li key={r.id}><Link className="font-semibold hover:underline" href={`/app/recipes/${r.id}`}>{r.name}</Link></li>)}</ul>
          </Card>
        )}
      </div>
    </>
  );
}

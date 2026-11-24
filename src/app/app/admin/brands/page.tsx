import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { currentUser, listBrands, listSites } from "@/lib/data";
import { photoUrl } from "@/lib/supabase/env";
import { AdminOnly } from "@/components/admin-only";
import { ButtonLink, EmptyState, PageHeader, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Brands and sites" };

export default async function BrandsPage() {
  const user = await currentUser();
  if (user?.role !== "org_admin") return <AdminOnly title="Brands and sites" />;
  const [brands, sites] = await Promise.all([listBrands(), listSites()]);
  return (
    <>
      <PageHeader title="Brands and sites" sub="Each brand has its own guest menu settings. Each site gets its own menu address and QR code."
        actions={<ButtonLink href="/app/admin/brands/new"><Plus aria-hidden />New brand</ButtonLink>} />
      {brands.length === 0 ? (
        <EmptyState icon={<Building2 />} text="No brands yet. Add one for each kind of venue you run, then add its sites." action={<ButtonLink href="/app/admin/brands/new">Add a brand</ButtonLink>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((b) => {
            const own = sites.filter((s) => s.brandId === b.id);
            return (
              <li key={b.id}>
                <Link href={`/app/admin/brands/${b.id}`} className="flex h-full gap-4 rounded-lg border border-border bg-bg p-5 hover:shadow-card">
                  {b.logoPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl(b.logoPath)!} alt="" className="size-12 shrink-0 rounded-md object-contain" />
                  ) : <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-md bg-surface text-lg font-bold">{b.name[0]}</span>}
                  <span className="min-w-0">
                    <span className="block font-bold break-words">{b.name}</span>
                    <span className="block text-sm text-text-muted">{own.length} {own.length === 1 ? "site" : "sites"}</span>
                    {!b.enabled && <Pill tone="archived" className="mt-1">Switched off</Pill>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import QRCode from "qrcode";
import { currentUser, getBrand, getOrg, listSites } from "@/lib/data";
import { guestPath, siteOrigin } from "@/lib/site-url";
import { AdminOnly } from "@/components/admin-only";
import { PageHeader } from "@/components/ui";
import { BrandForm, LogoCard, SitesCard } from "./brand-forms";

export const metadata: Metadata = { title: "Brand" };

export default async function BrandPage({ params }: PageProps<"/app/admin/brands/[id]">) {
  const { id } = await params;
  const user = await currentUser();
  if (user?.role !== "org_admin") return <AdminOnly title="Brand" />;
  const isNew = id === "new";
  const brand = isNew ? null : await getBrand(id);
  if (!isNew && !brand) notFound();
  const [sites, org, origin] = await Promise.all([brand ? listSites(brand.id) : Promise.resolve([]), getOrg(), siteOrigin()]);
  const withQr = await Promise.all(sites.map(async (s) => {
    const url = `${origin}${guestPath(org.slug, s.slug)}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 4, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
    return { site: s, url, svg };
  }));
  return (
    <>
      <Link href="/app/admin/brands" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />Brands and sites
      </Link>
      <PageHeader title={brand?.name ?? "New brand"} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="grid min-w-0 content-start gap-6">
          <BrandForm key={brand?.id ?? "new"} brand={brand} />
          {brand && <SitesCard brandId={brand.id} sites={withQr} />}
        </div>
        {brand && <LogoCard brand={brand} />}
      </div>
    </>
  );
}

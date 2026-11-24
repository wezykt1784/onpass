import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { currentUser, getBrand, getOrg, listMenus, listPublications, listSites, previewPublication } from "@/lib/data";
import { effectiveLive } from "@/lib/publishing";
import { guestPath } from "@/lib/site-url";
import { Notice, PageHeader } from "@/components/ui";
import { Board } from "./board";

export const metadata: Metadata = { title: "Publish" };

export default async function BrandPublishPage({ params }: PageProps<"/app/publish/[brand]">) {
  const { brand: brandId } = await params;
  const [brand, user] = await Promise.all([getBrand(brandId), currentUser()]);
  if (!brand) notFound();
  const canManage = user?.role === "org_admin" || user?.role === "central_chef" || (user?.role === "head_chef" && user.brandId === brand.id);
  const [pubs, menus, sites, org] = await Promise.all([listPublications(brand.id), listMenus(), listSites(brand.id), getOrg()]);
  const live = effectiveLive(pubs);
  const checks = Object.fromEntries(await Promise.all(pubs.map(async (p) => {
    const c = await previewPublication(p.id);
    return [p.id, c ? { issues: c.issues, changedSince: c.changedSince } : null] as const;
  })));
  const linked = menus.filter((m) => m.menu.brandIds.includes(brand.id)).map((m) => ({ id: m.menu.id, name: m.menu.name, dishCount: m.dishCount }));
  return (
    <>
      <Link href="/app/publish" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronLeft aria-hidden className="size-4" />Publish
      </Link>
      <PageHeader title={brand.name} sub={sites.length ? (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {sites.map((s) => (
            <a key={s.id} href={guestPath(org.slug, s.slug)} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-accent underline">
              {s.name}<ExternalLink aria-hidden className="size-3.5" /><span className="sr-only">(opens the guest menu)</span>
            </a>
          ))}
        </span>
      ) : "No sites yet, so guests can't see these menus. An admin adds sites under Admin, Brands and sites."} />
      {!canManage && <div className="mb-4"><Notice tone="warning">You can look, but only central chefs and this brand&apos;s head chef can publish.</Notice></div>}
      {!brand.enabled && <div className="mb-4"><Notice tone="warning">This brand is switched off, so none of its guest menus are online.</Notice></div>}
      <Board
        brandId={brand.id}
        orgSlug={org.slug}
        canManage={canManage}
        canChangeRefresh={user?.role === "org_admin" || user?.role === "central_chef"}
        menus={linked}
        pubs={pubs.map((p) => ({ ...p, isLive: live.some((l) => l.id === p.id), check: checks[p.id] }))}
      />
    </>
  );
}

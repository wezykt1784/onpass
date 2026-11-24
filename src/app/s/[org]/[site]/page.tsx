import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSiteMenus } from "@/lib/data";
import { ListSkeleton } from "@/components/ui";
import { GuestMenu } from "@/app/m/[org]/[menuId]/guest-menu";
import { photoUrl } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Menu", robots: { index: false } };

async function SiteMenus({ params }: { params: PageProps<"/s/[org]/[site]">["params"] }) {
  const { org, site } = await params;
  const data = await getSiteMenus(org, site);
  if (!data) notFound();
  if (data.menus.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface p-6 text-center">
        <div className="grid max-w-sm justify-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- uploaded logo from our own storage */}
          {data.brand.logoPath && <img src={photoUrl(data.brand.logoPath)!} alt={data.brand.name} className="mb-4 max-h-16 max-w-48 object-contain" />}
          <h1 className="mb-2 text-xl">{data.site.name}</h1>
          <p className="text-text-muted">The menu isn&apos;t online right now. Please ask the team, they&apos;ll be happy to help with allergens.</p>
        </div>
      </main>
    );
  }
  return (
    <GuestMenu
      org={{ ...data.org, disclaimer: data.brand.guest.disclaimer || data.org.disclaimer, calorieStatement: data.brand.guest.showKcal ? data.org.calorieStatement : null }}
      venue={data.site.name}
      logo={data.brand.logoPath ? { src: photoUrl(data.brand.logoPath)!, alt: data.brand.name } : null}
      note={data.brand.guest.headerNote}
      showKcal={data.brand.guest.showKcal}
      menus={data.menus}
      allergens={data.allergens}
      diets={data.diets}
    />
  );
}

export default function SitePage({ params }: PageProps<"/s/[org]/[site]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl p-4"><ListSkeleton /></div>}>
      <SiteMenus params={params} />
    </Suspense>
  );
}

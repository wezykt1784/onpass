import type { Metadata } from "next";
import Link from "next/link";
import { Send } from "lucide-react";
import { currentUser, listBrands, listPublications, listSites } from "@/lib/data";
import { effectiveLive } from "@/lib/publishing";
import { ButtonLink, EmptyState, PageHeader, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Publish" };

export default async function PublishPage() {
  const [user, brands, sites] = await Promise.all([currentUser(), listBrands(), listSites()]);
  const mine = brands.filter((b) => user?.role !== "head_chef" || user.brandId === b.id);
  const rows = await Promise.all(mine.map(async (b) => {
    const pubs = await listPublications(b.id);
    const live = effectiveLive(pubs);
    return {
      brand: b, live: live.length,
      staging: pubs.filter((p) => p.stage === "staging" && !live.includes(p)).length,
      scheduled: pubs.filter((p) => p.stage === "staging" && p.liveFrom && !live.includes(p)).length,
      sites: sites.filter((s) => s.brandId === b.id).length,
    };
  }));
  return (
    <>
      <PageHeader title="Publish" sub="Choose a brand to put menus in front of guests. Check them in staging first, then go live now or on a date." />
      {rows.length === 0 ? (
        <EmptyState icon={<Send />} text={user?.role === "org_admin" ? "No brands yet. Add a brand and its sites first." : "No brands to publish to yet. Ask an admin to set them up."}
          action={user?.role === "org_admin" ? <ButtonLink href="/app/admin/brands/new">Add a brand</ButtonLink> : undefined} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.brand.id}>
              <Link href={`/app/publish/${r.brand.id}`} className="block h-full rounded-lg border border-border bg-bg p-5 hover:shadow-card">
                <span className="block font-bold break-words">{r.brand.name}</span>
                <span className="block text-sm text-text-muted">{r.sites} {r.sites === 1 ? "site" : "sites"}</span>
                <span className="mt-3 flex flex-wrap gap-2">
                  <Pill tone={r.live ? "live" : "archived"}>{r.live} live</Pill>
                  {r.staging > 0 && <Pill tone="staging">{r.staging} in staging</Pill>}
                  {r.scheduled > 0 && <Pill tone="scheduled">{r.scheduled} scheduled</Pill>}
                  {!r.brand.enabled && <Pill tone="archived">Brand switched off</Pill>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

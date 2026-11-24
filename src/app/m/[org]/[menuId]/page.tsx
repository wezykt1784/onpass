import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildSnapshot, getOrgBySlug, guestLists } from "@/lib/data";
import { ListSkeleton } from "@/components/ui";
import { GuestMenu } from "./guest-menu";

export const metadata: Metadata = { title: "Menu", robots: { index: false } };

async function Menu({ params }: { params: PageProps<"/m/[org]/[menuId]">["params"] }) {
  const { org: slug, menuId } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();
  const [snap, { allergens, diets }] = await Promise.all([buildSnapshot(menuId, slug), guestLists(slug, menuId)]);
  if (!snap) notFound();
  return <GuestMenu org={org} menus={[snap]} allergens={allergens} diets={diets} venue={`${org.name} · preview, not published`} />;
}

export default function GuestPage({ params }: PageProps<"/m/[org]/[menuId]">) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl p-4"><ListSkeleton /></div>}>
      <Menu params={params} />
    </Suspense>
  );
}

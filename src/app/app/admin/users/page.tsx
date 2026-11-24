import type { Metadata } from "next";
import { currentUser, listBrands, listMembers } from "@/lib/data";
import { useSupabase } from "@/lib/supabase/env";
import { AdminOnly } from "@/components/admin-only";
import { PageHeader } from "@/components/ui";
import { People } from "./people";

export const metadata: Metadata = { title: "People" };

export default async function UsersPage() {
  const me = await currentUser();
  if (me?.role !== "org_admin") return <AdminOnly title="People" />;
  const [members, brands] = await Promise.all([listMembers(), listBrands()]);
  return (
    <>
      <PageHeader title="People" sub="Who can sign in, what they can do, and which brand they work on." />
      <People me={me.id} members={members} brands={brands.map((b) => ({ id: b.id, name: b.name }))} demo={!useSupabase} />
    </>
  );
}

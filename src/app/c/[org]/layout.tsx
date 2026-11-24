import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { currentUser, getOrgBySlug, signedInWithoutOrg } from "@/lib/data";
import { ListSkeleton } from "@/components/ui";

async function Guard({ params, children }: { params: LayoutProps<"/c/[org]">["params"]; children: React.ReactNode }) {
  const { org: slug } = await params;
  const [user, org] = await Promise.all([currentUser(), getOrgBySlug(slug)]);
  if (!user) redirect((await signedInWithoutOrg()) != null ? "/no-access" : "/login");
  if (!org) redirect("/login");
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between bg-ink px-4 text-on-ink">
        <Link href={`/c/${org.slug}`} className="flex items-center gap-2 font-bold"><BookOpen aria-hidden className="size-5" />Specs</Link>
        <span className="truncate text-sm opacity-90">{org.name}</span>
      </header>
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-4">{children}</main>
    </>
  );
}

export default function CookbookLayout({ params, children }: LayoutProps<"/c/[org]">) {
  return (
    <div className="min-h-screen bg-bg">
      <Suspense fallback={<div className="p-4"><ListSkeleton /></div>}><Guard params={params}>{children}</Guard></Suspense>
    </div>
  );
}

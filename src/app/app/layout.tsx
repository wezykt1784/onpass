import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { BottomNav, SidebarNav } from "@/components/sidebar";
import { ListSkeleton } from "@/components/ui";
import { currentUser, getOrg } from "@/lib/data";
import { signOut } from "@/lib/actions";

async function UserBox() {
  const [user, org] = await Promise.all([currentUser(), getOrg()]);
  if (!user) redirect("/login");
  if (user.role === "viewer") redirect(`/c/${org.slug}`);
  return (
    <div className="grid gap-2 border-t border-border pt-4 text-sm">
      <div className="min-w-0">
        <p className="truncate font-semibold">{user.name}</p>
        <p className="truncate text-text-muted">{org.name}</p>
      </div>
      <form action={signOut}>
        <button className="flex items-center gap-2 text-text-muted hover:text-text [&_svg]:size-4"><LogOut aria-hidden />Sign out</button>
      </form>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="min-h-screen bg-surface md:grid md:grid-cols-[var(--layout-sidebar)_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-bg focus:px-3 focus:py-2">Skip to content</a>
      <aside className="sticky top-0 hidden h-screen flex-col justify-between border-r border-border bg-bg p-4 md:flex">
        <div>
          <p className="mb-6 px-3 text-lg font-bold tracking-tight">Spec</p>
          <Suspense fallback={null}><SidebarNav /></Suspense>
        </div>
        <Suspense fallback={null}><UserBox /></Suspense>
      </aside>
      <main id="main" className="min-w-0 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-[var(--layout-content-max)]">
          <Suspense fallback={<ListSkeleton />}>{children}</Suspense>
        </div>
      </main>
      <Suspense fallback={null}><BottomNav /></Suspense>
    </div>
  );
}

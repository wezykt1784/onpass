"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChefHat, Carrot, House, Send, Settings, Upload, Utensils } from "lucide-react";

const items = [
  { href: "/app", label: "Home", icon: House, exact: true },
  { href: "/app/recipes", label: "Recipes", icon: ChefHat },
  { href: "/app/products", label: "Products", icon: Carrot },
  { href: "/app/menus", label: "Menus", icon: Utensils },
  { href: "/app/publish", label: "Publish", icon: Send },
  { href: "/app/spec-books", label: "Spec books", icon: BookOpen },
  { href: "/app/imports", label: "Import", icon: Upload },
  { href: "/app/admin", label: "Admin", icon: Settings },
];

export function SidebarNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="grid gap-1">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold [&_svg]:size-[18px] ${active ? "bg-ink text-on-ink" : "text-text hover:bg-surface"}`}>
            <Icon aria-hidden /> <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-bg md:hidden">
      {items.slice(0, 5).map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={`grid h-14 place-items-center content-center gap-0.5 text-xs font-semibold [&_svg]:size-5 ${active ? "text-accent" : "text-text-muted"}`}>
            <Icon aria-hidden />{label}
          </Link>
        );
      })}
    </nav>
  );
}

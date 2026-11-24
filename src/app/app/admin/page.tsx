import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ListChecks, Palette, Users } from "lucide-react";
import { PageHeader } from "@/components/ui";
export const metadata: Metadata = { title: "Admin" };
const items = [
  { href: "/app/admin/brands", icon: Building2, title: "Brands and sites", text: "Brands, the pubs and hotels under them, and their guest menu settings." },
  { href: "/app/admin/users", icon: Users, title: "Users", text: "Invite chefs, set roles and which brands they work on." },
  { href: "/app/admin/lists", icon: ListChecks, title: "Lists", text: "Allergens, diets, categories and price bands." },
  { href: "/app/admin/cookbook-styles", icon: Palette, title: "Spec book styles", text: "Colours, logo, cover page and what each spec book shows." },
];
export default function Page() {
  return (
    <>
      <PageHeader title="Admin" />
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map(({ href, icon: Icon, title, text }) => (
          <li key={href}><Link href={href} className="flex h-full gap-4 rounded-lg border border-border bg-bg p-5 hover:shadow-card">
            <Icon aria-hidden className="size-6 shrink-0 text-text-muted" /><span><span className="block font-bold">{title}</span><span className="text-sm text-text-muted">{text}</span></span>
          </Link></li>
        ))}
      </ul>
    </>
  );
}

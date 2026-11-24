import type { Metadata } from "next";
import Link from "next/link";
import { ComingSoon } from "@/components/coming-soon";
export const metadata: Metadata = { title: "Publish" };
export default function Page() {
  return (
    <ComingSoon title="Publish" milestone="milestone 2b">
      <p>Pick a brand, drag menus onto its outputs (guest menu, allergen tablet, chef specs), check them in staging, then push live now or on a date. Each site gets its own QR code.</p>
      <p className="mt-2">Until then, every menu has a <Link className="font-semibold text-accent underline" href="/app/menus">guest preview</Link> built from the live recipes.</p>
    </ComingSoon>
  );
}

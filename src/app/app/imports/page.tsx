import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
export const metadata: Metadata = { title: "Import" };
export default function Page() {
  return <ComingSoon title="Import from Zonal" milestone="milestone 3, needs a sample Zonal recipe export first"><p>Upload a CSV exported from Zonal Enterprise, match its columns once, preview what&apos;s new, changed or unchanged, then apply. Re-importing the same file does nothing twice.</p></ComingSoon>;
}

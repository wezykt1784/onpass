import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: BRAND.tagline,
  openGraph: { title: BRAND.name, description: BRAND.tagline, images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#3a3936" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full bg-bg text-text">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Spec", template: "%s · Spec" },
  description: "Recipes, spec books and allergen menus for multi-site kitchens.",
};

export const viewport: Viewport = { themeColor: "#3a3936" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="min-h-full bg-bg text-text">{children}</body>
    </html>
  );
}

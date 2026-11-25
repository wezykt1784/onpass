import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

// Guests reach this from an old or mistyped QR code as often as staff from a bad link, so it speaks to both.
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg p-6 text-center shadow-card">
        <h1 className="mb-2 text-lg">We couldn&apos;t find that page</h1>
        <p className="text-text-muted">The link may be old or mistyped. If you&apos;re checking allergens in one of our venues, please ask the team; they&apos;ll be happy to help.</p>
      </div>
    </main>
  );
}

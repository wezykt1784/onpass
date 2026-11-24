"use client";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

export function BackLink({ fallback }: { fallback: string }) {
  const router = useRouter();
  return (
    <button onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="mb-2 inline-flex min-h-11 items-center gap-1 font-semibold text-text-muted">
      <ChevronLeft aria-hidden className="size-5" />Back
    </button>
  );
}

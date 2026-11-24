import "server-only";
import { headers } from "next/headers";

/** The address this app is served from, for guest links and QR codes. */
export async function siteOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const guestPath = (orgSlug: string, siteSlug: string) => `/s/${orgSlug}/${siteSlug}`;

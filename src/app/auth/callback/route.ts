// Supabase sends people here from invite and reset emails with a one-time code.
import { NextResponse } from "next/server";
import { exchangeAuthCode, isDataError } from "@/lib/data";

const SAFE_NEXT = new Set(["/app", "/auth/set-password"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";
  const dest = SAFE_NEXT.has(next) ? next : "/app"; // never redirect off-site
  if (!code) return NextResponse.redirect(new URL("/login", url.origin));
  try {
    await exchangeAuthCode(code);
  } catch (e) {
    const msg = isDataError(e) ? e.message : "That link didn't work.";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(msg)}`, url.origin));
  }
  return NextResponse.redirect(new URL(dest, url.origin));
}

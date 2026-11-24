// Which data layer is live. With these two set, the app uses Supabase; without them, the demo data.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const SCHEMA = "spec";
export const PHOTO_BUCKET = "spec-photos";

/** Where a stored dish photo is served from, for <img> tags and the PDF. */
export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (useSupabase) return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
  return `/api/files/${path}`;
}

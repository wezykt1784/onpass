// Server-only client with the service role key. Used for one thing: inviting people by email.
// It bypasses row level security, so every caller must check the user is an admin first.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "spec" } });
}

import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SCHEMA, SUPABASE_KEY, SUPABASE_URL } from "./env";

/** Supabase client for server components, route handlers and actions, acting as the signed-in user. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: SCHEMA },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: the proxy refreshes the session instead.
        }
      },
    },
  });
}

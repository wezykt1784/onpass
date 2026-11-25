import type { MetadataRoute } from "next";
import { PUBLIC_LANDING } from "@/lib/site-mode";

export default function robots(): MetadataRoute.Robots {
  // Private deploy: keep everything out of search results. Public: only the landing page is worth indexing.
  return PUBLIC_LANDING
    ? { rules: { userAgent: "*", allow: "/", disallow: ["/app/", "/auth/", "/api/", "/c/", "/m/"] } }
    : { rules: { userAgent: "*", disallow: "/" } };
}

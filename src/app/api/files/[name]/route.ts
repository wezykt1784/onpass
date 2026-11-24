// Serves uploaded photos from the fake store. Supabase Storage signed URLs replace this.
import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "@/lib/data/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[name]">) {
  const { name } = await ctx.params;
  if (!/^[\w.-]+\.(jpg|png|webp)$/.test(name)) return new Response("Not found", { status: 404 });
  const file = path.join(uploadsDir, name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  const type = name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new Response(fs.readFileSync(file), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
}

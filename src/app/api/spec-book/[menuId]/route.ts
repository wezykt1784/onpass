// Builds the PDF spec book for a menu. In production this moves to a Netlify Background Function
// that writes to Supabase Storage (architecture.md, cookbook-background).
import { currentUser, getSpecBookData, listBrands } from "@/lib/data";
import { renderSpecBook } from "@/lib/pdf/spec-book";

export async function GET(req: Request, ctx: RouteContext<"/api/spec-book/[menuId]">) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const { menuId } = await ctx.params;
  const data = await getSpecBookData(menuId);
  if (!data) return new Response("Menu not found.", { status: 404 });
  // Cover logo: the first of the menu's brands that has one.
  const brands = data.menu.brandIds.length ? await listBrands() : [];
  const logo = data.menu.brandIds.map((id) => brands.find((b) => b.id === id)?.logoPath).find(Boolean) ?? null;
  const pdf = await renderSpecBook(data, logo);
  const name = `${data.menu.name.replace(/[^\w -]/g, "").trim() || "spec-book"}.pdf`;
  const inline = new URL(req.url).searchParams.get("view") === "1";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}

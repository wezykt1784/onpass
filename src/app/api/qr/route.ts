// QR code PNG for a site's guest menu. Staff only; the address is built from our own origin, never from input.
import QRCode from "qrcode";
import { currentUser, getOrg, listSites } from "@/lib/data";
import { guestPath, siteOrigin } from "@/lib/site-url";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  const slug = new URL(req.url).searchParams.get("site") ?? "";
  const site = (await listSites()).find((s) => s.slug === slug);
  if (!site) return new Response("Site not found.", { status: 404 });
  const org = await getOrg();
  const png = await QRCode.toBuffer(`${await siteOrigin()}${guestPath(org.slug, site.slug)}`, { width: 1024, margin: 4, errorCorrectionLevel: "M" });
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "content-disposition": `attachment; filename="${site.slug}-menu-qr.png"`, "cache-control": "private, no-store" },
  });
}

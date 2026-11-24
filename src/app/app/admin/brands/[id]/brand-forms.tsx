"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, Pencil, Plus } from "lucide-react";
import { removeBrandLogoAction, saveBrandAction, saveSiteAction, uploadBrandLogoAction } from "@/lib/actions";
import { slugify } from "@/lib/publishing";
import { photoUrl } from "@/lib/supabase/env";
import type { Brand, Site } from "@/lib/types";
import { Button, Card, Field, Notice, Pill, inputClass } from "@/components/ui";

export function BrandForm({ brand }: { brand: Brand | null }) {
  const router = useRouter();
  const [name, setName] = useState(brand?.name ?? "");
  const [slug, setSlug] = useState(brand?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!brand);
  const [enabled, setEnabled] = useState(brand?.enabled ?? true);
  const [headerNote, setHeaderNote] = useState(brand?.guest.headerNote ?? "");
  const [disclaimer, setDisclaimer] = useState(
    brand?.guest.disclaimer ?? "Our kitchens handle all 14 major allergens, so we can't rule out traces. If you have an allergy, please speak to the team before you order.",
  );
  const [showKcal, setShowKcal] = useState(brand?.guest.showKcal ?? false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    const res = await saveBrandAction({
      id: brand?.id, name, slug: slug || slugify(name), enabled,
      guest: { disclaimer: disclaimer.trim(), showKcal, headerNote: headerNote.trim() || null },
    });
    if (!res.ok) return setMsg({ ok: false, text: res.error });
    setMsg({ ok: true, text: "Saved" });
    if (!brand) router.push(`/app/admin/brands/${res.value}`);
  });

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-lg">Brand</h2>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand name" htmlFor="b-name">
          <input id="b-name" className={inputClass} value={name} maxLength={80} required
            onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); setMsg(null); }} />
        </Field>
        <Field label="Web name" htmlFor="b-slug" hint="Used in addresses. Lower case, numbers and dashes.">
          <input id="b-slug" className={`${inputClass} font-mono`} value={slug} maxLength={40}
            onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); setMsg(null); }} />
        </Field>
        <fieldset className="grid gap-4 rounded-md border border-border p-4 sm:col-span-2">
          <legend className="px-1 text-sm font-semibold">Guest menu</legend>
          <Field label="Line under the menu name" htmlFor="b-note" hint="Optional, for example serving times.">
            <input id="b-note" className={inputClass} value={headerNote} maxLength={120} onChange={(e) => { setHeaderNote(e.target.value); setMsg(null); }} />
          </Field>
          <Field label="Allergen note for guests" htmlFor="b-disc" hint="Shown on every menu and dish. Up to 600 characters.">
            <textarea id="b-disc" rows={3} className={`${inputClass} h-auto py-2`} value={disclaimer} maxLength={600} onChange={(e) => { setDisclaimer(e.target.value); setMsg(null); }} />
          </Field>
          <label className="flex items-center gap-3 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={showKcal} onChange={(e) => { setShowKcal(e.target.checked); setMsg(null); }} />
            Show calories per dish
          </label>
        </fieldset>
        <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setMsg(null); }} />
          Switched on (when off, its guest menus go offline)
        </label>
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-text-muted" : "text-danger"}`}>{msg.text}</span>}
          <Button type="submit" loading={pending}>{brand ? "Save brand" : "Create brand"}</Button>
        </div>
      </form>
    </Card>
  );
}

export function LogoCard({ brand }: { brand: Brand }) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="h-fit p-5">
      <h2 className="mb-3 text-lg">Logo</h2>
      {brand.logoPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(brand.logoPath)!} alt={`${brand.name} logo`} className="mb-3 max-h-32 w-full rounded-md bg-surface object-contain p-3" />
      ) : <p className="mb-3 text-sm text-text-muted">No logo yet. It appears on guest menus and the spec book cover.</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Choose a logo"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const fd = new FormData();
          fd.set("logo", f);
          setError(null);
          start(async () => { const r = await uploadBrandLogoAction(brand.id, fd); if (!r.ok) setError(r.error); });
        }} />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" loading={pending} onClick={() => input.current?.click()}>{brand.logoPath ? "Replace" : "Upload"}</Button>
        {brand.logoPath && <Button variant="ghost" size="sm" onClick={() => start(async () => { await removeBrandLogoAction(brand.id); })}>Remove</Button>}
      </div>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </Card>
  );
}

type SiteRow = { site: Site; url: string; svg: string };

export function SitesCard({ brandId, sites }: { brandId: string; sites: SiteRow[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(sites.length ? null : "new");
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg">Sites</h2>
        {editing !== "new" && <Button variant="secondary" size="sm" onClick={() => setEditing("new")}><Plus aria-hidden />Add a site</Button>}
      </div>
      {editing === "new" && <SiteForm brandId={brandId} onDone={() => setEditing(null)} />}
      {sites.length === 0 && editing !== "new" && <p className="text-text-muted">No sites yet.</p>}
      <ul className="grid gap-4">
        {sites.map(({ site, url, svg }) => (
          <li key={site.id} className="rounded-md border border-border p-4">
            {editing === site.id ? <SiteForm brandId={brandId} site={site} onDone={() => setEditing(null)} /> : (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <p className="font-bold break-words">{site.name} {!site.enabled && <Pill tone="archived">Switched off</Pill>}</p>
                  {site.address && <p className="text-sm text-text-muted">{site.address}</p>}
                  <p className="mt-2 text-sm font-semibold">Guest menu address</p>
                  <p className="break-all font-mono text-xs text-text-muted">{url}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(site.id)}><Pencil aria-hidden />Edit</Button>
                    <a className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-surface [&_svg]:size-[18px]" href={url} target="_blank" rel="noopener"><ExternalLink aria-hidden />Open</a>
                    <CopyLink url={url} />
                    <a className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-surface [&_svg]:size-[18px]" href={`/api/qr?site=${encodeURIComponent(site.slug)}`} download={`${site.slug}-menu-qr.png`}><Download aria-hidden />QR code (PNG)</a>
                  </div>
                </div>
                {/* QR is black on white with a quiet zone, so any phone can scan it. Generated on the server from our own address. */}
                <div role="img" aria-label={`QR code for ${site.name}'s guest menu`} className="size-32 shrink-0 justify-self-start rounded-md border border-border bg-bg [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button variant="ghost" size="sm" onClick={async () => { await navigator.clipboard?.writeText(url).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 2000); }}>
      <Copy aria-hidden /><span aria-live="polite">{done ? "Copied" : "Copy address"}</span>
    </Button>
  );
}

function SiteForm({ brandId, site, onDone }: { brandId: string; site?: Site; onDone: () => void }) {
  const [name, setName] = useState(site?.name ?? "");
  const [slug, setSlug] = useState(site?.slug ?? "");
  const [touched, setTouched] = useState(!!site);
  const [address, setAddress] = useState(site?.address ?? "");
  const [enabled, setEnabled] = useState(site?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const idp = site?.id ?? "new";
  return (
    <form className="mb-4 grid gap-3 rounded-md bg-surface-sunken p-4 sm:grid-cols-2"
      onSubmit={(e) => { e.preventDefault(); setError(null); start(async () => {
        const r = await saveSiteAction({ id: site?.id, brandId, name, slug: slug || slugify(name), address, enabled });
        if (r.ok) onDone(); else setError(r.error);
      }); }}>
      <Field label="Site name" htmlFor={`s-name-${idp}`}>
        <input id={`s-name-${idp}`} className={inputClass} value={name} required maxLength={80} autoFocus
          onChange={(e) => { setName(e.target.value); if (!touched) setSlug(slugify(e.target.value)); }} />
      </Field>
      <Field label="Web name" htmlFor={`s-slug-${idp}`} hint="Changing it breaks printed QR codes.">
        <input id={`s-slug-${idp}`} className={`${inputClass} font-mono`} value={slug} maxLength={40} onChange={(e) => { setSlug(e.target.value); setTouched(true); }} />
      </Field>
      <Field label="Address" htmlFor={`s-addr-${idp}`} className="sm:col-span-2">
        <input id={`s-addr-${idp}`} className={inputClass} value={address} maxLength={160} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2">
        <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Switched on
      </label>
      {error && <div className="sm:col-span-2"><Notice tone="danger">{error}</Notice></div>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" loading={pending}>{site ? "Save site" : "Add site"}</Button>
      </div>
    </form>
  );
}

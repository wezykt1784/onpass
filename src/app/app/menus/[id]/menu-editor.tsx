"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowDown, ArrowUp, BookOpen, Copy, Eye, GripVertical, Info, ListChecks, Plus, Trash2, Utensils } from "lucide-react";
import { copyMenuAction, saveMenuDetailsAction, saveMenuRowsAction, setMenuBrandsAction } from "@/lib/actions";
import { allergenNames, money } from "@/lib/format";
import type { Allergen, Menu, MenuRow } from "@/lib/types";
import { Combobox } from "@/components/combobox";
import { MAX_MENU_DISHES, itemRows } from "@/lib/menu-rows";
import { AllergenChip, Button, ButtonLink, Card, Field, Notice, inputClass } from "@/components/ui";

interface DishOpt { id: string; name: string; code: string | null; pricePence: number | null; unknown: boolean; contains: string[] }

const newId = () => `new-${crypto.randomUUID().slice(0, 8)}`;

export function MenuEditor({ menu, dishes, allergens, orgSlug, brands, canChooseBrands }: {
  menu: Menu; dishes: DishOpt[]; allergens: Allergen[]; orgSlug: string; brands: { id: string; name: string }[]; canChooseBrands: boolean;
}) {
  const [tab, setTab] = useState("content");
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl break-words">{menu.name}</h1>
          <p className="mt-1 font-mono text-sm text-text-muted">{menu.code ?? "No code yet"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink variant="secondary" href={`/m/${orgSlug}/${menu.id}`} target="_blank"><Eye aria-hidden />Guest preview</ButtonLink>
          <CopyButton menuId={menu.id} />
          <ButtonLink href={`/app/menus/${menu.id}/spec-book`}><BookOpen aria-hidden />Spec book</ButtonLink>
        </div>
      </div>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Menu" className="mb-5 flex gap-1 border-b border-border">
          {[["content", "Dishes"], ["details", "Details"]].map(([v, l]) => (
            <Tabs.Trigger key={v} value={v} className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-text-muted data-[state=active]:border-accent data-[state=active]:text-text">
              {l}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="content"><ContentBuilder menu={menu} dishes={dishes} allergens={allergens} /></Tabs.Content>
        <Tabs.Content value="details"><div className="grid gap-6"><Details menu={menu} /><MenuBrands menu={menu} brands={brands} canEdit={canChooseBrands} /></div></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function CopyButton({ menuId }: { menuId: string }) {
  const [pending, start] = useTransition();
  return <Button variant="secondary" loading={pending} onClick={() => start(async () => { await copyMenuAction(menuId); })}><Copy aria-hidden />Copy</Button>;
}

function Details({ menu }: { menu: Menu }) {
  const [d, setD] = useState({
    name: menu.name, displayName: menu.displayName ?? "", code: menu.code ?? "", description: menu.description ?? "",
    subHeading1: menu.subHeading1 ?? "", subHeading2: menu.subHeading2 ?? "", menuDate: menu.menuDate ?? "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const f = (k: keyof typeof d) => ({ id: `md-${k}`, className: inputClass, value: d[k], onChange: (e: { target: { value: string } }) => { setD({ ...d, [k]: e.target.value }); setMsg(null); } });
  const save = () => start(async () => {
    const n = (s: string) => s.trim() || null;
    const res = await saveMenuDetailsAction(menu.id, {
      name: d.name, displayName: n(d.displayName), code: n(d.code), description: n(d.description),
      subHeading1: n(d.subHeading1), subHeading2: n(d.subHeading2), menuDate: n(d.menuDate),
    });
    setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: res.error });
  });
  return (
    <Card className="p-5">
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Menu name" htmlFor="md-name" hint="For your team."><input {...f("name")} maxLength={120} /></Field>
        <Field label="Name guests see" htmlFor="md-displayName" hint="Leave blank to use the menu name."><input {...f("displayName")} maxLength={60} /></Field>
        <Field label="Menu code" htmlFor="md-code"><input {...f("code")} maxLength={20} /></Field>
        <Field label="Spec book date" htmlFor="md-menuDate" hint="Printed on the cover."><input {...f("menuDate")} type="date" /></Field>
        <Field label="Description" htmlFor="md-description" className="sm:col-span-2" hint="Shown to guests, e.g. serving times."><input {...f("description")} maxLength={200} /></Field>
        <Field label="Sub-heading 1" htmlFor="md-subHeading1"><input {...f("subHeading1")} maxLength={120} /></Field>
        <Field label="Sub-heading 2" htmlFor="md-subHeading2"><input {...f("subHeading2")} maxLength={120} /></Field>
        <div className="flex items-center justify-end gap-3 sm:col-span-2">
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-text-muted" : "text-danger"}`}>{msg.text}</span>}
          <Button type="submit" loading={pending}>Save details</Button>
        </div>
      </form>
    </Card>
  );
}

function MenuBrands({ menu, brands, canEdit }: { menu: Menu; brands: { id: string; name: string }[]; canEdit: boolean }) {
  const [chosen, setChosen] = useState<string[]>(menu.brandIds);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-5">
      <fieldset disabled={!canEdit}>
        <legend className="mb-1 text-lg font-semibold">Brands that can use this menu</legend>
        <p className="mb-3 text-sm text-text-muted">Only ticked brands can publish it to their sites.{!canEdit && " Central chefs choose these."}</p>
        {brands.length === 0 ? <p className="text-text-muted">No brands yet. An admin adds them under Admin, Brands and sites.</p> : (
          <div className="mb-4 flex flex-wrap gap-3">
            {brands.map((b) => (
              <label key={b.id} className="flex min-h-11 items-center gap-2 rounded-md border border-border-input px-3 text-sm font-semibold has-[:checked]:border-accent">
                <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={chosen.includes(b.id)}
                  onChange={(e) => { setChosen(e.target.checked ? [...chosen, b.id] : chosen.filter((x) => x !== b.id)); setMsg(null); }} />
                {b.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      {canEdit && brands.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-text-muted" : "text-danger"}`}>{msg.text}</span>}
          <Button loading={pending} onClick={() => start(async () => {
            const r = await setMenuBrandsAction(menu.id, chosen);
            setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
          })}>Save brands</Button>
        </div>
      )}
    </Card>
  );
}

function ContentBuilder({ menu, dishes, allergens }: { menu: Menu; dishes: DishOpt[]; allergens: Allergen[] }) {
  const [rows, setRows] = useState<MenuRow[]>(() => structuredClone(menu.rows));
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [drag, setDrag] = useState<{ s: number; c: number | null } | null>(null);
  const [added, setAdded] = useState<string | null>(null); // a new group's name box gets the focus
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const count = itemRows(rows).length; // options count towards the limit too
  const dishOptions = dishes.map((x) => ({ id: x.id, label: x.name, hint: x.code ?? undefined, warn: x.unknown ? "Allergens missing" : undefined }));

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (fn: (r: MenuRow[]) => MenuRow[]) => { setRows((r) => fn(structuredClone(r))); setDirty(true); setMsg(null); };
  const move = <T,>(a: T[], from: number, to: number) => { const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; };

  const save = () => start(async () => {
    const res = await saveMenuRowsAction(menu.id, rows);
    if (res.ok) { setDirty(false); setMsg({ ok: true, text: "Saved" }); } else setMsg({ ok: false, text: res.error });
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted">{count} of {MAX_MENU_DISHES} dishes. Drag rows to reorder, or use the arrows.</p>
        <div className="flex items-center gap-3">
          {msg && <span role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-text-muted" : "text-danger"}`}>{msg.text}</span>}
          {!msg && dirty && <span className="text-sm text-text-muted">Unsaved changes</span>}
          <Button onClick={save} loading={pending} disabled={!dirty}>Save menu</Button>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-border bg-bg p-10 text-center text-text-muted">
          <Utensils aria-hidden className="size-7" />Start with a section, like Small plates or Mains.
        </div>
      )}

      {rows.map((sec, si) => (
        <section key={sec.id} aria-label={sec.title || `Section ${si + 1}`}
          className={`rounded-lg border bg-bg ${drag?.s === si && drag.c === null ? "border-focus" : "border-border"}`}
          onDragOver={(e) => { if (drag && drag.c === null) e.preventDefault(); }}
          onDrop={() => { if (drag && drag.c === null && drag.s !== si) update((r) => move(r, drag.s, si)); setDrag(null); }}>
          <div className="flex items-center gap-1 border-b border-border border-l-4 border-l-ink bg-surface-sunken p-2 sm:gap-2 sm:p-3">
            <span draggable onDragStart={() => setDrag({ s: si, c: null })} onDragEnd={() => setDrag(null)} className="cursor-grab text-text-muted" aria-hidden><GripVertical className="size-5" /></span>
            <label htmlFor={`sec-${sec.id}`} className="sr-only">Section name</label>
            <input id={`sec-${sec.id}`} className={`${inputClass} min-w-0 flex-1 font-bold`} value={sec.title ?? ""} placeholder="Section name"
              onChange={(e) => update((r) => { r[si].title = e.target.value; return r; })} />
            <Button variant="ghost" size="sm" aria-label="Move section up" disabled={si === 0} onClick={() => update((r) => move(r, si, si - 1))}><ArrowUp aria-hidden /></Button>
            <Button variant="ghost" size="sm" aria-label="Move section down" disabled={si === rows.length - 1} onClick={() => update((r) => move(r, si, si + 1))}><ArrowDown aria-hidden /></Button>
            <Button variant="ghost" size="sm" aria-label={`Delete section ${sec.title}`} onClick={() => {
              const n = (sec.children ?? []).length;
              if (n && !confirm(`Delete "${sec.title}" and the ${n} rows in it?`)) return;
              update((r) => r.filter((_, i) => i !== si));
            }}><Trash2 aria-hidden /></Button>
          </div>
          <ol className="grid gap-2 p-2 sm:p-3">
            {(sec.children ?? []).map((row, ci) => {
              const d = row.recipeId ? byId.get(row.recipeId) : undefined;
              const isDrop = drag && drag.c !== null && drag.s === si && drag.c !== ci;
              return (
                <li key={row.id} draggable onDragStart={(e) => { e.stopPropagation(); setDrag({ s: si, c: ci }); }} onDragEnd={() => setDrag(null)}
                  onDragOver={(e) => { if (drag && drag.c !== null) { e.preventDefault(); e.stopPropagation(); } }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    if (!drag || drag.c === null) return;
                    update((r) => {
                      const [x] = r[drag.s].children!.splice(drag.c!, 1);
                      r[si].children = r[si].children ?? [];
                      r[si].children!.splice(ci, 0, x);
                      return r;
                    });
                    setDrag(null);
                  }}
                  className={`flex min-w-0 flex-wrap items-center gap-2 rounded-md border p-2 ${row.kind === "byo" ? "border-dashed border-border-input bg-surface" : "border-border sm:flex-nowrap"} ${row.kind === "info" ? "italic text-text-muted" : ""} ${isDrop ? "shadow-[0_-3px_0_var(--color-focus)]" : ""}`}>
                  <GripVertical aria-hidden className="size-5 shrink-0 cursor-grab text-text-muted" />
                  {row.kind === "byo" ? (
                    <ByoGroup row={row} byId={byId} allergens={allergens} dishOptions={dishOptions} autoFocus={added === row.id} full={count >= MAX_MENU_DISHES}
                      edit={(fn) => update((r) => { fn(r[si].children![ci]); return r; })} />
                  ) : row.kind === "info" ? (
                    <>
                      <Info aria-hidden className="size-4 shrink-0" />
                      <label htmlFor={`info-${row.id}`} className="sr-only">Message</label>
                      <input id={`info-${row.id}`} className={`${inputClass} min-w-0 flex-1`} value={row.title ?? ""} placeholder="A message for guests, e.g. an offer"
                        onChange={(e) => update((r) => { r[si].children![ci].title = e.target.value; return r; })} />
                    </>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/app/recipes/${row.recipeId}`} className="font-semibold hover:underline">{d?.name ?? "Missing dish"}</Link>
                        <span className="font-mono text-xs text-text-muted">{d?.code}</span>
                        {d?.unknown && <AllergenChip size="sm" level="unknown" name="Allergen data missing" />}
                      </div>
                      <p className="truncate text-xs text-text-muted">{d ? allergenNames(d.contains, allergens).join(", ") || "No listed allergens" : ""}</p>
                    </div>
                  )}
                  {row.kind === "item" && <span className="tabular text-sm">{money(row.pricePence ?? d?.pricePence)}</span>}
                  <div className={`flex ${row.kind === "byo" ? "self-start" : ""}`}>
                    <Button variant="ghost" size="sm" aria-label="Move up" disabled={ci === 0} onClick={() => update((r) => { move(r[si].children!, ci, ci - 1); return r; })}><ArrowUp aria-hidden /></Button>
                    <Button variant="ghost" size="sm" aria-label="Move down" disabled={ci === (sec.children?.length ?? 0) - 1} onClick={() => update((r) => { move(r[si].children!, ci, ci + 1); return r; })}><ArrowDown aria-hidden /></Button>
                    <Button variant="ghost" size="sm" aria-label={row.kind === "byo" ? `Remove group ${row.title ?? ""}`.trim() : "Remove"} onClick={() => {
                      const n = row.kind === "byo" ? (row.children ?? []).length : 0;
                      if (n && !confirm(`Remove "${row.title || "this group"}" and its ${n} options?`)) return;
                      update((r) => { r[si].children!.splice(ci, 1); return r; });
                    }}><Trash2 aria-hidden /></Button>
                  </div>
                </li>
              );
            })}
            <li className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Combobox label={`Add a dish to ${sec.title || "this section"}`} value={null} placeholder="Type a dish name to add it"
                options={dishOptions}
                onChange={(rid) => update((r) => {
                  r[si].children = [...(r[si].children ?? []), { id: newId(), kind: "item", recipeId: rid, title: null, description: null, pricePence: null }];
                  return r;
                })} />
              <Button variant="ghost" onClick={() => update((r) => {
                r[si].children = [...(r[si].children ?? []), { id: newId(), kind: "info", recipeId: null, title: "", description: null, pricePence: null }];
                return r;
              })}><Info aria-hidden />Add message</Button>
              <Button variant="ghost" onClick={() => {
                const gid = newId();
                setAdded(gid);
                update((r) => {
                  r[si].children = [...(r[si].children ?? []), { id: gid, kind: "byo", recipeId: null, title: "", description: null, pricePence: null, children: [] }];
                  return r;
                });
              }}><ListChecks aria-hidden />Add build-your-own</Button>
            </li>
          </ol>
        </section>
      ))}
      <Button variant="secondary" className="justify-self-start" onClick={() => update((r) => [...r, { id: newId(), kind: "section", title: "", description: null, recipeId: null, pricePence: null, children: [] }])}>
        <Plus aria-hidden />Add section
      </Button>
      {count >= MAX_MENU_DISHES && <Notice tone="warning">This menu has reached {MAX_MENU_DISHES} dishes, the most a menu can hold.</Notice>}
    </div>
  );
}

/** A build-your-own group: a name, a line telling guests what to choose, and the dishes they choose from. */
function ByoGroup({ row, byId, allergens, dishOptions, autoFocus, full, edit }: {
  row: MenuRow; byId: Map<string, DishOpt>; allergens: Allergen[]; autoFocus: boolean; full: boolean;
  dishOptions: { id: string; label: string; hint?: string; warn?: string }[];
  edit: (fn: (group: MenuRow) => void) => void;
}) {
  const opts = row.children ?? [];
  const name = row.title?.trim() || "this group";
  const move = (from: number, to: number) => edit((g) => { const [x] = g.children!.splice(from, 1); g.children!.splice(to, 0, x); });
  return (
    <div role="group" aria-label={`Build your own: ${name}`} className="grid min-w-0 flex-1 gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <ListChecks aria-hidden className="size-5 shrink-0 text-text-muted" />
        <label htmlFor={`byo-${row.id}`} className="sr-only">Group name</label>
        <input id={`byo-${row.id}`} autoFocus={autoFocus} className={`${inputClass} min-w-0 flex-1 font-semibold`} value={row.title ?? ""} maxLength={120}
          placeholder="Group name, e.g. Build your burger" onChange={(e) => edit((g) => { g.title = e.target.value; })} />
      </div>
      <label htmlFor={`byo-d-${row.id}`} className="sr-only">What guests choose</label>
      <input id={`byo-d-${row.id}`} className={`${inputClass} min-w-0`} value={row.description ?? ""} maxLength={300}
        placeholder="What guests choose, e.g. Pick a bun, a patty and two toppings" onChange={(e) => edit((g) => { g.description = e.target.value || null; })} />
      {opts.length === 0 ? (
        <p className="rounded-md bg-bg px-3 py-2 text-sm text-text-muted">No options yet. Add the dishes guests choose from.</p>
      ) : (
        <ol aria-label={`Options in ${name}`} className="grid gap-1.5">
          {opts.map((o, oi) => {
            const d = o.recipeId ? byId.get(o.recipeId) : undefined;
            return (
              <li key={o.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-bg p-2 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/app/recipes/${o.recipeId}`} className="font-semibold hover:underline">{d?.name ?? "Missing dish"}</Link>
                    <span className="font-mono text-xs text-text-muted">{d?.code}</span>
                    {d?.unknown && <AllergenChip size="sm" level="unknown" name="Allergen data missing" />}
                  </div>
                  <p className="truncate text-xs text-text-muted">{d ? allergenNames(d.contains, allergens).join(", ") || "No listed allergens" : ""}</p>
                </div>
                <span className="tabular text-sm">{money(o.pricePence ?? d?.pricePence)}</span>
                <div className="flex">
                  <Button variant="ghost" size="sm" aria-label={`Move ${d?.name ?? "option"} up`} disabled={oi === 0} onClick={() => move(oi, oi - 1)}><ArrowUp aria-hidden /></Button>
                  <Button variant="ghost" size="sm" aria-label={`Move ${d?.name ?? "option"} down`} disabled={oi === opts.length - 1} onClick={() => move(oi, oi + 1)}><ArrowDown aria-hidden /></Button>
                  <Button variant="ghost" size="sm" aria-label={`Remove ${d?.name ?? "option"} from ${name}`} onClick={() => edit((g) => { g.children!.splice(oi, 1); })}><Trash2 aria-hidden /></Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {!full && (
        <Combobox label={`Add an option to ${name}`} value={null} placeholder="Type a dish name to add it as an option"
          options={dishOptions.filter((x) => !opts.some((o) => o.recipeId === x.id))}
          onChange={(rid) => edit((g) => { g.children = [...(g.children ?? []), { id: newId(), kind: "item", recipeId: rid, title: null, description: null, pricePence: null }]; })} />
      )}
    </div>
  );
}

"use client";
import { useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SlidersHorizontal, X } from "lucide-react";
import { allergenNames, dietNames, money, topLevelAllergens } from "@/lib/format";
import type { Allergen, Diet, MenuSnapshot, Organisation, SnapshotDish } from "@/lib/types";
import { AllergenBars, AllergenChip, Button, DietBadge } from "@/components/ui";
import { photoUrl } from "@/lib/supabase/env";

export function GuestMenu({ org, snap, allergens, diets }: { org: Organisation; snap: MenuSnapshot; allergens: Allergen[]; diets: Diet[] }) {
  const [avoid, setAvoid] = useState<string[]>([]);
  const [want, setWant] = useState<string[]>([]);
  const [strict, setStrict] = useState(false);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SnapshotDish | null>(null);
  const top = allergens.filter((a) => !a.parentId);
  // Dialogs open from plain buttons, so remember where focus was and put it back on close (keyboard and screen reader users keep their place).
  const lastFocus = useRef<HTMLElement | null>(null);
  const remember = () => { lastFocus.current = document.activeElement as HTMLElement | null; };
  const restore = (e: Event) => { e.preventDefault(); lastFocus.current?.focus(); };
  const filtering = avoid.length > 0 || want.length > 0;

  const fits = useMemo(() => (d: SnapshotDish) => {
    if (!filtering) return true;
    if (d.unknown) return false; // unknown counts as contains
    const has = topLevelAllergens([...d.contains, ...(strict ? d.mayContain : [])], allergens);
    if (avoid.some((a) => has.has(a))) return false;
    return want.every((w) => d.diets.includes(w));
  }, [avoid, want, strict, allergens, filtering]);

  const all = snap.sections.flatMap((s) => s.rows.filter((r) => r.kind === "item"));
  const shown = all.filter((r) => r.kind === "item" && fits(r.dish)).length;
  const summary = [
    ...avoid.map((a) => `No ${top.find((t) => t.id === a)?.name.toLowerCase()}`),
    ...want.map((w) => diets.find((d) => d.id === w)?.name ?? ""),
  ];

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-xl bg-bg pb-10 shadow-card">
        <header className="bg-ink px-5 py-5 text-on-ink">
          <p className="text-sm opacity-90">{org.name}</p>
          <h1 className="text-xl">{snap.name}</h1>
          {snap.description && <p className="mt-1 text-sm opacity-90">{snap.description}</p>}
        </header>

        <div className="sticky top-0 z-10 border-b border-border bg-bg px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="lg" onClick={() => { remember(); setOpen(true); }} aria-haspopup="dialog">
              <SlidersHorizontal aria-hidden />{filtering ? `Filters on (${avoid.length + want.length})` : "Filter for allergies"}
            </Button>
            <p className="text-sm text-text-muted" aria-live="polite">{filtering ? `${shown} of ${all.length} dishes` : `${all.length} dishes`}</p>
          </div>
          {filtering && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {summary.map((t) => <span key={t} className="inline-flex h-7 items-center rounded-pill border-[1.5px] border-allergen px-2.5 text-xs font-semibold text-allergen">{t}</span>)}
              <button className="ml-1 text-sm font-semibold text-accent underline" onClick={() => { setAvoid([]); setWant([]); }}>Clear</button>
            </div>
          )}
        </div>

        <p className="px-4 pt-4 text-xs text-text-muted">{org.disclaimer}</p>

        {snap.sections.map((sec) => {
          const rows = sec.rows.filter((r) => r.kind === "info" || fits(r.dish));
          const dishCount = rows.filter((r) => r.kind === "item").length;
          return (
            <section key={sec.title} aria-labelledby={`s-${sec.title}`} className="pt-6">
              <h2 id={`s-${sec.title}`} className="px-4 pb-2 text-lg">{sec.title}</h2>
              {dishCount === 0 ? (
                <p className="mx-4 rounded-md bg-surface px-4 py-3 text-sm text-text-muted">Nothing in {sec.title} fits your filters. Please ask the team, they may be able to help.</p>
              ) : (
                <ul>
                  {rows.map((r, i) => r.kind === "info" ? (
                    <li key={i} className="mx-4 my-2 rounded-md bg-surface px-3 py-2 text-sm italic">{r.text}</li>
                  ) : (
                    <li key={r.dish.recipeId} className="border-t border-border">
                      <button className="block w-full px-4 py-4 text-left hover:bg-surface-sunken" aria-haspopup="dialog" onClick={() => { remember(); setDetail(r.dish); }}>
                        <span className="flex justify-between gap-3 font-bold"><span>{r.dish.name}</span><span className="tabular">{money(r.dish.pricePence)}</span></span>
                        {r.dish.description && <span className="mt-1 block text-sm text-text-muted">{r.dish.description}{r.dish.kcal != null ? ` · ${r.dish.kcal} kcal` : ""}</span>}
                        <span className="mt-2 flex flex-wrap gap-1.5">
                          {r.dish.diets.map((d) => { const x = diets.find((y) => y.id === d); return x ? <DietBadge key={d} short={x.short} name={x.name} /> : null; })}
                          {r.dish.unknown ? <AllergenChip size="sm" level="unknown" name="Ask us about allergens" /> :
                            allergenNames(r.dish.contains, allergens).map((n) => <AllergenChip key={n} size="sm" name={n.replace(/ \(.+\)/, "")} />)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {filtering && shown === 0 && <p className="m-4 rounded-md bg-warning-bg p-4 font-semibold text-warning">Nothing on this menu fits all your filters. Please speak to the team before ordering.</p>}
        {org.calorieStatement && <p className="px-4 pt-8 text-xs text-text-muted">{org.calorieStatement}</p>}
      </div>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-text/40" />
          <Dialog.Content onCloseAutoFocus={restore} className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-xl overflow-auto rounded-t-lg bg-bg p-5 shadow-pop sm:bottom-auto sm:top-10 sm:rounded-lg">
            <div className="mb-3 flex items-start justify-between">
              <Dialog.Title className="text-lg">Filter the menu</Dialog.Title>
              <Dialog.Close aria-label="Close" className="rounded-sm p-1 text-text-muted hover:bg-surface"><X className="size-6" /></Dialog.Close>
            </div>
            <Dialog.Description className="mb-4 text-sm text-text-muted">We&apos;ll hide anything that contains what you tick. Dishes we don&apos;t have full information for are hidden too.</Dialog.Description>
            <fieldset className="mb-5">
              <legend className="mb-2 font-semibold">I need to avoid</legend>
              <div className="grid grid-cols-2 gap-2">
                {top.map((a) => (
                  <label key={a.id} className="flex min-h-12 items-center gap-3 rounded-md border border-border-input px-3 text-sm font-semibold has-[:checked]:border-allergen has-[:checked]:text-allergen">
                    <input type="checkbox" className="size-5 accent-[var(--color-allergen)]" checked={avoid.includes(a.id)}
                      onChange={(e) => setAvoid(e.target.checked ? [...avoid, a.id] : avoid.filter((x) => x !== a.id))} />
                    {a.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="mb-5">
              <legend className="mb-2 font-semibold">Show me dishes that are</legend>
              <div className="grid grid-cols-2 gap-2">
                {diets.map((d) => (
                  <label key={d.id} className="flex min-h-12 items-center gap-3 rounded-md border border-border-input px-3 text-sm font-semibold has-[:checked]:border-suitable has-[:checked]:text-suitable">
                    <input type="checkbox" className="size-5 accent-[var(--color-suitable)]" checked={want.includes(d.id)}
                      onChange={(e) => setWant(e.target.checked ? [...want, d.id] : want.filter((x) => x !== d.id))} />
                    {d.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="mb-5 flex min-h-12 items-center gap-3 rounded-md bg-surface px-3 text-sm font-semibold">
              <input type="checkbox" className="size-5" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              Also hide dishes that may contain traces
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="lg" onClick={() => { setAvoid([]); setWant([]); setStrict(false); }}>Clear all</Button>
              <Dialog.Close asChild><Button size="lg" className="flex-1">Show {all.filter((r) => r.kind === "item" && fits(r.dish)).length} dishes</Button></Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-text/40" />
          {detail && (
            <Dialog.Content onCloseAutoFocus={restore} className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-xl overflow-auto rounded-t-lg bg-bg p-5 shadow-pop sm:bottom-auto sm:top-10 sm:rounded-lg">
              <div className="mb-2 flex items-start justify-between gap-3">
                <Dialog.Title className="text-lg">{detail.name}</Dialog.Title>
                <Dialog.Close aria-label="Close" className="rounded-sm p-1 text-text-muted hover:bg-surface"><X className="size-6" /></Dialog.Close>
              </div>
              <Dialog.Description className="mb-4 text-text-muted">{detail.description}</Dialog.Description>
              {detail.photoPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl(detail.photoPath)!} alt={detail.name} className="mb-4 aspect-[4/3] w-full rounded-md object-cover" />
              )}
              {detail.unknown ? (
                <p className="rounded-md border-[1.5px] border-dashed border-unknown bg-unknown-bg p-4 font-bold text-unknown">We&apos;re still checking the allergens in this dish. Please ask the team before ordering it.</p>
              ) : (
                <AllergenBars contains={allergenNames(detail.contains, allergens)} mayContain={allergenNames(detail.mayContain, allergens)} unknown={[]} diets={dietNames(detail.diets, diets)} />
              )}
              <dl className="mt-4 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-text-muted">Price</dt><dd className="text-right tabular">{money(detail.pricePence)}</dd>
                {detail.kcal != null && <><dt className="text-text-muted">Energy</dt><dd className="text-right tabular">{detail.kcal} kcal</dd></>}
              </dl>
              <p className="mt-4 text-xs text-text-muted">{org.disclaimer}</p>
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

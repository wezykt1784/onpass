"use client";
// How one old recipe will look in Onpass: the dish, its batch recipes and its allergens, before anything is saved.
import { useState } from "react";
import { oldPhotoAction } from "@/lib/actions";
import type { PlanBatch, PlanDish } from "@/lib/recipe-import";
import type { Allergen } from "@/lib/types";
import { Pill } from "@/components/ui";

const qty = (q: number, u: string) => `${Number.isInteger(q) ? q : q.toFixed(1)} ${u}`;

export function RecipeCardPreview({ dish, batches, allergens }: { dish: PlanDish; batches: Record<string, PlanBatch>; allergens: Allergen[] }) {
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const name = (id: string) => allergens.find((a) => a.id === id)?.name ?? "";
  const order = (id: string) => allergens.findIndex((a) => a.id === id);
  const sorted = [...dish.overrides].sort((a, b) => order(a.allergenId) - order(b.allergenId));
  const contains = sorted.filter((o) => o.level === "contains").map((o) => name(o.allergenId));
  const may = sorted.filter((o) => o.level === "may_contain").map((o) => name(o.allergenId));
  return (
    <details className="rounded-md border border-border" onToggle={async (e) => {
      if ((e.target as HTMLDetailsElement).open && photo === undefined && dish.photo) {
        setPhoto(null);
        const r = await oldPhotoAction(dish.photo);
        if (r.ok) setPhoto(r.value ?? null);
      }
    }}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-semibold">{dish.name}</span>
        <span className="text-text-muted">{dish.book}</span>
        {dish.overrides.length > 0 && !dish.allergenNote.startsWith("Not checked") ? <Pill tone="live">Zonal allergens</Pill> : <Pill tone="archived">No checked allergens</Pill>}
      </summary>
      <article className="grid gap-4 border-t border-border p-4 sm:grid-cols-[minmax(0,220px)_1fr]" aria-label={`Recipe card preview: ${dish.name}`}>
        <div className="grid content-start gap-2">
          {dish.photo
            ? photo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={photo} alt={dish.name} className="aspect-[4/3] w-full rounded-md object-cover" />
              : <div className="grid aspect-[4/3] place-items-center rounded-md bg-surface text-text-muted">{photo === null ? "Loading photo…" : ""}</div>
            : <div className="grid aspect-[4/3] place-items-center rounded-md bg-surface text-text-muted">No photo</div>}
          <p className="text-text-muted">{[dish.pricePence != null ? `£${(dish.pricePence / 100).toFixed(2)}` : null, "Saved as a draft"].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="grid min-w-0 content-start gap-3">
          <div>
            <h3 className="text-lg">{dish.name}</h3>
            {dish.description && <p className="text-text-muted">{dish.description}</p>}
          </div>
          <section>
            <h4 className="font-semibold">On the plate</h4>
            <ul className="grid gap-0.5">
              {dish.lines.map((l, i) => (
                <li key={i}>
                  {l.noAmount ? <span className="text-text-muted">no amount · </span> : <span className="tabular">{qty(l.quantity, l.unit)} </span>}
                  {l.target?.type === "batch" ? <span className="font-semibold">{batches[l.target.key]?.name} (batch recipe)</span> : l.ingredient ?? l.text}
                </li>
              ))}
            </ul>
          </section>
          {dish.batches.map((k) => batches[k]).filter(Boolean).map((b) => (
            <section key={b.key} className="rounded-md bg-surface p-3">
              <h4 className="font-semibold">{b.name} <span className="font-normal text-text-muted">makes {qty(b.yieldQty, b.yieldUnit)}{b.yieldWorkedOut ? " (worked out, weigh it)" : ""}</span></h4>
              <ul className="mt-1 grid gap-0.5 sm:grid-cols-2">
                {b.lines.map((l, i) => <li key={i}>{l.noAmount ? <span className="text-text-muted">no amount · </span> : <span className="tabular">{qty(l.quantity, l.unit)} </span>}{l.ingredient ?? l.text}</li>)}
              </ul>
              {b.method.length > 0 && <ol className="mt-2 list-decimal pl-5">{b.method.map((m, i) => <li key={i}>{m.text}</li>)}</ol>}
            </section>
          ))}
          {dish.method.length > 0 && (
            <section>
              <h4 className="font-semibold">Method</h4>
              <ol className="list-decimal pl-5">{dish.method.map((m, i) => <li key={i}>{m.text}{m.steps?.length ? <ol className="list-[lower-alpha] pl-5">{m.steps.map((s, j) => <li key={j}>{s}</li>)}</ol> : null}</li>)}</ol>
            </section>
          )}
          <section>
            <h4 className="font-semibold">Allergens</h4>
            {contains.length + may.length === 0
              ? <p className="text-text-muted">None carried across. Allergens will come from the products once you confirm them.</p>
              : <p>{contains.length > 0 && <>Contains: {contains.join(", ")}. </>}{may.length > 0 && <>May contain: {may.join(", ")}.</>}</p>}
            <p className="text-text-muted">{dish.allergenNote}. Products add their own allergens on top once confirmed.</p>
            {dish.unknownAllergens.length > 0 && <p className="text-danger">Not recognised, add by hand: {dish.unknownAllergens.join(", ")}</p>}
          </section>
        </div>
      </article>
    </details>
  );
}

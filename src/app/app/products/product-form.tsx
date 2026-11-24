"use client";
// Product editor (S09). Used full page and as a quick-add dialog from the recipe editor.
import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { addSupplierAction, saveProductAction } from "@/lib/actions";
import type { Allergen, AllergenLevel, BaseUnit, Diet, Product, Supplier } from "@/lib/types";
import { Button, Field, Notice, inputClass } from "@/components/ui";

type Draft = Omit<Product, "id" | "updatedAt" | "archived"> & { id?: string };

const empty = (name = ""): Draft => ({
  name, supplierId: null, supplierCode: null, baseUnit: "g", eachWeightG: null, densityGPerMl: null, packSize: null, packCostPence: null,
  allergenStatus: "unknown", allergens: [], dietIds: [], nutritionPer100: {},
});

export function ProductForm({ product, suppliers: initialSuppliers, allergens, diets, onSaved, compact }: {
  product?: Product | Draft; suppliers: Supplier[]; allergens: Allergen[]; diets: Diet[];
  onSaved?: (p: Product) => void; compact?: boolean;
}) {
  const [d, setD] = useState<Draft>(() => (product ? { ...product } : empty()));
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [newSupplier, setNewSupplier] = useState("");
  const [packCost, setPackCost] = useState(product?.packCostPence != null ? (product.packCostPence / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setSaved(false); };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const top = allergens.filter((a) => !a.parentId);
  const subsOf = (id: string) => allergens.filter((a) => a.parentId === id);
  const levelOf = (id: string) => d.allergens.find((a) => a.allergenId === id)?.level ?? "none";
  const setLevel = (id: string, level: AllergenLevel | "none") =>
    set({ allergens: [...d.allergens.filter((a) => a.allergenId !== id), ...(level === "none" ? [] : [{ allergenId: id, level }])] });

  const submit = () => {
    setError(null);
    if (!d.name.trim()) return setError("Give the product a name.");
    const cost = packCost.trim() ? Math.round(Number(packCost) * 100) : null;
    if (packCost.trim() && !(cost! >= 0)) return setError("Enter the pack cost as a number, like 12.50.");
    start(async () => {
      let supplierId = d.supplierId;
      if (supplierId === "__new") {
        const s = await addSupplierAction(newSupplier);
        if (!s.ok) return setError(s.error);
        supplierId = s.value!.id;
        setSuppliers((x) => [...x, s.value!]);
      }
      const input = { ...d, supplierId, packCostPence: cost };
      const res = await saveProductAction(input);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      setD((x) => ({ ...x, id: res.value, supplierId }));
      onSaved?.({ ...input, id: res.value!, archived: false, updatedAt: new Date().toISOString() });
    });
  };

  const nut = (k: string) => (d.nutritionPer100[k] != null ? String(d.nutritionPer100[k]) : "");
  const setNut = (k: string, v: string) => {
    const n = { ...d.nutritionPer100 };
    if (v.trim() === "") delete n[k]; else n[k] = Number(v);
    set({ nutritionPer100: n });
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" htmlFor="p-name" className="sm:col-span-2" hint="As it appears on the supplier's invoice.">
          <input id="p-name" className={inputClass} value={d.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Supplier" htmlFor="p-sup">
          <select id="p-sup" className={inputClass} value={d.supplierId ?? ""} onChange={(e) => set({ supplierId: e.target.value || null })}>
            <option value="">No supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="__new">Add a new supplier…</option>
          </select>
        </Field>
        {d.supplierId === "__new" ? (
          <Field label="New supplier name" htmlFor="p-newsup">
            <input id="p-newsup" className={inputClass} value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} />
          </Field>
        ) : (
          <Field label="Supplier code" htmlFor="p-code">
            <input id="p-code" className={`${inputClass} font-mono`} value={d.supplierCode ?? ""} onChange={(e) => set({ supplierCode: e.target.value || null })} />
          </Field>
        )}
        <Field label="Measured in" htmlFor="p-unit" hint="How chefs weigh it out in recipes.">
          <select id="p-unit" className={inputClass} value={d.baseUnit} onChange={(e) => set({ baseUnit: e.target.value as BaseUnit })}>
            <option value="g">Grams (g)</option><option value="ml">Millilitres (ml)</option><option value="ea">Each (ea)</option>
          </select>
        </Field>
        {d.baseUnit === "ea" ? (
          <Field label="Weight of one (g)" htmlFor="p-each" hint="Needed for nutrition. A lime is about 67 g.">
            <input id="p-each" inputMode="decimal" className={inputClass} value={d.eachWeightG ?? ""} onChange={(e) => set({ eachWeightG: num(e.target.value) })} />
          </Field>
        ) : d.baseUnit === "ml" ? (
          <Field label="Density (g per ml)" htmlFor="p-dens" hint="Leave blank for 1. Oil is about 0.92.">
            <input id="p-dens" inputMode="decimal" className={inputClass} value={d.densityGPerMl ?? ""} onChange={(e) => set({ densityGPerMl: num(e.target.value) })} />
          </Field>
        ) : <div className="hidden sm:block" />}
        <Field label={`Pack size (${d.baseUnit})`} htmlFor="p-pack">
          <input id="p-pack" inputMode="decimal" className={inputClass} value={d.packSize ?? ""} onChange={(e) => set({ packSize: num(e.target.value) })} />
        </Field>
        <Field label="Pack cost (£)" htmlFor="p-cost">
          <input id="p-cost" inputMode="decimal" className={`${inputClass} tabular`} value={packCost} onChange={(e) => { setPackCost(e.target.value); setSaved(false); }} />
        </Field>
      </div>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Allergens</legend>
        <p className="mb-3 text-sm text-text-muted">Copy these from the supplier&apos;s spec sheet. Until you confirm them, every dish using this product is blocked from guest menus.</p>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {top.map((a) => (
            <div key={a.id}>
              <AllergenRow name={a.name} id={a.id} value={levelOf(a.id)} onChange={(l) => setLevel(a.id, l)} />
              {subsOf(a.id).length > 0 && (levelOf(a.id) !== "none" || subsOf(a.id).some((s) => levelOf(s.id) !== "none")) && (
                <div className="ml-4 mt-1 grid gap-1 border-l border-border pl-3">
                  {subsOf(a.id).map((s) => <AllergenRow key={s.id} name={s.name} id={s.id} value={levelOf(s.id)} onChange={(l) => setLevel(s.id, l)} small />)}
                </div>
              )}
            </div>
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3 rounded-md bg-surface p-3 text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={d.allergenStatus === "complete"}
            onChange={(e) => set({ allergenStatus: e.target.checked ? "complete" : "unknown" })} />
          I&apos;ve checked these against the supplier spec
        </label>
      </fieldset>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Suitable for</legend>
        <div className="flex flex-wrap gap-4">
          {diets.map((x) => (
            <label key={x.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={d.dietIds.includes(x.id)}
                onChange={(e) => set({ dietIds: e.target.checked ? [...d.dietIds, x.id] : d.dietIds.filter((y) => y !== x.id) })} />
              {x.name}
            </label>
          ))}
        </div>
      </fieldset>

      {!compact && (
        <fieldset className="rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold">Nutrition per 100 g or ml</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Energy (kcal)" htmlFor="n-kcal"><input id="n-kcal" inputMode="decimal" className={inputClass} value={nut("kcal")} onChange={(e) => setNut("kcal", e.target.value)} /></Field>
            <Field label="Fat (g)" htmlFor="n-fat"><input id="n-fat" inputMode="decimal" className={inputClass} value={nut("fat_g")} onChange={(e) => setNut("fat_g", e.target.value)} /></Field>
            <Field label="Salt (g)" htmlFor="n-salt"><input id="n-salt" inputMode="decimal" className={inputClass} value={nut("salt_g")} onChange={(e) => setNut("salt_g", e.target.value)} /></Field>
          </div>
        </fieldset>
      )}

      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex items-center justify-end gap-3">
        <span aria-live="polite" className="text-sm text-text-muted">{saved ? "Saved. Recipes using it are updated." : ""}</span>
        <Button type="submit" loading={pending}>Save product</Button>
      </div>
    </form>
  );
}

function AllergenRow({ name, id, value, onChange, small }: { name: string; id: string; value: AllergenLevel | "none"; onChange: (l: AllergenLevel | "none") => void; small?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${small ? "text-xs" : "text-sm"}`}>
      <label htmlFor={`al-${id}`} className={small ? "" : "font-semibold"}>{name}</label>
      <select id={`al-${id}`} value={value} onChange={(e) => onChange(e.target.value as AllergenLevel)}
        className={`h-9 rounded-sm border border-border-input bg-bg px-2 ${value === "contains" ? "text-allergen font-semibold" : value === "may_contain" ? "text-may-contain font-semibold" : ""}`}>
        <option value="none">No</option><option value="contains">Contains</option><option value="may_contain">May contain</option>
      </select>
    </div>
  );
}

export function ProductQuickAdd({ initialName, suppliers, allergens, diets, onClose, onCreated }: {
  initialName: string; suppliers: Supplier[]; allergens: Allergen[]; diets: Diet[]; onClose: () => void; onCreated: (p: Product) => void;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/40" />
        <Dialog.Content className="fixed inset-x-2 top-4 bottom-4 z-50 mx-auto max-w-2xl overflow-auto rounded-lg bg-bg p-6 shadow-pop">
          <div className="mb-4 flex items-start justify-between">
            <Dialog.Title className="text-lg">New product</Dialog.Title>
            <Dialog.Close aria-label="Close" className="rounded-sm p-1 text-text-muted hover:bg-surface"><X className="size-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Add a supplier product and its allergens.</Dialog.Description>
          <ProductForm compact product={{ ...empty(initialName) }} suppliers={suppliers} allergens={allergens} diets={diets} onSaved={onCreated} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Camera, Link2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { removeRecipePhotoAction, saveRecipeAction, uploadRecipePhotoAction } from "@/lib/actions";
import { computeRollup, toBase, toYield } from "@/lib/rollup";
import { photoUrl } from "@/lib/supabase/env";
import { allergenNames, dateTimeUk, dietNames, money } from "@/lib/format";
import type { Allergen, Diet, MethodStep, Product, Rag, Recipe, Supplier, Unit } from "@/lib/types";
import { Combobox, type Option } from "@/components/combobox";
import { AllergenBars, Button, Card, Field, Notice, Pill, RagChip, inputClass } from "@/components/ui";
import { ProductQuickAdd } from "../../products/product-form";

type Line = { key: string; source: string | null; quantity: string; unit: Unit };
const UNITS: Unit[] = ["g", "kg", "ml", "l", "ea"];
const key = () => crypto.randomUUID();

export function RecipeEditor({
  recipe, products: initialProducts, batches, suppliers, allergens, diets, usedIn, updatedBy,
}: {
  recipe: Recipe; products: Product[]; batches: Recipe[]; suppliers: Supplier[]; allergens: Allergen[]; diets: Diet[];
  usedIn: { id: string; name: string }[]; updatedBy: string | null;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [name, setName] = useState(recipe.name);
  const [code, setCode] = useState(recipe.code ?? "");
  const [description, setDescription] = useState(recipe.description ?? "");
  const [price, setPrice] = useState(recipe.pricePence != null ? (recipe.pricePence / 100).toFixed(2) : "");
  const [yieldQty, setYieldQty] = useState(recipe.yieldQty != null ? String(recipe.yieldQty) : "");
  const [yieldUnit, setYieldUnit] = useState(recipe.yieldUnit ?? "g");
  const [skill, setSkill] = useState<Rag | "">(recipe.skillRating ?? "");
  const [time, setTime] = useState<Rag | "">(recipe.timeRating ?? "");
  const [status, setStatus] = useState(recipe.status);
  const [lines, setLines] = useState<Line[]>(() =>
    recipe.lines.map((l) => ({ key: l.id, source: l.productId ? `p:${l.productId}` : `r:${l.subRecipeId}`, quantity: String(l.quantity), unit: l.unit })),
  );
  const [method, setMethod] = useState<string[]>(() => recipe.method.map((m) => m.text));
  const [overrides, setOverrides] = useState(recipe.overrides);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [quickAdd, setQuickAdd] = useState<{ lineKey: string; name: string } | null>(null);
  const [version, setVersion] = useState(recipe.updatedAt);
  const saving = useRef(false); // set at once on click, before React re-renders the button as busy
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const touch = () => { setDirty(true); setSaved(false); };

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? "";
  const options: Option[] = useMemo(() => [
    ...batches.filter((b) => b.id !== recipe.id).map((b) => ({ id: `r:${b.id}`, label: b.name, hint: `Batch, ${b.yieldQty ?? "?"} ${b.yieldUnit ?? ""}` })),
    ...products.map((p) => ({
      id: `p:${p.id}`, label: p.name, hint: [supplierName(p.supplierId), p.supplierCode].filter(Boolean).join(" · "),
      warn: p.allergenStatus === "unknown" ? "Allergens missing" : undefined,
    })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [batches, products, recipe.id]);

  // Draft recipe as it stands in the form, for the live roll-up.
  const draft: Recipe = {
    ...recipe,
    yieldQty: Number(yieldQty) || null,
    yieldUnit: recipe.kind === "batch" ? yieldUnit : null,
    overrides,
    lines: lines.filter((l) => l.source && Number(l.quantity) > 0).map((l, i) => ({
      id: l.key, sort: i, quantity: Number(l.quantity), unit: l.unit,
      productId: l.source!.startsWith("p:") ? l.source!.slice(2) : null,
      subRecipeId: l.source!.startsWith("r:") ? l.source!.slice(2) : null,
    })),
  };
  // Cheap at recipe size, so it runs on every render rather than being memoised.
  const rollup = computeRollup(draft.id, new Map([...batches.map((b) => [b.id, b] as const), [draft.id, draft] as const]), productMap);

  const contains = allergenNames(rollup.contains, allergens);
  const may = allergenNames(rollup.mayContain, allergens);
  const unknownNames = rollup.unknownProducts.map((id) => productMap.get(id)?.name ?? id);
  const dietList = dietNames(rollup.diets, diets);

  const lineWarning = (l: Line): string | null => {
    if (!l.source) return null;
    const q = Number(l.quantity);
    if (!(q > 0)) return "Enter a quantity above 0";
    if (l.source.startsWith("p:")) {
      const p = productMap.get(l.source.slice(2));
      if (!p) return null;
      if (p.allergenStatus === "unknown") return "Add allergens to this product";
      if (toBase(q, l.unit, p.baseUnit, p.eachWeightG, p.densityGPerMl) == null)
        return p.baseUnit === "ea" ? "Bought by the each: use ea, or add a weight per item" : `Can't turn ${l.unit} into ${p.baseUnit}`;
    } else {
      const b = batches.find((x) => x.id === l.source!.slice(2));
      if (b?.yieldUnit && toYield(q, l.unit, b.yieldUnit) == null) return `This batch is measured in ${b.yieldUnit}`;
    }
    return null;
  };

  const save = () => {
    if (saving.current) return;
    setError(null);
    const empty = lines.filter((l) => !l.source);
    if (empty.length && empty.length !== lines.length) return setError("Pick an ingredient on every line, or remove the empty ones.");
    const noQty = lines.findIndex((l) => l.source && !(Number(l.quantity) > 0));
    if (noQty >= 0) return setError(`Enter a quantity for ingredient ${noQty + 1}, or remove it.`);
    const pricePence = price.trim() ? Math.round(Number(price) * 100) : null;
    if (price.trim() && !(pricePence! >= 0)) return setError("Enter the price as a number, like 8.50.");
    saving.current = true;
    start(async () => {
      const res = await saveRecipeAction({
        recipeId: recipe.id,
        expectedUpdatedAt: version,
        lines: draft.lines.map(({ productId, subRecipeId, quantity, unit }) => ({ productId, subRecipeId, quantity, unit })),
        overrides,
        details: {
          name, code: code.trim() || null, description: description.trim() || null,
          yieldQty: recipe.kind === "batch" ? Number(yieldQty) : null, yieldUnit: recipe.kind === "batch" ? yieldUnit : null,
          portions: recipe.portions, method: method.map((t) => t.trim()).filter(Boolean).map((text): MethodStep => ({ text })),
          skillRating: skill || null, timeRating: time || null, status, pricePence,
        },
      });
      saving.current = false;
      if (res.ok) { setVersion(res.value!); setDirty(false); setSaved(true); } else setError(res.error);
    });
  };

  const setLine = (i: number, patch: Partial<Line>) => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); touch(); };
  const move = <T,>(arr: T[], i: number, d: number) => { const a = [...arr]; const [x] = a.splice(i, 1); a.splice(i + d, 0, x); return a; };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Pill tone={recipe.kind}>{recipe.kind === "batch" ? "Batch recipe" : "Dish"}</Pill>
            <Pill tone={status === "draft" ? "draft" : status === "archived" ? "archived" : "approved"}>{status[0].toUpperCase() + status.slice(1)}</Pill>
            <RagChip label="Skill" value={skill || null} /><RagChip label="Time" value={time || null} />
          </div>
          <h1 className="text-xl break-words">{name || "Untitled recipe"}</h1>
          <p className="mt-1 text-sm text-text-muted">Last saved {dateTimeUk(version)}{updatedBy ? ` by ${updatedBy}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <span aria-live="polite" className="text-sm text-text-muted">{saved ? "Saved" : dirty ? "Unsaved changes" : ""}</span>
          <Button onClick={save} loading={pending} disabled={!dirty && !pending}>Save recipe</Button>
        </div>
      </div>
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid min-w-0 gap-6">
          <Card className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Name" htmlFor="r-name" className="sm:col-span-2">
              <input id="r-name" className={inputClass} value={name} maxLength={120} onChange={(e) => { setName(e.target.value); touch(); }} />
            </Field>
            <Field label="Recipe code" htmlFor="r-code" hint="Your own reference, printed on the spec.">
              <input id="r-code" className={`${inputClass} font-mono`} value={code} maxLength={20} onChange={(e) => { setCode(e.target.value); touch(); }} />
            </Field>
            {recipe.kind === "batch" ? (
              <Field label="Batch weight" htmlFor="r-yield" hint="What one full batch makes.">
                <div className="flex gap-2">
                  <input id="r-yield" inputMode="decimal" className={inputClass} value={yieldQty} onChange={(e) => { setYieldQty(e.target.value); touch(); }} />
                  <label htmlFor="r-yield-unit" className="sr-only">Batch unit</label>
                  <select id="r-yield-unit" className={`${inputClass} w-24`} value={yieldUnit} onChange={(e) => { setYieldUnit(e.target.value as "g"); touch(); }}>
                    <option value="g">g</option><option value="ml">ml</option><option value="ea">ea</option>
                  </select>
                </div>
              </Field>
            ) : (
              <Field label="Sell price (£)" htmlFor="r-price">
                <input id="r-price" inputMode="decimal" className={`${inputClass} tabular`} value={price} onChange={(e) => { setPrice(e.target.value); touch(); }} />
              </Field>
            )}
            {recipe.kind === "dish" && (
              <Field label="Menu description" htmlFor="r-desc" className="sm:col-span-2" hint="What guests read under the dish name.">
                <input id="r-desc" className={inputClass} value={description} maxLength={200} onChange={(e) => { setDescription(e.target.value); touch(); }} />
              </Field>
            )}
            <Field label="Skill" htmlFor="r-skill">
              <select id="r-skill" className={inputClass} value={skill} onChange={(e) => { setSkill(e.target.value as Rag); touch(); }}>
                <option value="">Not set</option><option value="green">Green</option><option value="amber">Amber</option><option value="red">Red</option>
              </select>
            </Field>
            <Field label="Time" htmlFor="r-time">
              <select id="r-time" className={inputClass} value={time} onChange={(e) => { setTime(e.target.value as Rag); touch(); }}>
                <option value="">Not set</option><option value="green">Green</option><option value="amber">Amber</option><option value="red">Red</option>
              </select>
            </Field>
            <Field label="Status" htmlFor="r-status">
              <select id="r-status" className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value as Recipe["status"]); touch(); }}>
                <option value="draft">Draft</option><option value="approved">Approved</option><option value="archived">Archived</option>
              </select>
            </Field>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-lg">Ingredients</h2>
            {lines.length === 0 && <p className="mb-3 text-text-muted">Add the first ingredient. Batch recipes show up in the list too.</p>}
            <ol className="grid gap-3">
              {lines.map((l, i) => {
                const warn = lineWarning(l);
                const p = l.source?.startsWith("p:") ? productMap.get(l.source.slice(2)) : null;
                const b = l.source?.startsWith("r:") ? batches.find((x) => x.id === l.source!.slice(2)) : null;
                return (
                  <li key={l.key} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_110px_80px_auto] sm:items-start">
                    <div className="min-w-0">
                      <Combobox id={`ing-${l.key}`} label={`Ingredient ${i + 1}`} options={options} value={l.source} placeholder="Find a product or batch recipe"
                        onChange={(v) => setLine(i, { source: v, unit: v.startsWith("r:") ? (batches.find((x) => `r:${x.id}` === v)?.yieldUnit ?? "g") : (productMap.get(v.slice(2))?.baseUnit ?? "g") })}
                        onCreate={(text) => setQuickAdd({ lineKey: l.key, name: text })} createLabel={(t) => `Add "${t}" as a new product`} />
                      <p className="mt-1 truncate text-xs text-text-muted">
                        {p && <>{supplierName(p.supplierId)} {p.supplierCode && <span className="font-mono">{p.supplierCode}</span>}</>}
                        {b && <Link href={`/app/recipes/${b.id}`} className="inline-flex items-center gap-1 font-semibold text-accent"><Link2 className="size-3.5" aria-hidden />Open batch recipe</Link>}
                      </p>
                    </div>
                    <div>
                      <label htmlFor={`q-${l.key}`} className="sr-only">Quantity for ingredient {i + 1}</label>
                      <input id={`q-${l.key}`} inputMode="decimal" className={`${inputClass} tabular text-right`} value={l.quantity}
                        aria-invalid={warn === "Enter a quantity above 0" || undefined} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor={`u-${l.key}`} className="sr-only">Unit for ingredient {i + 1}</label>
                      <select id={`u-${l.key}`} className={inputClass} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value as Unit })}>
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" variant="ghost" size="sm" aria-label={`Move ingredient ${i + 1} up`} disabled={i === 0} onClick={() => { setLines((ls) => move(ls, i, -1)); touch(); }}><ArrowUp aria-hidden /></Button>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Move ingredient ${i + 1} down`} disabled={i === lines.length - 1} onClick={() => { setLines((ls) => move(ls, i, 1)); touch(); }}><ArrowDown aria-hidden /></Button>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Remove ingredient ${i + 1}`} onClick={() => { setLines((ls) => ls.filter((_, j) => j !== i)); touch(); }}><Trash2 aria-hidden /></Button>
                    </div>
                    {warn && <p className="flex items-center gap-1 text-xs font-semibold text-warning sm:col-span-4"><TriangleAlert className="size-3.5" aria-hidden />{warn}</p>}
                  </li>
                );
              })}
            </ol>
            <Button type="button" variant="ghost" className="mt-3" onClick={() => { const k = key(); setLines((ls) => [...ls, { key: k, source: null, quantity: "", unit: "g" }]); setFocusId(`ing-${k}`); touch(); }}>
              <Plus aria-hidden />Add ingredient
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-lg">Method</h2>
            <p className="mb-3 text-sm text-text-muted">One step per box. Put the key action in capitals (CHAR, SPOON, PROBE) so it stands out on the pass.</p>
            <ol className="grid gap-3">
              {method.map((t, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span aria-hidden className="mt-2 grid size-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-on-ink">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`m-${i}`} className="sr-only">Step {i + 1}</label>
                    <textarea id={`m-${i}`} rows={2} className={`${inputClass} h-auto py-2`} value={t} onChange={(e) => { setMethod((m) => m.map((x, j) => (j === i ? e.target.value : x))); touch(); }} />
                  </div>
                  <div className="flex gap-1 pt-1">
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => { setMethod((m) => move(m, i, -1)); touch(); }}><ArrowUp aria-hidden /></Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove step ${i + 1}`} onClick={() => { setMethod((m) => m.filter((_, j) => j !== i)); touch(); }}><Trash2 aria-hidden /></Button>
                  </div>
                </li>
              ))}
            </ol>
            <Button type="button" variant="ghost" className="mt-3" onClick={() => { setMethod((m) => [...m, ""]); setFocusId(`m-${method.length}`); touch(); }}><Plus aria-hidden />Add step</Button>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card className="p-5">
            <h2 className="mb-3 text-lg">Allergens and diets</h2>
            <p className="mb-3 text-sm text-text-muted">Worked out from every ingredient, including what&apos;s inside batch recipes. Updates as you edit.</p>
            <AllergenBars compact contains={contains} mayContain={may} unknown={unknownNames} diets={dietList} />
            <Overrides allergens={allergens} overrides={overrides} onChange={(o) => { setOverrides(o); touch(); }} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-lg">{recipe.kind === "batch" ? "Per batch" : "Per portion"}</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-text-muted">Energy</dt><dd className="text-right tabular">{rollup.nutritionPerPortion.kcal != null ? `${Math.round(rollup.nutritionPerPortion.kcal)} kcal` : "Unknown"}</dd>
              <dt className="text-text-muted">Fat</dt><dd className="text-right tabular">{rollup.nutritionPerPortion.fat_g != null ? `${rollup.nutritionPerPortion.fat_g} g` : "Unknown"}</dd>
              <dt className="text-text-muted">Salt</dt><dd className="text-right tabular">{rollup.nutritionPerPortion.salt_g != null ? `${rollup.nutritionPerPortion.salt_g} g` : "Unknown"}</dd>
              <dt className="text-text-muted">Food cost</dt><dd className="text-right tabular">{rollup.costPerPortionPence != null ? money(rollup.costPerPortionPence) : "Unknown"}</dd>
              {recipe.kind === "dish" && rollup.costPerPortionPence != null && Number(price) > 0 && (
                <><dt className="text-text-muted">GP (ex VAT)</dt><dd className="text-right tabular">{Math.round((1 - rollup.costPerPortionPence / ((Number(price) * 100) / 1.2)) * 100)}%</dd></>
              )}
            </dl>
            {!rollup.nutritionComplete && <p className="mt-3 text-xs font-semibold text-warning">Some ingredients have no nutrition data or weight yet, so these figures are incomplete.</p>}
            <p className="mt-3 text-xs text-text-muted">Demo data: nutrition and costs here are made up for testing.</p>
          </Card>
          {recipe.kind === "dish" && <PhotoCard recipe={recipe} />}
          {usedIn.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-2 text-lg">Used in</h2>
              <ul className="grid gap-1 text-sm">{usedIn.map((u) => <li key={u.id}><Link className="font-semibold hover:underline" href={`/app/recipes/${u.id}`}>{u.name}</Link></li>)}</ul>
            </Card>
          )}
        </div>
      </div>

      {quickAdd && (
        <ProductQuickAdd
          initialName={quickAdd.name}
          suppliers={suppliers}
          allergens={allergens}
          diets={diets}
          onClose={() => setQuickAdd(null)}
          onCreated={(p) => {
            setProducts((ps) => [...ps, p]);
            setLines((ls) => ls.map((l) => (l.key === quickAdd.lineKey ? { ...l, source: `p:${p.id}`, unit: p.baseUnit } : l)));
            touch();
            setQuickAdd(null);
          }}
        />
      )}
    </div>
  );
}

function Overrides({ allergens, overrides, onChange }: { allergens: Allergen[]; overrides: Recipe["overrides"]; onChange: (o: Recipe["overrides"]) => void }) {
  const top = allergens.filter((a) => !a.parentId);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <h3 className="mb-1 text-sm font-semibold">Added by the kitchen</h3>
      <p className="mb-2 text-xs text-text-muted">For risks that don&apos;t come from an ingredient, like a shared fryer.</p>
      <ul className="grid gap-2">
        {overrides.map((o, i) => (
          <li key={i} className="grid gap-2 rounded-md border border-border p-2">
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`ov-a-${i}`}>Allergen</label>
              <select id={`ov-a-${i}`} className={inputClass} value={o.allergenId} onChange={(e) => onChange(overrides.map((x, j) => (j === i ? { ...x, allergenId: e.target.value } : x)))}>
                {top.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <label className="sr-only" htmlFor={`ov-l-${i}`}>Level</label>
              <select id={`ov-l-${i}`} className={`${inputClass} w-40`} value={o.level} onChange={(e) => onChange(overrides.map((x, j) => (j === i ? { ...x, level: e.target.value as "contains" } : x)))}>
                <option value="may_contain">May contain</option><option value="contains">Contains</option>
              </select>
            </div>
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`ov-r-${i}`}>Reason</label>
              <input id={`ov-r-${i}`} className={inputClass} placeholder="Why? e.g. shared fryer" value={o.reason} onChange={(e) => onChange(overrides.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="md" aria-label="Remove" onClick={() => onChange(overrides.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
            </div>
          </li>
        ))}
      </ul>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => onChange([...overrides, { allergenId: top[0].id, level: "may_contain", reason: "" }])}>
        <Plus aria-hidden />Add a risk
      </Button>
    </div>
  );
}

function PhotoCard({ recipe }: { recipe: Recipe }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError(null);
    const resized = await resize(file, 1600).catch(() => file);
    const fd = new FormData();
    fd.set("photo", resized);
    start(async () => {
      const res = await uploadRecipePhotoAction(recipe.id, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-lg">Photo</h2>
      {recipe.photoPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(recipe.photoPath)!} alt={`${recipe.name}, as served`} className="mb-3 aspect-[4/3] w-full rounded-md object-cover" />
      ) : (
        <button type="button" onClick={() => input.current?.click()}
          className="mb-3 grid aspect-[4/3] w-full place-items-center content-center gap-2 rounded-md border-2 border-dashed border-border text-sm font-semibold text-text-muted hover:bg-surface">
          <Camera aria-hidden className="size-6" />Add a photo of the plated dish
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a photo"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => input.current?.click()}>{recipe.photoPath ? "Replace" : "Upload"}</Button>
        {recipe.photoPath && <Button type="button" variant="ghost" size="sm" onClick={() => start(async () => { await removeRecipePhotoAction(recipe.id); })}>Remove</Button>}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}

async function resize(file: File, max: number): Promise<File> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.85));
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}


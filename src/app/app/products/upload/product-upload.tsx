"use client";
// Upload products from CSV or Excel: read in the browser, preview, then save in batches.
import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Download, FileUp } from "lucide-react";
import { uploadProductsAction, type UploadOutcome } from "@/lib/actions";
import {
  FIELD_LABELS, MAX_UPLOAD_ROWS, TEMPLATE_CSV, UPLOAD_CHUNK, ZONAL_LABEL, detectZonal, findHeader, matchColumns, matchKey, readRow,
  readZonalRow, zonalPresent, type UploadField, type UploadRow, type ZonalKind,
} from "@/lib/product-upload";
import type { Allergen, Diet } from "@/lib/types";
import { Button, Card, Notice, Pill, inputClass } from "@/components/ui";

type Existing = { name: string; supplier: string | null; code: string | null };
type Preview = { line: number; name: string; row: UploadRow | null; problems: string[]; warnings: string[]; action: "new" | "update" | "skip"; repeat: boolean };
type Sheet = { headers: string[]; body: unknown[][]; first: number; zonal: ZonalKind | null };

async function readFile(file: File): Promise<unknown[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown[][];
  }
  if (lower.endsWith(".csv") || lower.endsWith(".txt") || file.type === "text/csv") {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    return Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" }).data;
  }
  throw new Error(lower.endsWith(".xls") ? "Old .xls files can't be read. In Excel, choose File > Save As > Excel Workbook (.xlsx) or CSV, then upload that." : "Upload a .xlsx or .csv file.");
}

export function ProductUpload({ allergens, diets, existing }: { allergens: Allergen[]; diets: Diet[]; existing: Existing[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [supplier, setSupplier] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<UploadOutcome | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const known = useMemo(() => {
    const byCode = new Set<string>(), byName = new Set<string>();
    for (const p of existing) {
      const c = matchKey.code(p.supplier, p.code);
      if (c) byCode.add(c);
      byName.add(matchKey.name(p.supplier, p.name));
    }
    return { byCode, byName };
  }, [existing]);

  const reset = () => { setError(null); setSheet(null); setResult(null); setProgress(null); setConfirmed(false); };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setFileName(file.name);
    if (file.size > 10 * 1024 * 1024) return setError("That file is over 10 MB. Split it, or remove columns you don't need.");
    let grid: unknown[][];
    try { grid = await readFile(file); } catch (e) { return setError(e instanceof Error ? e.message : "That file couldn't be read."); }
    const h = findHeader(grid);
    const firstRow = (grid[0] ?? []).map((c) => (c == null ? "" : String(c).trim()));
    const zonal = detectZonal(firstRow);
    if (h < 0 && !zonal) return setError("We couldn't find a heading row with a product name column. The first row should have headings like Product name, Supplier code, Pack size, Pack cost, or be a Zonal price change, nutrition or allergen template.");
    const head = zonal ? 0 : h;
    const heads = grid[head].map((c) => (c == null ? "" : String(c).trim()));
    let body = grid.slice(head + 1).filter((r) => r.some((c) => c != null && String(c).trim() !== ""));
    if (body.length === 0) return setError("The file has headings but no products under them.");
    if (body.length > MAX_UPLOAD_ROWS) return setError(`That's ${body.length} rows. Upload up to ${MAX_UPLOAD_ROWS} at a time.`);
    if (zonal === "nutrition") {
      // Zonal lists a product once per supplier item; the default item's row should win.
      const def = heads.findIndex((x) => x.toLowerCase() === "defaultyn");
      body = [...body].sort((a, b) => Number(String(a[def] ?? "").toUpperCase() === "Y") - Number(String(b[def] ?? "").toUpperCase() === "Y"));
    }
    setSheet({ headers: heads, body, first: head + 2, zonal });
  };

  const columns = useMemo(() => (sheet && !sheet.zonal ? matchColumns(sheet.headers) : null), [sheet]);
  const needsSupplier = !!sheet && (sheet.zonal === "price" || (!sheet.zonal && columns?.supplier === undefined));
  const rows = useMemo<Preview[]>(() => {
    if (!sheet) return [];
    const seen = new Set<string>();
    const fallback = supplier.trim() || null;
    return sheet.body.map((cells, i): Preview => {
      const line = sheet.first + i;
      const read = sheet.zonal
        ? readZonalRow(sheet.zonal, cells, sheet.headers, line, allergens, diets, fallback)
        : { ...readRow(cells, line, columns!, allergens, diets), warnings: [] as string[] };
      const row = read.row && !read.row.supplier && fallback ? { ...read.row, supplier: fallback } : read.row;
      const name = row?.name ?? String((sheet.zonal ? "" : cells[columns!.name!]) ?? "").trim();
      if (!row) return { line, name, row, problems: read.problems, warnings: read.warnings, action: "skip", repeat: false };
      const ck = matchKey.code(row.supplier, row.code);
      const nk = matchKey.name(row.supplier, row.name);
      const repeat = seen.has(nk);
      seen.add(nk);
      const action = (ck && known.byCode.has(ck)) || known.byName.has(nk) ? "update" : "new";
      return { line, name, row, problems: read.problems, warnings: read.warnings, action, repeat };
    });
  }, [sheet, supplier, columns, allergens, diets, known]);

  const ready = rows.filter((r) => r.row);
  const counts = { new: ready.filter((r) => r.action === "new").length, update: ready.filter((r) => r.action === "update").length, skip: rows.length - ready.length };
  const hasAllergens = sheet?.zonal === "allergen" || (columns && (columns.contains !== undefined || columns.mayContain !== undefined));
  const present: UploadField[] = sheet?.zonal ? zonalPresent(sheet.zonal) : columns ? (Object.keys(columns) as UploadField[]) : [];
  if (needsSupplier && supplier.trim() && !present.includes("supplier")) present.push("supplier");
  const ignored = sheet && !sheet.zonal ? sheet.headers.filter((hd, i) => hd && !Object.values(columns ?? {}).includes(i)) : [];
  const warned = rows.filter((r) => r.row && r.warnings.length).length;

  const upload = () => start(async () => {
    setError(null);
    const total = ready.length;
    const all: UploadOutcome = { added: 0, updated: 0, failed: [] };
    setProgress({ done: 0, total });
    for (let i = 0; i < total; i += UPLOAD_CHUNK) {
      const batch = ready.slice(i, i + UPLOAD_CHUNK).map((r) => r.row!);
      const res = await uploadProductsAction(batch, present, confirmed);
      if (!res.ok) { setError(`${res.error} ${all.added + all.updated} products were saved before this stopped.`); break; }
      all.added += res.value!.added; all.updated += res.value!.updated; all.failed.push(...res.value!.failed);
      setProgress({ done: Math.min(i + UPLOAD_CHUNK, total), total });
    }
    setResult(all);
  });

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;

  return (
    <div className="grid gap-6">
      <Card className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={input} id="upload-file" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <Button type="button" onClick={() => input.current?.click()} disabled={pending}><FileUp aria-hidden />Choose a file</Button>
          <span className="text-sm text-text-muted">{fileName ?? "Excel (.xlsx) or CSV, up to 2,000 products. Zonal price change, nutrition and allergen templates work as they are."}</span>
          <a className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold underline" href={template} download="onpass-products-template.csv">
            <Download aria-hidden className="size-4" />Download the template
          </a>
        </div>
        <p className="text-sm text-text-muted">
          The first row needs headings. Only Product name is required. We also read Supplier, Supplier code, Pack size (like 2.5kg or 24 each), Pack cost,
          Weight of one, Contains, May contain, Suitable for, and kcal, fat and salt per 100. Other columns are ignored.
          A product with the same supplier and code, or the same supplier and name, is updated rather than added twice.
        </p>
        <label htmlFor="upload-file" className="sr-only">Product file</label>
      </Card>

      {error && <Notice tone="danger">{error}</Notice>}

      {sheet && !result && (
        <>
          <Card className="grid gap-3 p-5 text-sm">
            <h2 className="text-lg">What we found</h2>
            {sheet.zonal
              ? <p><span className="font-semibold">Recognised as the {ZONAL_LABEL[sheet.zonal]}.</span> {sheet.zonal === "price" ? "Updates pack sizes and prices (the new price where there is one)." : sheet.zonal === "nutrition" ? "Updates nutrition per 100 g. Figures that can't be per 100 g are skipped." : "Updates allergens, diets and the cost per kg, litre or item."} Products match on supplier and code, then supplier and name, so you can upload all three templates one after another.</p>
              : <p><span className="font-semibold">Columns read:</span> {present.map((f) => FIELD_LABELS[f]).join(", ")}.</p>}
            {needsSupplier && (
              <div className="grid max-w-sm gap-1">
                <label htmlFor="file-supplier" className="font-semibold">Supplier for this file</label>
                <input id="file-supplier" className={inputClass} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="For example Brakes" maxLength={120} />
                <span className="text-text-muted">The file doesn&apos;t say who the supplier is.{sheet.zonal === "price" ? " Rows can't be uploaded without one." : ""}</span>
              </div>
            )}
            {warned > 0 && <p className="text-text-muted">{warned} rows will upload with a note; see What happens below.</p>}
            {ignored.length > 0 && <p className="text-text-muted"><span className="font-semibold">Ignored:</span> {ignored.join(", ")}.</p>}
            <p aria-live="polite"><span className="font-semibold">{counts.new}</span> new, <span className="font-semibold">{counts.update}</span> to update, <span className="font-semibold">{counts.skip}</span> with problems (not uploaded).</p>
            {hasAllergens ? (
              <label className="flex items-start gap-3 rounded-md border border-border p-3">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                <span>
                  <span className="block font-semibold">The allergens in this file are complete and checked against the supplier spec sheets</span>
                  <span className="text-text-muted">Leave this unticked and the products are saved with their allergens marked not confirmed, so dishes using them stay off guest menus until someone checks each one. Updating a product&apos;s allergens without ticking this also marks it not confirmed.</span>
                </span>
              </label>
            ) : (
              <Notice tone="warning">This file has no allergen columns. New products are saved with allergens not confirmed; products you already have keep their allergens.</Notice>
            )}
            <div><Button onClick={upload} loading={pending} disabled={ready.length === 0}>Upload {ready.length} products</Button></div>
            {progress && pending && <p role="status">Saving {progress.done} of {progress.total}…</p>}
          </Card>

          <Card className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Preview of the rows in {fileName}</caption>
              <thead><tr className="border-b border-border bg-surface text-left text-text-muted">
                <th scope="col" className="px-4 py-2.5 font-semibold">Row</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Product</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Pack</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Allergens</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">What happens</th>
              </tr></thead>
              <tbody>
                {rows.slice(0, 500).map((r) => (
                  <tr key={r.line} className="border-b border-border align-top last:border-0">
                    <td className="px-4 py-2.5 tabular text-text-muted">{r.line}</td>
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold break-words">{r.name || "(no name)"}</span>
                      {r.row && <span className="block text-xs text-text-muted">{[r.row.supplier, r.row.code].filter(Boolean).join(" · ")}</span>}
                    </td>
                    <td className="px-4 py-2.5 tabular">
                      {r.row?.packSize != null ? `${r.row.packSize} ${r.row.baseUnit}` : ""}
                      {r.row?.packCostPence != null && <span className="block text-xs text-text-muted">£{(r.row.packCostPence / 100).toFixed(2)}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.row?.allergens == null ? <span className="text-text-muted">Not in file</span>
                        : r.row.allergens.length === 0 ? "None"
                        : r.row.allergens.map((a) => `${allergens.find((x) => x.id === a.allergenId)?.name}${a.level === "may_contain" ? " (may)" : ""}`).join(", ")}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.action === "skip" ? (
                        <><Pill tone="archived">Skipped</Pill><ul className="mt-1 grid gap-0.5 text-xs text-danger">{r.problems.map((p) => <li key={p}>{p}</li>)}</ul></>
                      ) : (
                        <>
                          <Pill tone={r.action === "new" ? "live" : "draft"}>{r.action === "new" ? "New" : "Updates existing"}</Pill>
                          {r.repeat && <p className="mt-1 text-xs text-text-muted">Same product as an earlier row; this row wins.</p>}
                          {r.warnings.map((w) => <p key={w} className="mt-1 text-xs text-text-muted">{w}</p>)}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 500 && <p className="p-4 text-sm text-text-muted">Showing the first 500 of {rows.length} rows. All of them are uploaded.</p>}
          </Card>
        </>
      )}

      {result && (
        <Card className="grid gap-3 p-5 text-sm">
          <h2 className="text-lg">Upload finished</h2>
          <p role="status"><span className="font-semibold">{result.added}</span> added and <span className="font-semibold">{result.updated}</span> updated{result.failed.length ? `, ${result.failed.length} couldn't be saved` : ""}.</p>
          {result.failed.length > 0 && (
            <ul className="grid gap-1 text-danger">{result.failed.map((f) => <li key={f.line}>Row {f.line}, {f.name}: {f.error}</li>)}</ul>
          )}
          {!confirmed && hasAllergens && <p className="text-text-muted">Allergens from the file are marked not confirmed. Use the Allergens missing filter on Products to check them.</p>}
          <div className="flex flex-wrap gap-3">
            <Link className="font-semibold underline" href="/app/products">Go to products</Link>
            <button type="button" className="font-semibold underline" onClick={() => { reset(); setFileName(null); }}>Upload another file</button>
          </div>
        </Card>
      )}
    </div>
  );
}

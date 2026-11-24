"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CalendarClock, Eye, RefreshCw, Send, TriangleAlert, Trash2 } from "lucide-react";
import {
  approveRefreshAction, movePublicationAction, pushLiveAction, setAutoRefreshAction, stageMenuAction, unpublishAction,
} from "@/lib/actions";
import { londonLabel, londonToUtc } from "@/lib/time";
import type { Publication } from "@/lib/types";
import type { MissingInfo } from "@/lib/publishing";
import { Button, Card, EmptyState, Notice, Pill, inputClass } from "@/components/ui";

type Check = { issues: MissingInfo; changedSince: boolean } | null;
type Row = Publication & { isLive: boolean; check: Check };

export function Board({ brandId, orgSlug, canManage, canChangeRefresh, menus, pubs }: {
  brandId: string; orgSlug: string; canManage: boolean; canChangeRefresh: boolean;
  menus: { id: string; name: string; dishCount: number }[]; pubs: Row[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => { const r = await fn(); if (!r.ok) setError((r as { error: string }).error); });
  };
  const live = pubs.filter((p) => p.isLive).sort((a, b) => a.sort - b.sort);
  const staging = pubs.filter((p) => !p.isLive && p.stage === "staging").sort((a, b) => a.sort - b.sort);
  const nameOf = (menuId: string) => menus.find((m) => m.id === menuId)?.name ?? pubs.find((p) => p.menuId === menuId)?.snapshot.name ?? "Menu";
  const inStaging = new Set(staging.map((p) => p.menuId));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit p-5">
        <h2 className="mb-1 text-lg">Menus for this brand</h2>
        <p className="mb-3 text-sm text-text-muted">Put a menu into staging to check it before guests see it.</p>
        {menus.length === 0 ? (
          <p className="text-sm text-text-muted">No menus are set up for this brand. On a menu&apos;s Details tab, tick this brand.</p>
        ) : (
          <ul className="grid gap-2">
            {menus.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
                <span className="min-w-0">
                  <Link href={`/app/menus/${m.id}`} className="block font-semibold break-words hover:underline">{m.name}</Link>
                  <span className="text-xs text-text-muted">{m.dishCount} dishes</span>
                </span>
                {canManage && (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => stageMenuAction(brandId, m.id))}
                    aria-label={`${inStaging.has(m.id) ? "Refresh staging copy of" : "Add to staging:"} ${m.name}`}>
                    {inStaging.has(m.id) ? "Refresh" : "To staging"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid min-w-0 content-start gap-6">
        {error && <Notice tone="danger">{error}</Notice>}
        <section aria-labelledby="h-staging">
          <h2 id="h-staging" className="mb-3 flex items-center gap-2 text-lg"><Pill tone="staging">Staging</Pill>Check before it goes live</h2>
          {staging.length === 0 ? <EmptyState text="Nothing in staging. Add a menu from the list." /> : (
            <ol className="grid gap-3">
              {staging.map((p, i) => (
                <StagingRow key={p.id} p={p} name={nameOf(p.menuId)} orgSlug={orgSlug} canManage={canManage} pending={pending}
                  first={i === 0} last={i === staging.length - 1} act={act} />
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="h-live">
          <h2 id="h-live" className="mb-3 flex items-center gap-2 text-lg"><Pill tone="live">Live</Pill>What guests see now, in this order</h2>
          {live.length === 0 ? <EmptyState text="Nothing live. Guests at this brand's sites see a note asking them to speak to the team." /> : (
            <ol className="grid gap-3">
              {live.map((p, i) => (
                <li key={p.id} className="rounded-lg border border-border bg-bg p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold break-words">{nameOf(p.menuId)}</p>
                      <p className="text-sm text-text-muted">
                        Live since {londonLabel(p.liveFrom ?? p.updatedAt)}.{" "}
                        {p.autoRefresh ? "Recipe changes reach guests straight away, unless a dish loses its allergen data." : "Recipe changes wait for sign-off."}
                      </p>
                      {!p.autoRefresh && p.check?.changedSince && (
                        <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-warning"><TriangleAlert aria-hidden className="size-4" />Recipes have changed since guests last saw this.</p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Move ${nameOf(p.menuId)} up`} disabled={pending || i === 0} onClick={() => act(() => movePublicationAction(p.id, -1))}><ArrowUp aria-hidden /></Button>
                        <Button size="sm" variant="ghost" aria-label={`Move ${nameOf(p.menuId)} down`} disabled={pending || i === live.length - 1} onClick={() => act(() => movePublicationAction(p.id, 1))}><ArrowDown aria-hidden /></Button>
                        {!p.autoRefresh && p.check?.changedSince && <Button size="sm" disabled={pending} onClick={() => act(() => approveRefreshAction(p.id))}><RefreshCw aria-hidden />Send changes to guests</Button>}
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Take "${nameOf(p.menuId)}" offline for guests?`)) act(() => unpublishAction(p.id)); }}><Trash2 aria-hidden />Take offline</Button>
                      </div>
                    )}
                  </div>
                  {canChangeRefresh && (
                    <label className="mt-3 flex items-center gap-3 text-sm">
                      <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={!p.autoRefresh} disabled={pending}
                        onChange={(e) => act(() => setAutoRefreshAction(p.id, !e.target.checked))} />
                      Hold recipe changes until a central chef signs them off
                    </label>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function StagingRow({ p, name, orgSlug, canManage, pending, first, last, act }: {
  p: Row; name: string; orgSlug: string; canManage: boolean; pending: boolean; first: boolean; last: boolean;
  act: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const blocking = p.check?.issues.blocking ?? [];
  const warnings = p.check?.issues.warnings ?? [];
  return (
    <li className="rounded-lg border border-border bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold break-words">{name}</p>
          <p className="text-sm text-text-muted">
            {p.liveFrom ? <span className="inline-flex items-center gap-1 font-semibold text-accent"><CalendarClock aria-hidden className="size-4" />Goes live {londonLabel(p.liveFrom)}</span> : "Not live yet."}
            {p.check?.changedSince && " Recipes have changed since this copy was made; press Refresh to update it."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Link href={`/m/${orgSlug}/${p.menuId}`} target="_blank" className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-surface [&_svg]:size-[18px]"><Eye aria-hidden />Preview</Link>
          {canManage && (
            <>
              <Button size="sm" variant="ghost" aria-label={`Move ${name} up`} disabled={pending || first} onClick={() => act(() => movePublicationAction(p.id, -1))}><ArrowUp aria-hidden /></Button>
              <Button size="sm" variant="ghost" aria-label={`Move ${name} down`} disabled={pending || last} onClick={() => act(() => movePublicationAction(p.id, 1))}><ArrowDown aria-hidden /></Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => unpublishAction(p.id))}><Trash2 aria-hidden />Remove</Button>
            </>
          )}
        </div>
      </div>

      {(blocking.length > 0 || warnings.length > 0) && (
        <div className="mt-3 grid gap-2">
          {blocking.length > 0 && (
            <div role="group" aria-label="Must fix before going live" className="rounded-md border border-danger p-3 text-sm text-danger">
              <p className="mb-1 flex items-center gap-1 font-semibold"><TriangleAlert aria-hidden className="size-4" />Fix before it can go live</p>
              <ul className="ml-5 list-disc">{blocking.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <details className="rounded-md bg-warning-bg p-3 text-sm text-warning">
              <summary className="cursor-pointer font-semibold">{warnings.length} {warnings.length === 1 ? "thing" : "things"} to check</summary>
              <ul className="ml-5 mt-1 list-disc">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Button variant="success" disabled={pending || blocking.length > 0} onClick={() => act(() => pushLiveAction(p.id, null))}><Send aria-hidden />Go live now</Button>
          {!scheduling ? (
            <Button variant="secondary" disabled={pending || blocking.length > 0} onClick={() => setScheduling(true)}><CalendarClock aria-hidden />Schedule</Button>
          ) : (
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
              e.preventDefault();
              const utc = londonToUtc(when);
              if (!utc) return;
              act(() => pushLiveAction(p.id, utc));
              setScheduling(false);
            }}>
              <label className="grid gap-1 text-sm font-semibold" htmlFor={`when-${p.id}`}>
                Go live at (London time)
                <input id={`when-${p.id}`} type="datetime-local" required className={`${inputClass} w-56`} value={when} onChange={(e) => setWhen(e.target.value)} />
              </label>
              <Button type="submit" disabled={pending}>Set time</Button>
              <Button type="button" variant="ghost" onClick={() => setScheduling(false)}>Cancel</Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

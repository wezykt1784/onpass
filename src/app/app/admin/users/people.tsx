"use client";
import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { deleteMemberAction, inviteMemberAction, updateMemberAction } from "@/lib/actions";
import type { Member, User } from "@/lib/types";
import { BRAND } from "@/lib/brand";
import { Button, Card, Field, Notice, Pill, inputClass } from "@/components/ui";

const ROLES: { value: User["role"]; label: string; help: string }[] = [
  { value: "org_admin", label: "Admin", help: "Everything, including people, brands and sites." },
  { value: "central_chef", label: "Central chef", help: "All recipes, menus and publishing." },
  { value: "head_chef", label: "Head chef", help: "Edits recipes; publishes for their own brand." },
  { value: "viewer", label: "Site chef", help: "Reads specs on their phone. Can't change anything." },
];
const needsBrand = (r: User["role"]) => r === "head_chef" || r === "viewer";

export function People({ me, members, brands, demo }: { me: string; members: Member[]; brands: { id: string; name: string }[]; demo: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const update = (userId: string, patch: Parameters<typeof updateMemberAction>[1]) => {
    setError(null);
    start(async () => { const r = await updateMemberAction(userId, patch); if (!r.ok) setError(r.error); });
  };
  const brandName = (id: string | null) => brands.find((b) => b.id === id)?.name ?? "Whole group";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="relative min-w-0 overflow-x-auto">
        {error && <div className="p-4 pb-0"><Notice tone="danger">{error}</Notice></div>}
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">People in your group</caption>
          <thead><tr className="border-b border-border bg-surface text-left text-text-muted">
            <th scope="col" className="px-4 py-2.5 font-semibold">Person</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Role</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Brand</th>
            <th scope="col" className="px-4 py-2.5 font-semibold"><span className="sr-only">Access</span></th>
          </tr></thead>
          <tbody>
            {members.map((m) => {
              const self = m.userId === me;
              return (
                <tr key={m.userId} className={`border-b border-border last:border-0 ${m.status === "disabled" ? "text-text-muted" : ""}`}>
                  <td className="px-4 py-3">
                    <span className="block font-semibold break-words">{m.name}{self && " (you)"}</span>
                    <span className="block break-all text-xs text-text-muted">{m.email}</span>
                    {m.status === "disabled" && <Pill tone="archived" className="mt-1">No access</Pill>}
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`role-${m.userId}`}>Role for {m.name}</label>
                    <select id={`role-${m.userId}`} className={`${inputClass} w-40`} value={m.role} disabled={pending || self}
                      onChange={(e) => {
                        const role = e.target.value as User["role"];
                        update(m.userId, { role, brandId: needsBrand(role) ? (m.brandId ?? brands[0]?.id ?? null) : null });
                      }}>
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {needsBrand(m.role) ? (
                      <>
                        <label className="sr-only" htmlFor={`brand-${m.userId}`}>Brand for {m.name}</label>
                        <select id={`brand-${m.userId}`} className={`${inputClass} w-44`} value={m.brandId ?? ""} disabled={pending}
                          onChange={(e) => update(m.userId, { brandId: e.target.value || null })}>
                          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </>
                    ) : <span className="text-text-muted">{brandName(null)}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!self && (m.status === "active" ? (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Stop ${m.name} signing in? Their recipes and history stay.`)) update(m.userId, { status: "disabled" }); }}>Remove access</Button>
                    ) : (
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => update(m.userId, { status: "active" })}>Give access back</Button>
                        <Button size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${m.name}`} onClick={() => {
                          if (!confirm(`Delete ${m.name}? Their name and email are removed from ${BRAND.name} for good. Recipes they wrote stay, without their name. This can't be undone.`)) return;
                          setError(null);
                          start(async () => { const r = await deleteMemberAction(m.userId); if (!r.ok) setError(r.error); });
                        }}>Delete</Button>
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <Invite brands={brands} demo={demo} />
    </div>
  );
}

function Invite({ brands, demo }: { brands: { id: string; name: string }[]; demo: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<User["role"]>("viewer");
  const [brandId, setBrandId] = useState<string>(brands[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="h-fit p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg"><UserPlus aria-hidden className="size-5" />Invite someone</h2>
      <p className="mb-4 text-sm text-text-muted">{demo ? "Demo build: they're added straight away and can sign in with their email." : "They get an email with a link to choose their password."}</p>
      <form className="grid gap-4" onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await inviteMemberAction({ email, name, role, brandId: needsBrand(role) ? brandId || null : null });
          if (r.ok) { setMsg({ ok: true, text: `${demo ? "Added" : "Invite sent to"} ${email}.` }); setEmail(""); setName(""); }
          else setMsg({ ok: false, text: r.error });
        });
      }}>
        <Field label="Email" htmlFor="inv-email"><input id="inv-email" type="email" required maxLength={200} className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Name" htmlFor="inv-name"><input id="inv-name" maxLength={80} className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-semibold">Role</legend>
          {ROLES.map((r) => (
            <label key={r.value} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-accent">
              <input type="radio" name="inv-role" className="mt-0.5 size-4 accent-[var(--color-accent)]" checked={role === r.value} onChange={() => setRole(r.value)} />
              <span><span className="block font-semibold">{r.label}</span><span className="text-text-muted">{r.help}</span></span>
            </label>
          ))}
        </fieldset>
        {needsBrand(role) && (
          <Field label="Brand" htmlFor="inv-brand">
            <select id="inv-brand" className={inputClass} value={brandId} onChange={(e) => setBrandId(e.target.value)} required>
              {brands.length === 0 && <option value="">Add a brand first</option>}
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
        {msg && <Notice tone={msg.ok ? "info" : "danger"}>{msg.text}</Notice>}
        <Button type="submit" loading={pending}><UserPlus aria-hidden />{demo ? "Add person" : "Send invite"}</Button>
      </form>
    </Card>
  );
}

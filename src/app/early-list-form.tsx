"use client";
import { useActionState } from "react";
import { joinEarlyListAction } from "@/lib/actions";
import { Button, Field, inputClass } from "@/components/ui";

export function EarlyListForm() {
  const [state, action, pending] = useActionState(joinEarlyListAction, null);
  if (state?.ok) return <p role="status" className="rounded-md bg-surface p-4 font-semibold">{state.message}</p>;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" aria-label="Join the early list">
      <Field label="Your name" htmlFor="el-name"><input id="el-name" name="name" required maxLength={80} autoComplete="name" className={inputClass} /></Field>
      <Field label="Work email" htmlFor="el-email"><input id="el-email" name="email" type="email" required maxLength={200} autoComplete="email" className={inputClass} /></Field>
      <Field label="Company" htmlFor="el-company"><input id="el-company" name="company" required maxLength={120} autoComplete="organization" className={inputClass} /></Field>
      <Field label="How many sites?" htmlFor="el-sites"><input id="el-sites" name="sites" type="number" required min={1} max={5000} inputMode="numeric" className={inputClass} /></Field>
      {/* Left empty by people; bots that fill every field get a polite "thanks" and nothing is saved. */}
      <div aria-hidden className="absolute -left-[9999px]"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" size="lg" loading={pending}>Join the early list</Button>
        {state && !state.ok && <p role="alert" className="text-sm text-danger">{state.message}</p>}
        <p className="text-sm text-text-muted">We&apos;ll only use this to tell you when Onpass opens.</p>
      </div>
    </form>
  );
}

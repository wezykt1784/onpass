"use client";
import { useActionState } from "react";
import { setPassword } from "@/lib/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export default function SetPasswordPage() {
  const [state, action, pending] = useActionState(setPassword, null);
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-card">
        <h1 className="mb-1 text-lg">Choose a password</h1>
        <p className="mb-5 text-sm text-text-muted">At least 10 characters. A short sentence is easier to remember than a jumble.</p>
        <form action={action} className="grid gap-4">
          <Field label="New password" htmlFor="password">
            <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className={inputClass} />
          </Field>
          <Field label="Type it again" htmlFor="confirm">
            <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} className={inputClass} />
          </Field>
          {state?.ok === false && <Notice tone="danger">{state.error}</Notice>}
          <Button type="submit" size="lg" loading={pending}>Save password</Button>
        </form>
      </div>
    </main>
  );
}

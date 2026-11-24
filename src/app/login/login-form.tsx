"use client";
import { useActionState } from "react";
import { signIn } from "@/lib/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="grid gap-4">
      <Field label="Work email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue="central@demo.test" className={inputClass}
          aria-invalid={state?.ok === false || undefined} aria-describedby={state?.ok === false ? "login-error" : undefined} />
      </Field>
      <Field label="Password" htmlFor="password" hint="Passwords arrive with the real backend.">
        <input id="password" name="password" type="password" autoComplete="current-password" disabled className={inputClass} />
      </Field>
      {state?.ok === false && <div id="login-error"><Notice tone="danger">{state.error}</Notice></div>}
      <Button type="submit" size="lg" loading={pending}>Sign in</Button>
      <p className="text-center text-sm"><span className="text-text-muted">Forgot your password? Ask your admin to send a new invite.</span></p>
    </form>
  );
}

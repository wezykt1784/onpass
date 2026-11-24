"use client";
import { useActionState } from "react";
import { signIn } from "@/lib/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function LoginForm({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState(signIn, null);
  const err = state?.ok === false;
  return (
    <form action={action} className="grid gap-4">
      <Field label="Work email" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={demo ? "central@demo.test" : undefined}
          className={inputClass} aria-invalid={err || undefined} aria-describedby={err ? "login-error" : undefined} />
      </Field>
      <Field label="Password" htmlFor="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required={!demo} className={inputClass}
          aria-invalid={err || undefined} />
      </Field>
      {err && <div id="login-error"><Notice tone="danger">{state.error}</Notice></div>}
      <Button type="submit" size="lg" loading={pending}>Sign in</Button>
    </form>
  );
}

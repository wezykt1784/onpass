"use client";
import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-card">
        <h1 className="mb-1 text-lg">Reset your password</h1>
        {state?.ok ? (
          <p role="status" className="text-text-muted">If that email has an account, a reset link is on its way. It works once and expires in an hour. Check spam if it isn&apos;t there in a few minutes.</p>
        ) : (
          <>
            <p className="mb-5 text-sm text-text-muted">We&apos;ll email you a link to choose a new one.</p>
            <form action={action} className="grid gap-4">
              <Field label="Work email" htmlFor="email">
                <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
              </Field>
              {state?.ok === false && <Notice tone="danger">{state.error}</Notice>}
              <Button type="submit" size="lg" loading={pending}>Send reset link</Button>
            </form>
          </>
        )}
        <p className="mt-4 text-center text-sm"><Link href="/login" className="font-semibold text-accent underline">Back to sign in</Link></p>
      </div>
    </main>
  );
}

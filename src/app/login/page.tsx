import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-lg font-bold tracking-tight">Spec</p>
        <div className="rounded-lg border border-border bg-bg p-6 shadow-card">
          <h1 className="mb-1 text-lg">Sign in</h1>
          <p className="mb-5 text-sm text-text-muted">Recipes, spec books and allergen menus for your kitchens.</p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-text-muted">
          Demo build: sign in as central@demo.test, head@demo.test or site@demo.test. No password yet.
        </p>
      </div>
    </main>
  );
}

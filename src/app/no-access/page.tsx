import type { Metadata } from "next";
import { signOut } from "@/lib/actions";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "No access yet" };

export default function NoAccessPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-bg p-6 text-center shadow-card">
        <h1 className="mb-2 text-lg">You&apos;re signed in, but not added to a kitchen group yet</h1>
        <p className="mb-5 text-text-muted">Ask your group&apos;s admin to add you. Once they do, sign in again and your recipes will be here.</p>
        <form action={signOut}><Button variant="secondary">Sign out</Button></form>
      </div>
    </main>
  );
}

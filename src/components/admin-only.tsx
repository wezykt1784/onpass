import { Lock } from "lucide-react";
import { PageHeader } from "./ui";

export function AdminOnly({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex max-w-xl items-center gap-3 rounded-lg border border-border bg-bg p-5 text-text-muted">
        <Lock aria-hidden className="size-5 shrink-0" />
        <p>Only your group&apos;s admins can change this. Ask one of them if something here needs updating.</p>
      </div>
    </>
  );
}

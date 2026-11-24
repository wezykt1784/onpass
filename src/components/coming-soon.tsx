import type { ReactNode } from "react";
import { Hammer } from "lucide-react";
import { PageHeader } from "./ui";

export function ComingSoon({ title, milestone, children }: { title: string; milestone: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="grid max-w-2xl gap-3 rounded-lg border border-dashed border-border bg-bg p-6">
        <p className="flex items-center gap-2 font-semibold"><Hammer aria-hidden className="size-5 text-text-muted" />Not built yet: {milestone}</p>
        <div className="text-text-muted">{children}</div>
      </div>
    </>
  );
}

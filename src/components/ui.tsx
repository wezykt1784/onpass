// Primitives from replica/design/components.md. Token classes only, no raw colours.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { Rag } from "@/lib/types";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap border transition-colors duration-[var(--motion-fast)] disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:size-[18px]";
const btnVariant: Record<Variant, string> = {
  primary: "bg-accent text-on-accent border-transparent hover:bg-accent-hover",
  secondary: "bg-bg text-text border-border-input hover:bg-surface",
  ghost: "bg-transparent text-text border-transparent hover:bg-surface",
  danger: "bg-danger text-on-danger border-transparent",
  success: "bg-success text-on-success border-transparent",
};
const btnSize: Record<Size, string> = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cx(btnBase, btnVariant[variant], btnSize[size], extra);
}

export function Button({
  variant = "primary", size = "md", loading, className, children, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} aria-busy={loading || undefined} disabled={rest.disabled || loading} {...rest}>
      {loading && <span aria-hidden className="size-3.5 rounded-full border-2 border-current border-r-transparent animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export const inputClass =
  "h-10 w-full rounded-sm border border-border-input bg-bg px-3 text-base text-text placeholder:text-text-muted disabled:bg-surface disabled:text-text-muted aria-[invalid=true]:border-danger";

export function Field({ label, htmlFor, hint, error, children, className }: {
  label: string; htmlFor: string; hint?: string; error?: string | null; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">{label}</label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1.5 text-sm text-text-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} className="mt-1.5 text-sm text-danger">{error}</p>}
    </div>
  );
}

type PillTone = "draft" | "approved" | "archived" | "staging" | "live" | "scheduled" | "missing" | "batch" | "dish";
const pillTone: Record<PillTone, string> = {
  draft: "bg-unknown-bg text-unknown border-transparent",
  approved: "text-suitable border-suitable",
  archived: "bg-surface text-text-muted border-transparent",
  staging: "bg-warning-bg text-warning border-transparent",
  live: "bg-success text-on-success border-transparent",
  scheduled: "text-accent border-accent",
  missing: "text-danger border-danger",
  batch: "bg-surface text-text border-border",
  dish: "bg-bg text-text border-border",
};
export function Pill({ tone, children, className }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-pill border-[1.5px] px-2.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5", pillTone[tone], className)}>
      {children}
    </span>
  );
}

const ragTone: Record<Rag, string> = { green: "text-rag-green border-rag-green", amber: "text-rag-amber border-rag-amber", red: "text-rag-red border-rag-red" };
export function RagChip({ label, value }: { label: string; value: Rag | null }) {
  if (!value) return null;
  return (
    <span className={cx("inline-flex h-6 items-center rounded-pill border-[1.5px] px-2.5 text-xs font-semibold", ragTone[value])}>
      {label}: {value[0].toUpperCase() + value.slice(1)}
    </span>
  );
}

export function AllergenChip({ name, level = "contains", size = "md" }: { name: string; level?: "contains" | "may_contain" | "unknown"; size?: "sm" | "md" }) {
  const tone =
    level === "contains" ? "text-allergen border-allergen bg-bg"
    : level === "may_contain" ? "text-may-contain border-may-contain bg-may-contain-bg"
    : "text-unknown border-unknown bg-unknown-bg border-dashed";
  return (
    <span className={cx("inline-flex items-center rounded-pill border-[1.5px] font-semibold whitespace-nowrap", size === "sm" ? "h-6 px-2.5 text-xs" : "h-8 px-3 text-sm", tone)}>
      {level === "may_contain" ? `May contain ${name.toLowerCase()}` : name}
    </span>
  );
}

export function DietBadge({ short, name }: { short: string; name: string }) {
  return (
    <span role="img" title={name} aria-label={name} className="inline-grid h-6 min-w-7 place-items-center rounded-sm bg-suitable px-1.5 text-xs font-bold text-on-suitable">
      {short}
    </span>
  );
}

export function AllergenBars({ contains, mayContain, unknown, diets, compact }: {
  contains: string[]; mayContain: string[]; unknown: string[]; diets: string[]; compact?: boolean;
}) {
  const pad = compact ? "px-3 py-2 text-sm" : "px-4 py-3 text-base";
  return (
    <div className="grid gap-2">
      {unknown.length > 0 && (
        <p className={cx("rounded-md border-[1.5px] border-dashed border-unknown bg-unknown-bg font-bold text-unknown", pad)}>
          Allergen data missing for: {unknown.join(", ")}. This dish can&apos;t go to guests until it&apos;s filled in.
        </p>
      )}
      <p className={cx("rounded-md font-bold", pad, contains.length ? "bg-allergen text-on-allergen" : "border-[1.5px] border-suitable text-suitable")}>
        {contains.length ? `Allergens: ${contains.join(", ")}` : unknown.length ? "No allergens recorded so far" : "No listed allergens"}
      </p>
      {mayContain.length > 0 && <p className={cx("rounded-md bg-may-contain-bg font-bold text-may-contain", pad)}>May contain: {mayContain.join(", ")}</p>}
      {diets.length > 0 && <p className={cx("rounded-md bg-suitable font-bold text-on-suitable", pad)}>Suitable for: {diets.join(", ")}</p>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-border bg-bg", className)}>{children}</div>;
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl break-words">{title}</h1>
        {sub && <div className="mt-1 text-sm text-text-muted">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, text, action }: { icon?: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-lg border border-dashed border-border bg-bg px-6 py-12 text-center">
      {icon && <div className="text-text-muted [&_svg]:size-8">{icon}</div>}
      <p className="max-w-md text-text-muted">{text}</p>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-3" role="status" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-60" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14 w-full" />)}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "danger"; children: ReactNode }) {
  const t = tone === "warning" ? "bg-warning-bg text-warning" : tone === "danger" ? "border border-danger text-danger bg-bg" : "bg-surface text-text";
  return <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-md px-4 py-3 text-sm font-semibold", t)}>{children}</div>;
}

export { cx };

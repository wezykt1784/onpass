"use client";
// Type-ahead picker (components.md: Select / combobox). Keyboard: arrows move, Enter picks, Esc closes.
import { useId, useMemo, useRef, useState } from "react";
import { inputClass } from "./ui";

export interface Option {
  id: string;
  label: string;
  hint?: string;
  warn?: string;
}

export function Combobox({
  label, options, value, onChange, placeholder, onCreate, createLabel, id: idProp, invalid,
}: {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  onCreate?: (text: string) => void;
  createLabel?: (text: string) => string;
  id?: string;
  invalid?: boolean;
}) {
  const auto = useId();
  const id = idProp ?? auto;
  const listId = `${id}-list`;
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const shown = text ?? selected?.label ?? "";

  const matches = useMemo(() => {
    const terms = (text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => terms.every((t) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(t))).slice(0, 12);
  }, [options, text]);
  const canCreate = !!onCreate && !!text?.trim() && !options.some((o) => o.label.toLowerCase() === text.trim().toLowerCase());
  const total = matches.length + (canCreate ? 1 : 0);

  const pick = (i: number) => {
    if (i < matches.length) onChange(matches[i].id);
    else if (canCreate) onCreate!(text!.trim());
    setText(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <input
        ref={ref}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && total ? `${id}-opt-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        className={inputClass}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setText(null); }, 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, total - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && total) { e.preventDefault(); pick(active); }
          else if (e.key === "Escape") { setOpen(false); setText(null); }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="absolute z-30 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-md border border-border bg-bg py-1 shadow-pop">
          {matches.map((o, i) => (
            <li key={o.id} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(i); }} onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-surface" : ""}`}>
              <span className="font-semibold">{o.label}</span>
              {o.hint && <span className="ml-2 text-text-muted">{o.hint}</span>}
              {o.warn && <span className="ml-2 text-xs font-semibold text-warning">{o.warn}</span>}
            </li>
          ))}
          {canCreate && (
            <li id={`${id}-opt-${matches.length}`} role="option" aria-selected={active === matches.length}
              onMouseDown={(e) => { e.preventDefault(); pick(matches.length); }}
              className={`cursor-pointer px-3 py-2 text-sm font-semibold text-accent ${active === matches.length ? "bg-surface" : ""}`}>
              {createLabel ? createLabel(text!.trim()) : `Create "${text!.trim()}"`}
            </li>
          )}
          {!total && <li className="px-3 py-2 text-sm text-text-muted">No match.</li>}
        </ul>
      )}
    </div>
  );
}

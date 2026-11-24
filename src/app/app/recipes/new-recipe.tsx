"use client";
import { useActionState, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { createRecipeAction } from "@/lib/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function NewRecipeButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createRecipeAction, null);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><Button><Plus aria-hidden />New recipe</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/40" />
        <Dialog.Content onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById("new-name")?.focus(); }} className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bg p-6 shadow-pop">
          <div className="mb-4 flex items-start justify-between">
            <Dialog.Title className="text-lg">New recipe</Dialog.Title>
            <Dialog.Close aria-label="Close" className="rounded-sm p-1 text-text-muted hover:bg-surface"><X className="size-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="mb-4 text-sm text-text-muted">A batch recipe is something you make ahead (a sauce, a dough). A dish is what goes on the plate.</Dialog.Description>
          <form action={action} className="grid gap-4">
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1.5 text-sm font-semibold">Type</legend>
              {(["dish", "batch"] as const).map((k) => (
                <label key={k} className="flex h-12 cursor-pointer items-center gap-2 rounded-md border border-border-input px-3 font-semibold has-[:checked]:border-accent has-[:checked]:bg-surface">
                  <input type="radio" name="kind" value={k} defaultChecked={k === "dish"} className="accent-[var(--color-accent)]" />
                  {k === "dish" ? "Dish" : "Batch recipe"}
                </label>
              ))}
            </fieldset>
            <Field label="Name" htmlFor="new-name">
              <input id="new-name" name="name" required maxLength={120} className={inputClass} placeholder="e.g. Harissa mayo" />
            </Field>
            {state?.ok === false && <Notice tone="danger">{state.error}</Notice>}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild><Button type="button" variant="ghost">Cancel</Button></Dialog.Close>
              <Button type="submit" loading={pending}>Create</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

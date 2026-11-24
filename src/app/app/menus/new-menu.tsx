"use client";
import { useActionState, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { createMenuAction } from "@/lib/actions";
import { Button, Field, Notice, inputClass } from "@/components/ui";

export function NewMenuButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createMenuAction, null);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><Button><Plus aria-hidden />New menu</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-text/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-bg p-6 shadow-pop">
          <div className="mb-4 flex items-start justify-between">
            <Dialog.Title className="text-lg">New menu</Dialog.Title>
            <Dialog.Close aria-label="Close" className="rounded-sm p-1 text-text-muted hover:bg-surface"><X className="size-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Name the menu. You add sections and dishes next.</Dialog.Description>
          <form action={action} className="grid gap-4">
            <Field label="Menu name" htmlFor="menu-name" hint="For your team. Guests see the display name, which you can set next.">
              <input id="menu-name" name="name" required maxLength={120} className={inputClass} placeholder="e.g. Spring menu 2027" />
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

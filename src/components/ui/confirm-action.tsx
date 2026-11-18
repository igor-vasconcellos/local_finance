"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

/**
 * Botão que pede confirmação antes de chamar uma Server Action
 * (ex.: excluir). Os `fields` vão no FormData enviado.
 */
export function ConfirmAction({
  action,
  fields,
  title,
  description,
  confirmLabel = "Excluir",
  tone = "danger",
  trigger,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  trigger: (open: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, String(v));
    startTransition(async () => {
      await action(fd);
      setOpen(false);
    });
  };

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onClose={() => !pending && setOpen(false)} title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={confirm} loading={pending} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

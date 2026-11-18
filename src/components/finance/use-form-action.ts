"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import type { ActionState } from "@/server/actions/form-state";

/**
 * Envia o formulário para a Server Action SEM o reset automático do React 19
 * (que apagaria o que o usuário digitou quando a validação falha).
 */
export function useFormAction(fn: (prev: ActionState, fd: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(fn, {});
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return { state, onSubmit, pending };
}

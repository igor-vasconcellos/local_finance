"use client";

import { useEffect } from "react";
import type { ActionState } from "@/server/actions/form-state";

/** Chama onDone quando a Server Action do formulário retornar ok. */
export function useCloseOnSuccess(state: ActionState, onDone: () => void) {
  useEffect(() => {
    if (state.ok) onDone();
  }, [state, onDone]);
}

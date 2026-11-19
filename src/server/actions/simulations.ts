"use server";

import { refresh } from "next/cache";
import { simulationSchema } from "@/lib/validation/finance";
import { requireUserId } from "@/server/auth/current";
import {
  createSimulation,
  deleteSimulation,
  effectivateSimulation,
  setSimulationVisible,
} from "@/server/finance/simulations";
import { formObject, invalid, parseId, type ActionState } from "./form-state";

export async function saveSimulationAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const uid = await requireUserId();
  const parsed = simulationSchema.safeParse(formObject(fd));
  if (!parsed.success) return invalid(parsed.error);
  const result = createSimulation(uid, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function toggleSimulationAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) setSimulationVisible(uid, id, fd.get("visible") === "true");
  refresh();
}

export async function deleteSimulationAction(fd: FormData): Promise<void> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (id) deleteSimulation(uid, id);
  refresh();
}

export async function effectivateSimulationAction(fd: FormData): Promise<{ error?: string }> {
  const uid = await requireUserId();
  const id = parseId(fd.get("id"));
  if (!id) return { error: "Simulação inválida." };
  const result = effectivateSimulation(uid, id);
  if (!result.ok) return { error: result.error };
  refresh();
  return {};
}

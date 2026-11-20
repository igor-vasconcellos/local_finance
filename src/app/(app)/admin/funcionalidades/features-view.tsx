"use client";

import { Calculator, FileUp, Lock, PiggyBank } from "lucide-react";
import { useState } from "react";
import { useCloseOnSuccess } from "@/components/finance/use-close-on-success";
import { useFormAction } from "@/components/finance/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/page";
import { setFeatureAction } from "@/server/actions/admin";
import type { FeatureRow } from "@/server/admin/service";
import { FEATURE_NAME, formatDateTime } from "../format";

const ICONS = { boxes: PiggyBank, simulator: Calculator, invoice_import: FileUp } as const;
const HINTS = {
  boxes: "Página de caixinhas, aportes e resgates.",
  simulator: "Simulações de compras e o botão de efetivar.",
  invoice_import: "Envio de arquivos de fatura (CSV/PDF) nos cartões.",
} as const;

function FeatureDialog({ feature, onClose }: { feature: FeatureRow; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(setFeatureAction);
  useCloseOnSuccess(state, onClose);
  const locking = !feature.locked;
  return (
    <Dialog
      open
      onClose={onClose}
      title={locking ? `Travar ${FEATURE_NAME[feature.key]}?` : `Liberar ${FEATURE_NAME[feature.key]}?`}
      description={
        locking
          ? "Fica indisponível para todos os usuários, menos para você. Nenhum dado é apagado."
          : "Volta a funcionar para todos os usuários."
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <input type="hidden" name="key" value={feature.key} />
        <input type="hidden" name="locked" value={String(locking)} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {locking && (
          <Field id="message" label="Mensagem para os usuários (opcional)" hint="Ex.: Em manutenção, volta amanhã.">
            <Input id="message" name="message" maxLength={200} defaultValue={feature.message ?? ""} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant={locking ? "danger" : "primary"} loading={pending}>
            {locking ? "Travar" : "Liberar"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function FeaturesView({ features }: { features: FeatureRow[] }) {
  const [editing, setEditing] = useState<FeatureRow | null>(null);
  return (
    <>
      <Card>
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Funcionalidades</h2>
          <p className="text-sm text-muted-foreground">Travas valem para todos os usuários. Você (admin) continua usando tudo.</p>
        </div>
        <ul className="divide-y">
          {features.map((f) => {
            const Icon = ICONS[f.key];
            return (
              <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{FEATURE_NAME[f.key]}</p>
                    {f.locked ? (
                      <Badge tone="danger" dot>
                        <Lock className="size-3" aria-hidden /> Travada
                      </Badge>
                    ) : (
                      <Badge tone="success" dot>
                        Liberada
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{HINTS[f.key]}</p>
                  {f.locked && f.message && <p className="mt-1 text-xs">Mensagem: “{f.message}”</p>}
                  {f.updatedAt && <p className="text-xs text-muted-foreground">Alterada em {formatDateTime(f.updatedAt)}</p>}
                </div>
                <Button variant={f.locked ? "primary" : "secondary"} size="sm" onClick={() => setEditing(f)}>
                  {f.locked ? "Liberar" : "Travar"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      {editing && <FeatureDialog feature={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

"use client";

import { History, Laptop, LogOut, Smartphone } from "lucide-react";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revokeMySessionAction, revokeOtherSessionsAction } from "@/server/actions/sessions";

export type DeviceItem = { id: string; device: string; ip: string; lastSeen: string; since: string; current: boolean; mobile: boolean };
export type ActivityItem = { id: number; label: string; device: string; ip: string; when: string; danger: boolean };

/** "Minha atividade": aparelhos conectados e últimos acessos da própria conta. */
export function ActivitySection({ devices, activity }: { devices: DeviceItem[]; activity: ActivityItem[] }) {
  const others = devices.filter((d) => !d.current).length;
  return (
    <div className="mt-6 grid gap-6">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Aparelhos conectados</h3>
          {others > 0 && (
            <ConfirmAction
              action={revokeOtherSessionsAction}
              fields={{}}
              title="Sair de todos os outros aparelhos?"
              description={`${others} sessão(ões) serão encerradas. Este aparelho continua conectado.`}
              confirmLabel="Encerrar as outras"
              trigger={(open) => (
                <Button variant="secondary" size="sm" onClick={open}>
                  <LogOut aria-hidden /> Encerrar todas as outras
                </Button>
              )}
            />
          )}
        </div>
        <ul className="divide-y rounded-xl border">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
                {d.mobile ? <Smartphone /> : <Laptop />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {d.device}
                  {d.current && <Badge tone="success">Este aparelho</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {d.ip} · último uso {d.lastSeen} · entrou {d.since}
                </p>
              </div>
              {!d.current && (
                <ConfirmAction
                  action={revokeMySessionAction}
                  fields={{ sessionId: d.id }}
                  title="Encerrar esta sessão?"
                  description={`${d.device} será desconectado e precisará entrar de novo.`}
                  confirmLabel="Encerrar"
                  trigger={(open) => (
                    <Button variant="ghost" size="sm" onClick={open}>
                      Encerrar
                    </Button>
                  )}
                />
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" aria-hidden /> Atividade recente
        </h3>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <Badge tone={a.danger ? "danger" : "neutral"} dot>
                    {a.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{a.device}</span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {a.when} · {a.ip}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Não reconhece algum acesso? Encerre as outras sessões e troque sua senha em “Esqueci minha senha”.
        </p>
      </div>
    </div>
  );
}

"use client";

import { Ban, Gift, LockOpen, LogOut, MoreHorizontal, ShieldCheck, Users, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useCloseOnSuccess } from "@/components/finance/use-close-on-success";
import { useFormAction } from "@/components/finance/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Card, EmptyState } from "@/components/ui/page";
import {
  blockUserAction,
  grantCourtesyAction,
  revokeCourtesyAction,
  revokeSessionsAction,
  unblockUserAction,
} from "@/server/actions/admin";
import type { AdminUserRow } from "@/server/admin/service";
import { formatDateTime, formatDay } from "../format";

export type UserItem = Omit<AdminUserRow, "email"> & { maskedEmail: string };

function StatusBadges({ u }: { u: UserItem }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {u.isAdmin && (
        <Badge tone="primary">
          <ShieldCheck className="size-3" aria-hidden /> Admin
        </Badge>
      )}
      {u.blockedAt && (
        <Badge tone="danger" dot>
          Bloqueada
        </Badge>
      )}
      {u.courtesyActive && (
        <Badge tone="success" dot>
          Cortesia{u.courtesyUntil ? ` até ${formatDay(u.courtesyUntil)}` : " permanente"}
        </Badge>
      )}
      {u.courtesyAt && !u.courtesyActive && <Badge tone="warning">Cortesia vencida</Badge>}
      {!u.verified && <Badge>E-mail não confirmado</Badge>}
      {!u.isAdmin && !u.blockedAt && !u.courtesyAt && u.verified && <Badge>Normal</Badge>}
    </div>
  );
}

function BlockDialog({ user, onClose }: { user: UserItem; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(blockUserAction);
  useCloseOnSuccess(state, onClose);
  return (
    <Dialog open onClose={onClose} title="Bloquear conta" description={`${user.name} · ${user.maskedEmail}`}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <input type="hidden" name="userId" value={user.id} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <Field id="reason" label="Motivo (a pessoa vai ver)" error={state.fields?.reason}>
          <textarea
            name="reason"
            rows={3}
            maxLength={300}
            required
            defaultValue="Falta de pagamento."
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
            {...fieldControlProps("reason", state.fields?.reason)}
          />
        </Field>
        <p className="text-sm text-muted-foreground">
          A pessoa é desconectada na hora. Ao entrar de novo, só consegue consultar e exportar os próprios dados.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="danger" loading={pending}>
            Bloquear
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CourtesyDialog({ user, today, onClose }: { user: UserItem; today: string; onClose: () => void }) {
  const { state, onSubmit, pending } = useFormAction(grantCourtesyAction);
  useCloseOnSuccess(state, onClose);
  const [withEnd, setWithEnd] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Liberar acesso grátis (cortesia)" description={`${user.name} · ${user.maskedEmail}`}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <input type="hidden" name="userId" value={user.id} />
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-1 font-medium">Duração</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" checked={!withEnd} onChange={() => setWithEnd(false)} /> Permanente
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" checked={withEnd} onChange={() => setWithEnd(true)} /> Até uma data
          </label>
        </fieldset>
        {withEnd ? (
          <Field id="until" label="Último dia da cortesia">
            <DateInput id="until" name="until" min={today} defaultValue={today} />
          </Field>
        ) : (
          <input type="hidden" name="until" value="" />
        )}
        <p className="text-sm text-muted-foreground">Contas em cortesia nunca são cobradas enquanto ela estiver valendo.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={pending}>
            Liberar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

type Confirm = {
  title: string;
  description: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  action: (fd: FormData) => Promise<{ error?: string }>;
};

/** Confirmação das ações rápidas (fica fora do menu para não sumir quando ele fecha). */
function ConfirmDialog({ confirm, userId, onClose }: { confirm: Confirm; userId: number; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    const fd = new FormData();
    fd.set("userId", String(userId));
    startTransition(async () => {
      const result = await confirm.action(fd);
      if (result?.error) setError(result.error);
      else onClose();
    });
  };
  return (
    <Dialog open onClose={() => !pending && onClose()} title={confirm.title} description={confirm.description}>
      {error && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant={confirm.tone} onClick={run} loading={pending}>
          {confirm.confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

function RowActions({
  user,
  onBlock,
  onCourtesy,
  onConfirm,
}: {
  user: UserItem;
  onBlock: () => void;
  onCourtesy: () => void;
  onConfirm: (c: Confirm) => void;
}) {
  const [open, setOpen] = useState(false);
  if (user.isAdmin) return <span className="text-xs text-muted-foreground">Protegida</span>;
  const who = `${user.name} (${user.maskedEmail})`;
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="relative">
      <Button variant="ghost" size="sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal aria-hidden /> Ações
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-20 mt-1 grid w-56 gap-0.5 rounded-xl border bg-card p-1 shadow-lg">
            {user.blockedAt ? (
              <MenuItem
                icon={<LockOpen />}
                onClick={pick(() =>
                  onConfirm({
                    title: "Desbloquear conta?",
                    description: `${who} volta a usar o sistema normalmente.`,
                    confirmLabel: "Desbloquear",
                    tone: "primary",
                    action: unblockUserAction,
                  }),
                )}
              >
                Desbloquear
              </MenuItem>
            ) : (
              <MenuItem icon={<Ban />} tone="danger" onClick={pick(onBlock)}>
                Bloquear
              </MenuItem>
            )}
            <MenuItem icon={<Gift />} onClick={pick(onCourtesy)}>
              {user.courtesyAt ? "Alterar cortesia" : "Liberar cortesia"}
            </MenuItem>
            {user.courtesyAt && (
              <MenuItem
                icon={<X />}
                onClick={pick(() =>
                  onConfirm({
                    title: "Remover cortesia?",
                    description: `${who} passa a seguir a regra normal de acesso.`,
                    confirmLabel: "Remover",
                    tone: "danger",
                    action: revokeCourtesyAction,
                  }),
                )}
              >
                Remover cortesia
              </MenuItem>
            )}
            <MenuItem
              icon={<LogOut />}
              onClick={pick(() =>
                onConfirm({
                  title: "Encerrar todas as sessões?",
                  description: `${who} será desconectada de todos os aparelhos e precisará entrar de novo.`,
                  confirmLabel: "Encerrar sessões",
                  tone: "danger",
                  action: revokeSessionsAction,
                }),
              )}
            >
              Encerrar sessões
            </MenuItem>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        "flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted [&_svg]:size-4 " +
        (tone === "danger" ? "text-danger" : "text-foreground")
      }
    >
      {icon}
      {children}
    </button>
  );
}

export function UsersView({ users, today, search }: { users: UserItem[]; today: string; search: string }) {
  const [dialog, setDialog] = useState<
    { kind: "block" | "courtesy"; user: UserItem } | { kind: "confirm"; user: UserItem; confirm: Confirm } | null
  >(null);
  const close = () => setDialog(null);

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title={search ? "Nenhuma conta encontrada" : "Nenhuma conta ainda"}
        description={search ? "Confira o nome ou o e-mail completo." : undefined}
      />
    );
  }

  return (
    <>
      <Card>
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">Contas{search ? ` encontradas (${users.length})` : ` (${users.length})`}</h2>
          <p className="text-sm text-muted-foreground">E-mails aparecem mascarados. Para achar alguém, busque pelo e-mail completo.</p>
        </div>
        <ul className="divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1 basis-full sm:basis-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.maskedEmail}</p>
              </div>
              <StatusBadges u={u} />
              <div className="grid text-xs text-muted-foreground sm:w-44 sm:text-right">
                <span>Criada em {formatDateTime(u.createdAt)}</span>
                <span>Último acesso {formatDateTime(u.lastSeenAt)}</span>
              </div>
              <RowActions
                user={u}
                onBlock={() => setDialog({ kind: "block", user: u })}
                onCourtesy={() => setDialog({ kind: "courtesy", user: u })}
                onConfirm={(confirm) => setDialog({ kind: "confirm", user: u, confirm })}
              />
              {u.blockedAt && u.blockedReason && (
                <p className="basis-full text-xs text-danger">Motivo do bloqueio: {u.blockedReason}</p>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {dialog?.kind === "block" && <BlockDialog user={dialog.user} onClose={close} />}
      {dialog?.kind === "courtesy" && <CourtesyDialog user={dialog.user} today={today} onClose={close} />}
      {dialog?.kind === "confirm" && <ConfirmDialog confirm={dialog.confirm} userId={dialog.user.id} onClose={close} />}
    </>
  );
}

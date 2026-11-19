"use client";

import { DateInput } from "@/components/ui/date-input";
import { BookOpen, Check, Gauge, KeyRound, Landmark, Percent, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { startTransition, useActionState, useState, type ReactNode } from "react";
import { HealthBadge } from "@/components/finance/health-badge";
import { Avatar } from "@/components/layout/avatar";
import { AVATAR_COLORS } from "@/lib/profile";
import { Guide } from "./guide";
import { SettingsNav } from "./settings-nav";
import { useFormAction } from "@/components/finance/use-form-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, fieldControlProps } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Card } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { formatDate, type ISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { formatAmount, formatBRL } from "@/lib/money";
import { annualToMonthlyPct, bpToPct, formatPct, monthlyToAnnualPct, parsePct } from "@/lib/rates";
import {
  deleteCdiAction,
  saveBalanceAction,
  saveCdiAction,
  saveAvatarColorAction,
  saveNameAction,
  saveThresholdsAction,
} from "@/server/actions/settings";
import type { ActionState } from "@/server/actions/form-state";
import type { AppSettings, CdiRate } from "@/server/finance/settings";

type Props = {
  user: { name: string; maskedEmail: string; avatarColor: string | null };
  sessionExpiresAt: string;
  mailViaSmtp: boolean;
  settings: AppSettings;
  cdiRates: CdiRate[];
  currentCdi: CdiRate | null;
  today: ISODate;
};

const SECTIONS = [
  { id: "conta", label: "Conta" },
  { id: "saldo", label: "Saldo em conta" },
  { id: "cdi", label: "CDI" },
  { id: "farol", label: "Farol de saúde" },
  { id: "seguranca", label: "Segurança" },
  { id: "guia", label: "Guia de uso" },
];

export function SettingsView(props: Props) {
  return (
    <div className="grid gap-8 lg:grid-cols-[180px_1fr]">
      <SettingsNav sections={SECTIONS} />

      <div className="grid min-w-0 gap-6">
        <AccountSection user={props.user} />
        <BalanceSection settings={props.settings} today={props.today} />
        <CdiSection rates={props.cdiRates} current={props.currentCdi} today={props.today} />
        <HealthSection settings={props.settings} />
        <SecuritySection {...props} />
        <Section id="guia" icon={<BookOpen />} title="Guia de uso" description="O que cada parte do sistema faz e como usar.">
          <Guide />
        </Section>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------

function Section({ id, icon, title, description, children }: { id: string; icon: ReactNode; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="scroll-mt-6">
      <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
        <header className="flex items-start gap-3 border-b px-6 py-5">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4">
            {icon}
          </span>
          <div>
            <h2 id={`${id}-title`} tabIndex={-1} className="font-semibold outline-none">
              {title}
            </h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </header>
        <div className="px-6 py-5">{children}</div>
      </section>
    </Card>
  );
}

function Saved({ state, message = "Salvo." }: { state: ActionState; message?: string }) {
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (state.ok) return <p className="text-sm font-medium text-success" role="status">✓ {message}</p>;
  return null;
}

// ---------------------------------------------------------------- Conta --

function AccountSection({ user }: { user: Props["user"] }) {
  const { state, onSubmit, pending } = useFormAction(saveNameAction);
  const f = state.fields ?? {};
  return (
    <Section id="conta" icon={<UserRound />} title="Conta" description="Como o app chama você.">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field id="name" label="Nome" error={f.name}>
          <Input {...fieldControlProps("name", f.name)} name="name" defaultValue={user.name} autoComplete="name" />
        </Field>
        <Field id="email" label="E-mail de acesso" hint="Usado no login e para receber o código de verificação.">
          <Input id="email" value={user.maskedEmail} readOnly disabled aria-describedby="email-hint" />
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={pending}>
            Salvar nome
          </Button>
          <Saved state={state} message="Nome atualizado." />
        </div>
      </form>
      <AvatarColorPicker name={user.name} color={user.avatarColor} />
    </Section>
  );
}

function AvatarColorPicker({ name, color }: { name: string; color: string | null }) {
  const [state, dispatch, pending] = useActionState(saveAvatarColorAction, {});
  const [selected, setSelected] = useState(color ?? AVATAR_COLORS[0]);

  const choose = (c: string) => {
    setSelected(c);
    const fd = new FormData();
    fd.set("color", c);
    startTransition(() => dispatch(fd));
  };

  return (
    <div className="mt-6 border-t pt-5">
      <p className="mb-1 text-sm font-medium">Cor do perfil</p>
      <p className="mb-4 text-xs text-muted-foreground">Fundo do seu avatar na barra lateral. Salva ao clicar.</p>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} color={selected} className="size-14 text-lg" />
        <div role="radiogroup" aria-label="Cor do perfil" className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={selected === c}
              aria-label={`Cor ${c}`}
              disabled={pending}
              onClick={() => choose(c)}
              className={cn(
                "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
                selected === c && "ring-2 ring-foreground/60",
              )}
              style={{ background: c }}
            >
              {selected === c && <Check className="size-4 text-white" aria-hidden />}
            </button>
          ))}
        </div>
        <Saved state={state} message="Cor atualizada." />
      </div>
    </div>
  );
}

// ---------------------------------------------------------- Saldo em conta --

function BalanceSection({ settings, today }: { settings: AppSettings; today: ISODate }) {
  const { state, onSubmit, pending } = useFormAction(saveBalanceAction);
  const f = state.fields ?? {};
  const current = settings.accountBalanceCents;
  return (
    <Section
      id="saldo"
      icon={<Landmark />}
      title="Saldo em conta corrente"
      description="Entra no patrimônio líquido: saldo em conta + caixinhas − o que falta pagar nos cartões."
    >
      {current !== null && (
        <p className="mb-4 text-sm text-muted-foreground">
          Atual: <strong className="text-foreground tabular-nums">{formatBRL(current)}</strong>
          {settings.accountBalanceDate && <> · informado em {formatDate(settings.accountBalanceDate)}</>}
        </p>
      )}
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_180px]" noValidate>
        <Field id="balance" label="Saldo" error={f.balance}>
          <MoneyInput {...fieldControlProps("balance", f.balance)} name="balance" defaultValue={current !== null ? formatAmount(Math.abs(current)) : ""} />
        </Field>
        <Field id="date" label="Data do saldo" error={f.date}>
          <DateInput {...fieldControlProps("date", f.date)} name="date" defaultValue={today} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="negative" defaultChecked={current !== null && current < 0} className="size-4 accent-[var(--primary)]" />
          Saldo negativo (cheque especial)
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={pending}>
            Atualizar saldo
          </Button>
          <Saved state={state} message="Saldo atualizado." />
        </div>
      </form>
    </Section>
  );
}

// ------------------------------------------------------------------ CDI --

function CdiSection({ rates, current, today }: { rates: CdiRate[]; current: CdiRate | null; today: ISODate }) {
  const { state, onSubmit, pending } = useFormAction(saveCdiAction);
  const f = state.fields ?? {};
  const [mode, setMode] = useState<"monthly" | "annual">("monthly");
  const [rate, setRate] = useState("");

  const typed = parsePct(rate);
  const conversion =
    typed && typed > 0
      ? mode === "monthly"
        ? `≈ ${formatPct(monthlyToAnnualPct(typed))} ao ano`
        : `≈ ${formatPct(annualToMonthlyPct(typed), 4)} ao mês`
      : null;

  const currentAnnual = current ? bpToPct(current.annualRateBp) : null;

  return (
    <Section
      id="cdi"
      icon={<Percent />}
      title="Taxa CDI"
      description="Base para o rendimento das caixinhas. Informe como aparece no app do seu banco: por mês ou por ano."
    >
      {currentAnnual !== null && current && (
        <div className="mb-5 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Ao mês</p>
            <p className="text-lg font-semibold tabular-nums">{formatPct(annualToMonthlyPct(currentAnnual), 2)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Ao ano</p>
            <p className="text-lg font-semibold tabular-nums">{formatPct(currentAnnual)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Vigente desde</p>
            <p className="text-lg font-semibold tabular-nums">{formatDate(current.effectiveFrom)}</p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <div className="grid gap-2 sm:max-w-xs">
          <span className="text-sm font-medium">Informar taxa</span>
          <Segmented
            name="mode"
            ariaLabel="Período da taxa"
            value={mode}
            onChange={setMode}
            options={[
              { value: "monthly", label: "Por mês" },
              { value: "annual", label: "Por ano" },
            ]}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="rate"
            label={mode === "monthly" ? "CDI do mês (%)" : "CDI anual (%)"}
            error={f.rate}
            hint={conversion ?? (mode === "monthly" ? "Ex.: 1,07" : "Ex.: 13,65")}
          >
            <div className="relative">
              <Input
                {...fieldControlProps("rate", f.rate, true)}
                name="rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^\d,.]/g, ""))}
                placeholder={mode === "monthly" ? "1,07" : "13,65"}
                className="pr-16"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
                {mode === "monthly" ? "% a.m." : "% a.a."}
              </span>
            </div>
          </Field>
          <Field id="effectiveFrom" label="Vale a partir de" error={f.effectiveFrom}>
            <DateInput {...fieldControlProps("effectiveFrom", f.effectiveFrom)} name="effectiveFrom" defaultValue={today} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Salvar taxa
          </Button>
          <Saved state={state} message="Taxa registrada." />
        </div>
      </form>

      {rates.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-medium">Histórico</h3>
          <ul className="divide-y rounded-xl border">
            {rates.map((r) => {
              const annual = bpToPct(r.annualRateBp);
              return (
                <li key={r.id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                  <span className="w-24 tabular-nums text-muted-foreground">{formatDate(r.effectiveFrom)}</span>
                  <span className="flex-1 tabular-nums">
                    {formatPct(annualToMonthlyPct(annual))} a.m. · {formatPct(annual)} a.a.
                  </span>
                  {rates.length > 1 && (
                    <ConfirmAction
                      action={deleteCdiAction}
                      fields={{ id: r.id }}
                      title="Remover taxa do histórico?"
                      description={`A taxa vigente desde ${formatDate(r.effectiveFrom)} será removida.`}
                      confirmLabel="Remover"
                      trigger={(open) => (
                        <IconButton label="Remover taxa" tone="danger" onClick={open}>
                          <Trash2 />
                        </IconButton>
                      )}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- Farol --

function HealthSection({ settings }: { settings: AppSettings }) {
  const { state, onSubmit, pending } = useFormAction(saveThresholdsAction);
  const f = state.fields ?? {};
  const fmt = (bp: number) => (bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const [green, setGreen] = useState(fmt(settings.greenThresholdBp));
  const [yellow, setYellow] = useState(fmt(settings.yellowThresholdBp));
  const g = parsePct(green);
  const y = parsePct(yellow);

  return (
    <Section
      id="farol"
      icon={<Gauge />}
      title="Farol de saúde financeira"
      description="Classifica cada mês pelo percentual da renda que sobra livre depois de todas as contas."
    >
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="green" label="Verde a partir de (%)" error={f.green} hint="Sobra acima deste percentual = saudável">
            <Input {...fieldControlProps("green", f.green, true)} name="green" inputMode="decimal" value={green} onChange={(e) => setGreen(e.target.value)} />
          </Field>
          <Field id="yellow" label="Amarelo a partir de (%)" error={f.yellow} hint="Abaixo deste percentual = crítico">
            <Input {...fieldControlProps("yellow", f.yellow, true)} name="yellow" inputMode="decimal" value={yellow} onChange={(e) => setYellow(e.target.value)} />
          </Field>
        </div>

        {g !== null && y !== null && g > y && (
          <ul className="grid gap-2 rounded-xl bg-muted/60 p-4 text-sm" aria-label="Prévia das faixas">
            <li className="flex items-center gap-3">
              <HealthBadge health="green" /> sobra acima de {formatPct(g, 0)} da renda
            </li>
            <li className="flex items-center gap-3">
              <HealthBadge health="yellow" /> sobra entre {formatPct(y, 0)} e {formatPct(g, 0)}
            </li>
            <li className="flex items-center gap-3">
              <HealthBadge health="red" /> sobra abaixo de {formatPct(y, 0)} ou saldo negativo
            </li>
          </ul>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Salvar limites
          </Button>
          <Saved state={state} message="Limites atualizados." />
        </div>
      </form>
    </Section>
  );
}

// ------------------------------------------------------------- Segurança --

function SecuritySection({ user, mailViaSmtp, sessionExpiresAt }: Props) {
  const expires = new Date(sessionExpiresAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return (
    <Section id="seguranca" icon={<ShieldCheck />} title="Segurança" description="Login em duas etapas e sessão.">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Verificação em duas etapas</dt>
          <dd className="mt-0.5 font-medium">
            {mailViaSmtp ? `Ativa · código por e-mail para ${user.maskedEmail}` : "Ativa · código exibido no terminal (SMTP não configurado)"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sessão atual</dt>
          <dd className="mt-0.5 font-medium">Expira em {expires}</dd>
        </div>
      </dl>
      <div className="mt-5 flex items-start gap-3 rounded-xl bg-muted/60 p-4 text-sm">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-muted-foreground">
          Esqueceu a senha? Na tela de login, clique em <strong className="text-foreground">Esqueci minha senha</strong>: enviamos um
          código para o seu e-mail e você cria uma senha nova.
        </p>
      </div>
    </Section>
  );
}

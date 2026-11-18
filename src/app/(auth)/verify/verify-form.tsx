"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/ui/otp-input";
import { resendCodeAction, verifyAction, type FormState } from "@/server/actions/auth";

const RESEND_COOLDOWN = 30;

export function VerifyForm({ initialWait }: { initialWait: number }) {
  const [state, verify, verifying] = useActionState<FormState, FormData>(verifyAction, {});
  const [resendState, resend, resending] = useActionState<FormState, FormData>(resendCodeAction, {});

  const [wait, setWait] = useState(initialWait);
  const [otpResetKey, setOtpResetKey] = useState(0);

  // Reage a cada novo resultado de reenvio (ajuste de estado durante o render, padrão React).
  const [seenResend, setSeenResend] = useState(resendState);
  if (resendState !== seenResend) {
    setSeenResend(resendState);
    if (resendState.notice) {
      setWait(RESEND_COOLDOWN);
      setOtpResetKey((c) => c + 1); // recria o campo de código vazio
    }
  }

  // Código errado: limpa as caixas para digitar de novo.
  const [seenVerify, setSeenVerify] = useState(state);
  if (state !== seenVerify) {
    setSeenVerify(state);
    if (state.error) setOtpResetKey((c) => c + 1);
  }

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Envia automaticamente quando o 6º dígito é digitado/colado.
  const submitCode = (code: string) => {
    const fd = new FormData();
    fd.set("code", code);
    startTransition(() => verify(fd));
  };

  const showResendNotice = Boolean(resendState.notice) && !state.error;

  return (
    <div className="grid gap-5">
      <form action={verify} className="grid gap-5">
        {state.error && <Alert tone="danger">{state.error}</Alert>}
        {showResendNotice && <Alert tone="success">{resendState.notice}</Alert>}
        {resendState.error && <Alert tone="warning">{resendState.error}</Alert>}

        <OtpInput
          key={otpResetKey}
          autoFocus
          invalid={Boolean(state.error)}
          disabled={verifying}
          onComplete={submitCode}
        />

        <Button type="submit" size="lg" className="w-full" loading={verifying}>
          {verifying ? "Verificando…" : "Confirmar"}
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <Link href="/login" className="text-muted-foreground hover:text-foreground">
          ← Voltar
        </Link>
        <form action={resend}>
          <Button type="submit" variant="link" className="px-0" disabled={wait > 0} loading={resending}>
            {wait > 0 ? `Reenviar código em ${wait}s` : "Reenviar código"}
          </Button>
        </form>
      </div>
    </div>
  );
}

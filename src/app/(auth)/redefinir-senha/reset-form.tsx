"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";
import { PasswordInput } from "@/components/ui/password-input";
import { resendResetCodeAction, resetPasswordAction, type FormState } from "@/server/actions/auth";

export function ResetForm({ initialWait }: { initialWait: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const [resendState, resend, resending] = useActionState<FormState, FormData>(resendResetCodeAction, {});
  const f = state.fields ?? {};
  const [password, setPassword] = useState("");
  const [wait, setWait] = useState(initialWait);
  const [otpKey, setOtpKey] = useState(0);

  const [seenResend, setSeenResend] = useState(resendState);
  if (resendState !== seenResend) {
    setSeenResend(resendState);
    if (resendState.notice) {
      setWait(30);
      setOtpKey((k) => k + 1);
    }
  }

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div className="grid gap-5">
      <form action={action} className="grid gap-4" noValidate>
        {resendState.notice && !f.code && <Alert tone="success">{resendState.notice}</Alert>}
        {resendState.error && <Alert tone="warning">{resendState.error}</Alert>}

        <Field id="code" label="Código recebido por e-mail" error={f.code}>
          <OtpInput key={otpKey} name="code" invalid={Boolean(f.code)} autoFocus />
        </Field>

        <Field id="password" label="Nova senha" error={f.password}>
          <PasswordInput
            {...fieldControlProps("password", f.password)}
            name="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <PasswordStrength password={password} />

        <Field id="confirmPassword" label="Confirme a nova senha" error={f.confirmPassword}>
          <PasswordInput
            {...fieldControlProps("confirmPassword", f.confirmPassword)}
            name="confirmPassword"
            autoComplete="new-password"
            required
          />
        </Field>

        <Button type="submit" size="lg" className="mt-2 w-full" loading={pending}>
          Salvar nova senha
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <Link href="/esqueci-senha" className="text-muted-foreground hover:text-foreground">
          ← Outro e-mail
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

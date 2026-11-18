"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { loginAction, type FormState } from "@/server/actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const f = state.fields ?? {};

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="email" label="E-mail" error={f.email}>
        <Input
          {...fieldControlProps("email", f.email)}
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state.values?.email}
          placeholder="voce@exemplo.com"
          autoFocus
          required
        />
      </Field>

      <Field id="password" label="Senha" error={f.password}>
        <PasswordInput
          {...fieldControlProps("password", f.password)}
          name="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" className="mt-2 w-full" loading={pending}>
        {pending ? "Verificando…" : "Continuar"}
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPasswordAction, type FormState } from "@/server/actions/auth";

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPasswordAction, {});
  const f = state.fields ?? {};
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Field id="email" label="E-mail" error={f.email}>
        <Input
          {...fieldControlProps("email", f.email)}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          placeholder="voce@exemplo.com"
          autoFocus
          required
        />
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" loading={pending}>
        Enviar código
      </Button>
    </form>
  );
}

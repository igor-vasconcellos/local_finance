"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_MIN } from "@/lib/validation/auth";
import { setupAction, type FormState } from "@/server/actions/auth";

export function SetupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(setupAction, {});
  const f = state.fields ?? {};

  return (
    <form action={action} className="grid gap-4" noValidate>
      <Field id="name" label="Seu nome" error={f.name}>
        <Input
          {...fieldControlProps("name", f.name)}
          name="name"
          autoComplete="name"
          defaultValue={state.values?.name}
          placeholder="Igor Vasconcellos"
          autoFocus
          required
        />
      </Field>

      <Field id="email" label="E-mail principal" error={f.email} hint="Os códigos de verificação chegam aqui.">
        <Input
          {...fieldControlProps("email", f.email, true)}
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.values?.email}
          placeholder="voce@exemplo.com"
          required
        />
      </Field>

      <Field
        id="password"
        label="Senha"
        error={f.password}
        hint={`Mínimo de ${PASSWORD_MIN} caracteres, com letras e números.`}
      >
        <PasswordInput
          {...fieldControlProps("password", f.password, true)}
          name="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field id="confirmPassword" label="Confirme a senha" error={f.confirmPassword}>
        <PasswordInput
          {...fieldControlProps("confirmPassword", f.confirmPassword)}
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" className="mt-2 w-full" loading={pending}>
        Criar meu acesso
      </Button>
    </form>
  );
}

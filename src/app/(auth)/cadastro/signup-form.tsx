"use client";

import { useActionState, useState } from "react";
import { PasswordStrength } from "@/components/auth/password-strength";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { signupAction, type FormState } from "@/server/actions/auth";

export function SignupForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signupAction, {});
  const f = state.fields ?? {};
  const [name, setName] = useState(state.values?.name ?? "");
  const [email, setEmail] = useState(state.values?.email ?? "");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field id="name" label="Seu nome" error={f.name}>
        <Input
          {...fieldControlProps("name", f.name)}
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Maria Silva"
          autoFocus
          required
        />
      </Field>

      <Field id="email" label="E-mail" error={f.email} hint="Use um e-mail real: o código de confirmação chega nele.">
        <Input
          {...fieldControlProps("email", f.email, true)}
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@exemplo.com"
          required
        />
      </Field>

      <Field id="password" label="Senha" error={f.password}>
        <PasswordInput
          {...fieldControlProps("password", f.password, true)}
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      <PasswordStrength password={password} name={name} email={email} />

      <Field id="confirmPassword" label="Confirme a senha" error={f.confirmPassword}>
        <PasswordInput
          {...fieldControlProps("confirmPassword", f.confirmPassword)}
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" className="mt-2 w-full" loading={pending}>
        Criar conta
      </Button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { updatePassword } from "@/features/auth/actions";
import {
  AuthCard,
  Field,
  FormMessage,
  SubmitButton,
} from "@/components/auth/auth-ui";

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(updatePassword, { ok: false });

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Use at least 8 characters."
    >
      <form action={formAction} className="space-y-4">
        {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <Field
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
        />
        <SubmitButton>Update password</SubmitButton>
      </form>
    </AuthCard>
  );
}

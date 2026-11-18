"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/features/auth/actions";
import {
  AuthCard,
  Field,
  FormMessage,
  SubmitButton,
} from "@/components/auth/auth-ui";

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordReset, {
    ok: false,
  });

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email you a link to choose a new password."
    >
      <form action={formAction} className="space-y-4">
        {state.ok && state.message && (
          <FormMessage kind="success">{state.message}</FormMessage>
        )}
        {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <SubmitButton>Send reset link</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-[#667389]">
        Remembered it?{" "}
        <Link
          href="/auth/login"
          className="font-medium text-[#3159c9] hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}

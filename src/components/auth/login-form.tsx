"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/features/auth/actions";
import {
  AuthCard,
  Field,
  FormMessage,
  SubmitButton,
} from "@/components/auth/auth-ui";

export function LoginForm({ callbackError }: { callbackError: boolean }) {
  const [state, formAction] = useActionState(signIn, { ok: false });

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your Forma Office workspace."
    >
      <form action={formAction} className="space-y-4">
        {callbackError && (
          <FormMessage kind="error">
            That sign-in link did not work. Try signing in again.
          </FormMessage>
        )}
        {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
        />
        <SubmitButton>Sign in</SubmitButton>
      </form>
      <div className="mt-6 flex items-center justify-between text-sm">
        <Link
          href="/auth/signup"
          className="font-medium text-[#3159c9] hover:underline"
        >
          Create an account
        </Link>
        <Link
          href="/auth/reset-password"
          className="text-[#667389] hover:underline"
        >
          Forgot password?
        </Link>
      </div>
    </AuthCard>
  );
}

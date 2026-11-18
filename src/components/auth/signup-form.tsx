"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/features/auth/actions";
import {
  AuthCard,
  Field,
  FormMessage,
  SubmitButton,
} from "@/components/auth/auth-ui";

export function SignUpForm() {
  const [state, formAction] = useActionState(signUp, { ok: false });

  if (state.ok && state.needsConfirmation) {
    return (
      <AuthCard title="Check your email" subtitle="One last step.">
        <FormMessage kind="success">{state.message}</FormMessage>
        <p className="mt-4 text-sm text-[#667389]">
          After confirming,{" "}
          <Link
            href="/auth/login"
            className="font-medium text-[#3159c9] hover:underline"
          >
            sign in
          </Link>{" "}
          to open your workspace.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Your personal workspace is created automatically."
    >
      <form action={formAction} className="space-y-4">
        {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
        <Field
          label="Your name"
          name="displayName"
          autoComplete="name"
          placeholder="Muhammad Anas"
        />
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
        <SubmitButton>Create account</SubmitButton>
      </form>
      <p className="mt-6 text-sm text-[#667389]">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-medium text-[#3159c9] hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

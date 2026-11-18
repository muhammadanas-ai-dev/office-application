"use client";

import { useActionState } from "react";
import { updateProfile } from "@/features/auth/actions";
import { Field, FormMessage, SubmitButton } from "@/components/auth/auth-ui";

export function ProfileForm({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  const [state, formAction] = useActionState(updateProfile, { ok: false });

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state.ok && state.message && (
        <FormMessage kind="success">{state.message}</FormMessage>
      )}
      {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
      <div>
        <label className="mb-1 block text-sm font-medium text-[#1d2733]">
          Email
        </label>
        <input
          type="email"
          value={email}
          disabled
          aria-label="Email (cannot be changed here)"
          className="w-full rounded-lg border border-[#dce3ec] bg-[#f4f6fa] px-3 py-2 text-sm text-[#667389]"
        />
        <p className="mt-1 text-xs text-[#667389]">
          Email changes are not available yet.
        </p>
      </div>
      <Field
        label="Your name"
        name="displayName"
        autoComplete="name"
        defaultValue={displayName}
      />
      <div>
        <SubmitButton>Save profile</SubmitButton>
      </div>
    </form>
  );
}

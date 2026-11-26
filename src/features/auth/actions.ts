// Auth server actions. Every action is an untrusted entry point:
// inputs are validated with Zod, identity comes from the session
// (never from the client), and errors returned to the browser are
// generic — the real message is logged server-side only.
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  AUTH_RATE_LIMIT_MESSAGE,
  checkAuthAttempt,
  clearAuthAttempts,
} from "@/lib/auth-rate-limit";
import { logError } from "@/lib/log";
import { getPublicEnv } from "@/lib/env";
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  updateAppearanceSchema,
  updatePreferencesSchema,
  updateProfileSchema,
} from "@/features/auth/schemas";
import { ensureProfileAndWorkspace } from "@/features/auth/provision";

export type AuthActionState = {
  ok: boolean;
  error?: string;
  message?: string;
  /** Sign-up succeeded but email confirmation is still required. */
  needsConfirmation?: boolean;
};

const initialState: AuthActionState = { ok: false };

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function validationError(issues: { message: string }[]): AuthActionState {
  return {
    ok: false,
    error: issues[0]?.message ?? "Check the form and try again.",
  };
}

function appUrl(): string {
  return getPublicEnv().NEXT_PUBLIC_APP_URL;
}

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  // Rate-limit sign-in attempts per email (Day 27 hardening).
  // A blocked attempt never reaches Supabase Auth.
  const attempt = checkAuthAttempt(parsed.data.email, "sign-in");
  if (!attempt.allowed) {
    return { ok: false, error: AUTH_RATE_LIMIT_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    logError("auth.signIn", error?.message ?? "Sign-in failed");
    return { ok: false, error: "Email or password is incorrect." };
  }

  // A successful sign-in clears the earlier failures for this
  // email, so a user who eventually remembers their password
  // is not locked out by their own mistypes.
  clearAuthAttempts(parsed.data.email, "sign-in");

  // Provisioning is idempotent; if it fails here the next sign-in or
  // the auth callback retries it. The session itself is valid.
  try {
    await ensureProfileAndWorkspace(
      data.user.id,
      (data.user.user_metadata?.display_name as string | undefined) ?? null
    );
  } catch (provisionError) {
    logError("auth.provision", provisionError);
  }

  revalidatePath("/home");
  redirect("/home");
  return initialState;
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    displayName: formString(formData, "displayName"),
    email: formString(formData, "email"),
    password: formString(formData, "password"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  // Rate-limit sign-up attempts per email (Day 27 hardening).
  // A blocked attempt never reaches Supabase Auth.
  const attempt = checkAuthAttempt(parsed.data.email, "sign-up");
  if (!attempt.allowed) {
    return { ok: false, error: AUTH_RATE_LIMIT_MESSAGE };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${appUrl()}/auth/callback`,
    },
  });
  if (error || !data.user) {
    logError("auth.signUp", error?.message ?? "Sign-up failed");
    return { ok: false, error: "Could not create your account. Try again." };
  }

  // Supabase returns an empty identities list when the email is
  // already registered (with confirmation emails enabled).
  if (data.user.identities && data.user.identities.length === 0) {
    return {
      ok: false,
      error: "An account with this email already exists. Sign in instead.",
    };
  }

  // Email confirmation disabled: a session exists right away.
  if (data.session) {
    try {
      await ensureProfileAndWorkspace(data.user.id, parsed.data.displayName);
    } catch (provisionError) {
      logError("auth.provision", provisionError);
    }
    revalidatePath("/home");
    redirect("/home");
    return initialState;
  }

  return {
    ok: true,
    needsConfirmation: true,
    message: "Check your email for the confirmation link, then sign in.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/");
  redirect("/");
}

export async function requestPasswordReset(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = resetRequestSchema.safeParse({
    email: formString(formData, "email"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${appUrl()}/auth/callback?next=/auth/update-password`,
    }
  );
  if (error) {
    // Deliberately the same reply either way: do not reveal whether
    // the email belongs to an account.
    logError("auth.resetRequest", error.message);
  }
  return {
    ok: true,
    message: "If an account uses this email, a reset link is on its way.",
  };
}

export async function updatePassword(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formString(formData, "password"),
    confirmPassword: formString(formData, "confirmPassword"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    logError("auth.updatePassword", error.message);
    return { ok: false, error: "Could not update your password. Try again." };
  }

  revalidatePath("/home");
  redirect("/home");
  return initialState;
}

export async function updateProfile(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = updateProfileSchema.safeParse({
    displayName: formString(formData, "displayName"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  // RLS allows the user to update only their own profile row.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);
  if (error) {
    logError("auth.updateProfile", error.message);
    return { ok: false, error: "Could not save your profile. Try again." };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Profile saved." };
}

/**
 * Save the user's preferences (Day 24). The three columns live
 * on the profiles table; RLS allows the user to update only
 * their own row. If the Day 24 migration has not been applied
 * yet, the update fails with PGRST204 (the column does not
 * exist) — that returns a clear message instead of a cryptic
 * failure.
 */
export async function updatePreferences(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = updatePreferencesSchema.safeParse({
    ocrLanguage: formString(formData, "ocrLanguage"),
    imageExportFormat: formString(formData, "imageExportFormat"),
    imageExportDpi: formString(formData, "imageExportDpi"),
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      ocr_language: parsed.data.ocrLanguage,
      image_export_format: parsed.data.imageExportFormat,
      image_export_dpi: parsed.data.imageExportDpi,
    })
    .eq("id", user.id);
  if (error) {
    logError("auth.updatePreferences", error.message);
    // A missing preference column means the Day 24 migration
    // has not been applied yet (PGRST204, or 42703 when the
    // schema cache is stale).
    if (error.code === "PGRST204" || error.code === "42703") {
      return {
        ok: false,
        error:
          "Preferences are not set up yet — run forma-preferences-migration.sql in the Supabase Dashboard SQL Editor, then try again.",
      };
    }
    return { ok: false, error: "Could not save your preferences. Try again." };
  }

  revalidatePath("/settings");
  return { ok: true, message: "Preferences saved." };
}

export async function updateAppearance(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const parsed = updateAppearanceSchema.safeParse({
    theme: formString(formData, "theme"),
    locale: formString(formData, "locale"),
    dateFormat: formString(formData, "dateFormat"),
    numberFormat: formString(formData, "numberFormat"),
    reduceMotion: formData.get("reduceMotion") === "on",
    largerText: formData.get("largerText") === "on",
    highContrast: formData.get("highContrast") === "on",
  });
  if (!parsed.success) return validationError(parsed.error.issues);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      theme: parsed.data.theme,
      locale: parsed.data.locale,
      date_format: parsed.data.dateFormat,
      number_format: parsed.data.numberFormat,
      reduce_motion: parsed.data.reduceMotion,
      larger_text: parsed.data.largerText,
      high_contrast: parsed.data.highContrast,
    })
    .eq("id", user.id);
  if (error) {
    logError("auth.updateAppearance", error.message);
    if (error.code === "PGRST204" || error.code === "42703") {
      return {
        ok: false,
        error:
          "Appearance settings are not set up yet — they arrive with the combined SQL file (forma-checklist-completion-migrations.sql) in the Supabase Dashboard SQL Editor.",
      };
    }
    return { ok: false, error: "Could not save your settings. Try again." };
  }

  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true, message: "Appearance saved — it applies right away." };
}

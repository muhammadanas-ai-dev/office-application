import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PreferencesForm } from "@/components/auth/preferences-form";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRound } from "lucide-react";
import { withDefaultPreferences } from "@/lib/preferences";

export const metadata: Metadata = { title: "Settings — Forma Office" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // The proxy normally redirects here; this is the fallback.
    redirect("/auth/login?next=/settings");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name, ocr_language, image_export_format, image_export_dpi")
    .eq("id", user.id)
    .single();

  // A missing preference column means the Day 24 migration has
  // not been applied yet. PostgREST reports it as PGRST204
  // (column not in the schema) or 42703 (Postgres
  // undefined_column, when the schema cache is stale). Either
  // way, fall back to just the display name (the profile form
  // still works) and show the defaults + a notice in the
  // preferences form.
  const migrationMissing =
    error?.code === "PGRST204" || error?.code === "42703";
  let displayName = profile?.display_name ?? "";
  let hasProfile = profile !== null;
  let migrationApplied = !migrationMissing;
  let preferences = withDefaultPreferences({
    ocrLanguage: profile?.ocr_language,
    imageExportFormat: profile?.image_export_format,
    imageExportDpi: profile?.image_export_dpi,
  });
  if (migrationMissing) {
    const { data: basic } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    displayName = basic?.display_name ?? "";
    hasProfile = basic !== null;
    migrationApplied = false;
    preferences = withDefaultPreferences({});
  }

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-10">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-[#667389]">
        Your profile and preferences.
      </p>
      <div className="mt-8">
        {hasProfile ? (
          <ProfileForm email={user.email ?? ""} displayName={displayName} />
        ) : (
          <EmptyState
            icon={UserRound}
            title="Profile not ready yet"
            description="Your profile is created when you sign in. Sign out and sign in again, or try refreshing."
          />
        )}
      </div>
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <p className="mt-1 text-sm text-[#667389]">
          Defaults for OCR and image export. They apply the next time you open
          those pages.
        </p>
        <div className="mt-4">
          <PreferencesForm
            preferences={preferences}
            migrationApplied={migrationApplied}
          />
        </div>
      </div>
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-[#667389]">
          What Forma Office stores, where it is stored, and which services
          process your documents.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/privacy" className="text-[#3159c9] underline">
            Read the privacy disclosure
          </Link>
        </p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/auth/profile-form";
import { PreferencesForm } from "@/components/auth/preferences-form";
import { AppearanceForm } from "@/components/auth/appearance-form";
import { FontsManager } from "@/components/settings/fonts-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { UserRound } from "lucide-react";
import {
  withDefaultAppearance,
  withDefaultPreferences,
} from "@/lib/preferences";

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

  // Appearance preferences (F32) — a separate query so this
  // migration's state is independent of Day 24's.
  const { data: appearanceRow, error: appearanceError } = await supabase
    .from("profiles")
    .select(
      "theme, locale, date_format, number_format, reduce_motion, larger_text, high_contrast"
    )
    .eq("id", user.id)
    .maybeSingle();
  const appearanceMigrationApplied = !(
    appearanceError?.code === "PGRST204" || appearanceError?.code === "42703"
  );
  const appearance = withDefaultAppearance({
    theme: appearanceRow?.theme,
    locale: appearanceRow?.locale,
    dateFormat: appearanceRow?.date_format,
    numberFormat: appearanceRow?.number_format,
    reduceMotion: appearanceRow?.reduce_motion,
    largerText: appearanceRow?.larger_text,
    highContrast: appearanceRow?.high_contrast,
  });

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
        <h2 className="text-lg font-semibold">Appearance &amp; language</h2>
        <p className="mt-1 text-sm text-[#667389]">
          Theme, language, date and number formats, and accessibility
          options. They apply across your workspace right away.
        </p>
        <div className="mt-4">
          <AppearanceForm
            appearance={appearance}
            migrationApplied={appearanceMigrationApplied}
          />
        </div>
      </div>
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Your fonts</h2>
        <p className="mt-1 text-sm text-[#667389]">
          Fonts you upload for Forma&apos;s PDF tools — they appear in the
          Draw page&apos;s Add-text picker, favourites first, then most
          recently used.
        </p>
        <div className="mt-4">
          <FontsManager />
        </div>
      </div>
      <div className="mt-10">
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <p className="mt-1 text-sm text-[#667389]">
          The shortcuts Forma and the PDF tools respond to. Editing
          shortcuts inside a document follow the editor&apos;s own list.
        </p>
        <dl className="mt-4 max-w-md space-y-2 text-sm">
          {[
            ["Ctrl / ⌘ + S", "Save (in the editor, saves a new version)"],
            ["Ctrl / ⌘ + P", "Print — from a PDF's Print page"],
            ["Ctrl / ⌘ + F", "Find — in the Annotate page, the search box"],
            ["Page Up / Page Down", "Move between pages in the viewer"],
            ["+ / −", "Zoom in and out in the viewer"],
            ["Esc", "Close dialogs and menus"],
          ].map(([keys, action]) => (
            <div key={keys} className="flex gap-3">
              <dt className="w-44 shrink-0">
                <kbd className="rounded border border-[#dce3ec] bg-white px-1.5 py-0.5 font-mono text-xs">
                  {keys}
                </kbd>
              </dt>
              <dd className="text-[#667389]">{action}</dd>
            </div>
          ))}
        </dl>
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

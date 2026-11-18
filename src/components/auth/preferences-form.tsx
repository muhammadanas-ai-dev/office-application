// Preferences form (Day 24).
//
// The three per-user preferences, saved by the
// updatePreferences server action (the updateProfile pattern):
// the OCR page's default language, the library "Export images"
// link's default format, and its default DPI.
"use client";

import { useActionState } from "react";
import { updatePreferences } from "@/features/auth/actions";
import { FormMessage, SubmitButton } from "@/components/auth/auth-ui";
import type { UserPreferences } from "@/lib/preferences";

function SelectField({
  label,
  name,
  defaultValue,
  options,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  hint?: string;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1 block text-sm font-medium text-[#1d2733]"
      >
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-[#dce3ec] bg-white px-3 py-2 text-sm text-[#1d2733] outline-none focus:border-[#3159c9]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="mt-1 text-xs text-[#667389]">{hint}</p> : null}
    </div>
  );
}

export function PreferencesForm({
  preferences,
  migrationApplied,
}: {
  preferences: UserPreferences;
  /** False when the Day 24 migration has not been applied yet. */
  migrationApplied: boolean;
}) {
  const [state, formAction] = useActionState(updatePreferences, {
    ok: false,
  });

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {state.ok && state.message && (
        <FormMessage kind="success">{state.message}</FormMessage>
      )}
      {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
      {!migrationApplied ? (
        <FormMessage kind="error">
          Preferences are not set up yet — run forma-preferences-migration.sql
          in the Supabase Dashboard SQL Editor, then reload this page. The
          values below are the defaults.
        </FormMessage>
      ) : null}
      <SelectField
        label="OCR default language"
        name="ocrLanguage"
        defaultValue={preferences.ocrLanguage}
        options={[
          { value: "eng", label: "English" },
          { value: "urd", label: "Urdu" },
          { value: "ara", label: "Arabic" },
        ]}
        hint="The language the OCR page starts with."
      />
      <SelectField
        label="Image export format"
        name="imageExportFormat"
        defaultValue={preferences.imageExportFormat}
        options={[
          { value: "png", label: "PNG" },
          { value: "jpg", label: "JPG" },
        ]}
        hint="What the library “Export images” link downloads."
      />
      <SelectField
        label="Image export DPI"
        name="imageExportDpi"
        defaultValue={String(preferences.imageExportDpi)}
        options={[
          { value: "72", label: "72 DPI (small files)" },
          { value: "150", label: "150 DPI" },
          { value: "300", label: "300 DPI (best quality)" },
        ]}
        hint="The resolution the library “Export images” link renders at."
      />
      <div>
        <SubmitButton>Save preferences</SubmitButton>
      </div>
    </form>
  );
}

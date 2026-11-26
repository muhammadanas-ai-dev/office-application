// Appearance form (F32).
//
// Theme, language, date/number formats and the three
// accessibility switches, saved by the updateAppearance
// server action. On a successful save the <html> classes
// are updated immediately from the form's own values, so
// the change is visible without a reload; the workspace
// layout's bootstrap script reapplies them on every load.
"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateAppearance } from "@/features/auth/actions";
import { FormMessage, SubmitButton } from "@/components/auth/auth-ui";
import {
  appearanceHtmlClasses,
  withDefaultAppearance,
  type AppearancePreferences,
} from "@/lib/appearance";

const APPEARANCE_CLASSES = [
  "forma-dark",
  "forma-theme-system",
  "forma-larger-text",
  "forma-reduce-motion",
  "forma-high-contrast",
];

function applyFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const prefs = withDefaultAppearance({
    theme: data.get("theme"),
    locale: data.get("locale"),
    dateFormat: data.get("dateFormat"),
    numberFormat: data.get("numberFormat"),
    reduceMotion: data.get("reduceMotion") === "on",
    largerText: data.get("largerText") === "on",
    highContrast: data.get("highContrast") === "on",
  });
  const root = document.documentElement;
  for (const name of APPEARANCE_CLASSES) root.classList.remove(name);
  for (const name of appearanceHtmlClasses(prefs)) root.classList.add(name);
  root.lang = prefs.locale;
}

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

function CheckField({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked: boolean;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5"
      />
      <span>
        <span className="block text-sm font-medium text-[#1d2733]">
          {label}
        </span>
        <span className="block text-xs text-[#667389]">{hint}</span>
      </span>
    </label>
  );
}

export function AppearanceForm({
  appearance,
  migrationApplied,
}: {
  appearance: AppearancePreferences;
  migrationApplied: boolean;
}) {
  const [state, formAction] = useActionState(updateAppearance, {
    ok: false,
  });
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state.ok && formRef.current) applyFromForm(formRef.current);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="max-w-md space-y-4">
      {state.ok && state.message && (
        <FormMessage kind="success">{state.message}</FormMessage>
      )}
      {state.error && <FormMessage kind="error">{state.error}</FormMessage>}
      {!migrationApplied ? (
        <FormMessage kind="error">
          Appearance settings are not set up yet — they arrive with the
          combined SQL file for this update. The values below are the
          defaults.
        </FormMessage>
      ) : null}
      <SelectField
        label="Theme"
        name="theme"
        defaultValue={appearance.theme}
        options={[
          { value: "system", label: "Match my system" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        hint="Dark remaps Forma's own colours. The document editor keeps its own theme."
      />
      <SelectField
        label="Language"
        name="locale"
        defaultValue={appearance.locale}
        options={[
          { value: "en-GB", label: "English (UK)" },
          { value: "en-US", label: "English (US)" },
          { value: "ur-PK", label: "Urdu (Pakistan)" },
        ]}
        hint="Used for dates and the page language. Full interface translation is a later step."
      />
      <SelectField
        label="Date format"
        name="dateFormat"
        defaultValue={appearance.dateFormat}
        options={[
          { value: "dmy", label: "Day first — 26 Nov 2026" },
          { value: "mdy", label: "Month first — Nov 26, 2026" },
          { value: "ymd", label: "ISO — 2026-11-26" },
        ]}
      />
      <SelectField
        label="Number format"
        name="numberFormat"
        defaultValue={appearance.numberFormat}
        options={[
          { value: "comma-dot", label: "1,234.56" },
          { value: "dot-comma", label: "1.234,56" },
          { value: "space-comma", label: "1 234,56" },
        ]}
      />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-[#1d2733]">
          Accessibility
        </legend>
        <CheckField
          label="Reduce motion"
          name="reduceMotion"
          defaultChecked={appearance.reduceMotion}
          hint="Turns off animation and smooth scrolling across Forma."
        />
        <CheckField
          label="Larger text"
          name="largerText"
          defaultChecked={appearance.largerText}
          hint="Scales the whole interface up a step."
        />
        <CheckField
          label="High contrast"
          name="highContrast"
          defaultChecked={appearance.highContrast}
          hint="Stronger text and border colours."
        />
      </fieldset>
      <SubmitButton>Save appearance</SubmitButton>
    </form>
  );
}

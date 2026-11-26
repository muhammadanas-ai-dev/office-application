// Workspace layout: the app shell plus the appearance
// bootstrap (F32). The user's appearance preferences are
// read server-side and a tiny inline script puts the
// matching classes on <html> before the shell paints, so
// the dark theme / larger text / reduced motion apply
// without a flash. When the appearance migration has not
// been run yet, the defaults apply.
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import {
  appearanceHtmlClasses,
  withDefaultAppearance,
  type AppearancePreferences,
} from "@/lib/preferences";

async function loadAppearance(): Promise<AppearancePreferences> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return withDefaultAppearance({});
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "theme, locale, date_format, number_format, reduce_motion, larger_text, high_contrast"
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return withDefaultAppearance({});
    return withDefaultAppearance({
      theme: profile.theme,
      locale: profile.locale,
      dateFormat: profile.date_format,
      numberFormat: profile.number_format,
      reduceMotion: profile.reduce_motion,
      largerText: profile.larger_text,
      highContrast: profile.high_contrast,
    });
  } catch {
    return withDefaultAppearance({});
  }
}

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const appearance = await loadAppearance();
  const classes = appearanceHtmlClasses(appearance);
  const script = `(function(){try{var e=document.documentElement;${JSON.stringify(
    classes
  )}.forEach(function(c){e.classList.add(c)});e.lang=${JSON.stringify(
    appearance.locale
  )};}catch(_){}})();`;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: script }} />
      <AppShell>{children}</AppShell>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/features/auth/actions";

/**
 * Header identity: shows the signed-in user's initial + sign-out, or a
 * Sign in link. The session is read with the browser client; the
 * proxy is the real gate — this menu is display only.
 */
export function UserMenu() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        if (!cancelled) setEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (email === undefined) {
    return (
      <span className="hidden h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm md:inline-flex">
        …
      </span>
    );
  }

  if (email === null) {
    return (
      <Link
        href="/auth/login"
        className="hidden h-9 items-center rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f4f6fa] md:inline-flex"
      >
        Sign in
      </Link>
    );
  }

  const initial = email.charAt(0).toUpperCase();
  return (
    <span className="flex items-center gap-2">
      <span
        title={email}
        aria-label={`Signed in as ${email}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3159c9] text-sm font-semibold text-white"
      >
        {initial}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          title={`Sign out (${email})`}
          aria-label={`Sign out (${email})`}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-[#dce3ec] bg-white px-3 text-sm font-medium text-[#202b3c] hover:bg-[#f4f6fa]"
        >
          <LogOut size={15} aria-hidden="true" />
          Sign out
        </button>
      </form>
    </span>
  );
}

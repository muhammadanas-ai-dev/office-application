import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in — Forma Office",
  description: "Sign in to your Forma Office workspace.",
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-4 py-12">
      {children}
    </main>
  );
}

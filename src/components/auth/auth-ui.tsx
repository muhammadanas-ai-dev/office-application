"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { FormaLogo } from "@/components/brand/forma-logo";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-8 flex justify-center">
        <FormaLogo />
      </div>
      <div className="rounded-2xl border border-[#dce3ec] bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-[#667389]">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  placeholder,
  defaultValue,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1 block text-sm font-medium text-[#1d2733]"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-lg border border-[#dce3ec] bg-white px-3 py-2 text-sm text-[#1d2733] outline-none placeholder:text-[#9aa5b1] focus:border-[#3159c9] focus:ring-2 focus:ring-[#3159c9]/20"
      />
    </div>
  );
}

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-[#3159c9] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#2548a5] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Please wait…" : children}
    </button>
  );
}

export function FormMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "rounded-lg border border-[#f5c6c6] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8f1d1d]"
          : "rounded-lg border border-[#bfe3c6] bg-[#f0f9f1] px-3 py-2 text-sm text-[#1d5c2e]"
      }
    >
      {children}
    </p>
  );
}

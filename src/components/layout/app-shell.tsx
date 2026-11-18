"use client";

import {
  Clock,
  CreditCard,
  FileImage,
  FolderOpen,
  Home,
  LayoutTemplate,
  Menu,
  Plus,
  Settings,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { FormaLogo } from "@/components/brand/forma-logo";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/recent", label: "Recent", icon: Clock },
  { href: "/files", label: "My files", icon: FolderOpen },
  { href: "/shared", label: "Shared with me", icon: Users },
  { href: "/starred", label: "Starred", icon: Star },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/images-to-pdf", label: "Images to PDF", icon: FileImage },
  { href: "/trash", label: "Trash", icon: Trash2 },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/plan", label: "Plan and usage", icon: CreditCard },
] as const;

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace" className="flex flex-col gap-1 px-3 py-4">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]",
              active
                ? "bg-[#edf1f6] font-semibold text-[#17253b]"
                : "text-[#667389] hover:bg-[#f4f6fa] hover:text-[#202b3c]"
            )}
          >
            <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col border-r border-[#dce3ec] bg-white">
      <div className="flex items-center justify-between px-4 py-4">
        <Link
          href="/"
          aria-label="Forma Office home"
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9]"
        >
          <FormaLogo />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav onNavigate={onNavigate} />
      </div>
      <div className="border-t border-[#dce3ec] px-4 py-3">
        <p className="text-xs text-[#667389]">
          Forma Office · day-04 shell
          <br />
          Library is live; the editor lands Day 5.
        </p>
      </div>
    </div>
  );
}

/**
 * Authenticated-shell placeholder (Day 2). Every nav item links to a real
 * page; pages that are not built yet say so honestly instead of faking
 * content. No editor controls exist in this shell.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#f4f6fa] font-sans text-[#202b3c]">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block" aria-label="Sidebar">
        <div className="fixed inset-y-0 w-64">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Workspace navigation"
        >
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-[#17253b]/40"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-lg bg-white p-1.5 text-[#667389]"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[#dce3ec] bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-[#667389] hover:bg-[#f4f6fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] lg:hidden"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <form
            method="get"
            action="/files"
            className="flex min-w-0 flex-1 sm:max-w-sm"
            role="search"
          >
            <label className="sr-only" htmlFor="workspace-search">
              Search your documents
            </label>
            <input
              id="workspace-search"
              name="q"
              type="search"
              placeholder="Search your documents"
              className="h-9 min-w-0 flex-1 rounded-lg border border-[#dce3ec] bg-[#f4f6fa] px-3 text-sm placeholder:text-[#667389]"
            />
          </form>
          <Link
            href="/files"
            className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#3159c9] px-3 text-sm font-medium text-white hover:bg-[#2a4cab] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3159c9] sm:px-4"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Create a document</span>
            <span className="sm:hidden">Create</span>
          </Link>
          <UserMenu />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

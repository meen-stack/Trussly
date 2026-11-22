"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle, BarChart3, Bell, Camera, CheckSquare, ClipboardList, FileSignature, FolderKanban, GitPullRequestArrow,
  GraduationCap, HardHat, History, LayoutDashboard, LogOut, Menu, MessageCircle, Package, Settings, Users, Wallet, X,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { TourButton } from "./tour";
import { cn } from "./ui";

type Counts = { approvals: number; unread: number; messages: number };
type Icon = typeof LayoutDashboard;

const MAIN: { href: string; label: string; Icon: Icon; count?: keyof Counts; only?: "finance" | "analytics" }[] = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/projects", label: "Projects", Icon: FolderKanban },
  { href: "/approvals", label: "Approvals", Icon: CheckSquare, count: "approvals" },
  { href: "/messages", label: "Messages", Icon: MessageCircle, count: "messages" },
  { href: "/finance", label: "Finance", Icon: Wallet, only: "finance" },
  { href: "/analytics", label: "Analytics", Icon: BarChart3, only: "analytics" },
  { href: "/notifications", label: "Notifications", Icon: Bell, count: "unread" },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/settings", label: "Settings", Icon: Settings },
];

/** Every section of a project, listed while you're inside one. */
const PROJECT: [string, string, Icon][] = [
  ["", "Overview", LayoutDashboard],
  ["/reports", "Daily reports", ClipboardList],
  ["/milestones", "Work", HardHat],
  ["/changes", "Change orders", GitPullRequestArrow],
  ["/budget", "Budget & spend", Wallet],
  ["/materials", "Materials", Package],
  ["/documents", "Documents", FileSignature],
  ["/photos", "Photos", Camera],
  ["/disputes", "Disputes", AlertTriangle],
  ["/team", "Team", Users],
  ["/activity", "Audit trail", History],
];

const Count = ({ n }: { n: number }) => (n > 0 ? <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-ink">{n > 99 ? "99+" : n}</span> : null);

/** Phone navigation: a ☰ button that opens a menu with every feature. */
export function MobileMenu({ counts, finance, analytics, projectName }: { counts: Counts; finance: boolean; analytics: boolean; projectName?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const total = counts.approvals + counts.unread + counts.messages;
  const projectBase = pathname.match(/^\/projects\/(?!new$)[^/]+/)?.[0];
  const items = MAIN.filter((i) => (i.only === "finance" ? finance : i.only === "analytics" ? analytics : true));
  const row = (active: boolean) => cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium", active ? "bg-white/10 text-white" : "text-white/70 active:bg-white/5");

  return (
    <>
      <button onClick={() => setOpen(true)} className="relative rounded-lg p-2 text-white" aria-label="Open menu" aria-expanded={open}>
        <Menu className="h-6 w-6" />
        {total > 0 && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-steel" />}
      </button>

      <div className={cn("fixed inset-0 z-50 lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
        <button aria-label="Close menu" tabIndex={-1} onClick={close} className={cn("absolute inset-0 bg-black/50 transition-opacity", open ? "opacity-100" : "opacity-0")} />
        <aside
          className={cn(
            "absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-steel pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-200",
            open ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-display font-semibold text-white">Menu</span>
            <button onClick={close} className="rounded-lg p-2 text-white/70" aria-label="Close menu" tabIndex={open ? 0 : -1}>
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-4">
            <nav className="space-y-0.5">
              {items.map(({ href, label, Icon, count }) => (
                <Link key={href} href={href} onClick={close} tabIndex={open ? 0 : -1} className={row(pathname === href || (pathname.startsWith(href + "/") && !(href === "/projects" && projectBase)))}>
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{label}</span>
                  {count && <Count n={counts[count]} />}
                </Link>
              ))}
            </nav>
            {projectBase && (
              <>
                <p className="mt-5 mb-1.5 truncate px-3 text-xs font-semibold tracking-wide text-brand uppercase">{projectName ?? "This project"}</p>
                <nav className="space-y-0.5">
                  {PROJECT.map(([suffix, label, Icon]) => {
                    const href = projectBase + suffix;
                    return (
                      <Link key={suffix} href={href} onClick={close} tabIndex={open ? 0 : -1} className={row(suffix === "" ? pathname === projectBase : pathname.startsWith(href))}>
                        <Icon className="h-5 w-5 shrink-0" />
                        {label}
                      </Link>
                    );
                  })}
                </nav>
              </>
            )}
          </div>
          <div className="border-t border-white/10 p-3 pb-0">
            <TourButton onClick={close} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70">
              <GraduationCap className="h-5 w-5" /> Tutorial
            </TourButton>
          </div>
          <form action={logout} className="p-3 pt-0">
            <button tabIndex={open ? 0 : -1} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70">
              <LogOut className="h-5 w-5" /> Log out
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}

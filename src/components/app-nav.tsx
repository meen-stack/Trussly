"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CheckSquare, FolderKanban, LayoutDashboard, Settings, Users } from "lucide-react";
import { cn } from "./ui";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/projects", label: "Projects", Icon: FolderKanban },
  { href: "/approvals", label: "Approvals", Icon: CheckSquare, countKey: "approvals" },
  { href: "/notifications", label: "Notifications", Icon: Bell, countKey: "unread" },
  { href: "/team", label: "Team", Icon: Users },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;

export function AppNav({ counts, mobile = false }: { counts: { approvals: number; unread: number }; mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={mobile ? "flex gap-1 overflow-x-auto px-4 pb-3" : "space-y-1"}>
      {ITEMS.map(({ href, label, Icon, ...rest }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        const count = "countKey" in rest ? counts[rest.countKey] : 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className={mobile ? "" : "flex-1"}>{label}</span>
            {count > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-white">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

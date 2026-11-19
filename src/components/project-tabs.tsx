"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const TABS = [
  ["", "Overview"],
  ["/reports", "Daily reports"],
  ["/milestones", "Milestones"],
  ["/budget", "Budget & spend"],
  ["/photos", "Photos"],
  ["/team", "Team"],
  ["/activity", "Audit trail"],
] as const;

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  return (
    <div className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <nav className="flex gap-1">
        {TABS.map(([suffix, label]) => {
          const href = base + suffix;
          const active = suffix === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={suffix}
              href={href}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

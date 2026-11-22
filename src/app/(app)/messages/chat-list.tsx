import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Building2, HardHat, Users } from "lucide-react";
import type { chatList } from "@/lib/messages";
import { cn } from "@/components/ui";

type Chat = Awaited<ReturnType<typeof chatList>>[number];

const ICON = { company: Building2, project: HardHat, group: Users };
const KIND = {
  company: "Everyone",
  project: "Project",
  group: "Group",
  direct: "",
};

export function ChatList({ chats, activeId, me }: { chats: Chat[]; activeId?: string; me: string }) {
  return (
    <ul className="divide-y divide-line">
      {chats.map((c) => {
        const Icon = c.kind === "direct" ? null : ICON[c.kind];
        const initials = c.name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("");
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-bg", c.id === activeId && "bg-brand-soft")}>
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  c.kind === "direct" ? "bg-brand-soft text-brand-text" : "bg-steel text-white",
                )}
              >
                {Icon ? <Icon className="h-4 w-4" /> : initials}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.name}</span>
                  {c.last && <span className="shrink-0 text-[11px] text-muted">{formatDistanceToNowStrict(c.last.createdAt)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">
                    {KIND[c.kind] && <span className="mr-1 font-medium">{KIND[c.kind]} ·</span>}
                    {c.last ? `${c.last.authorId === me ? "You" : c.last.author.name.split(" ")[0]}: ${c.last.body}` : "No messages yet"}
                  </span>
                  {c.unread > 0 && <span className="shrink-0 rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-ink">{c.unread}</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

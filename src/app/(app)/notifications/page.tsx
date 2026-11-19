import Link from "next/link";
import type { Metadata } from "next";
import { formatDistanceToNow } from "date-fns";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { markAllRead, markRead } from "@/app/actions/account";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're up to date"}
        action={
          unread > 0 && (
            <form action={markAllRead}>
              <Button variant="secondary">Mark all read</Button>
            </form>
          )
        }
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No notifications yet" />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={cn("flex gap-3 px-5 py-4", !n.readAt && "bg-brand-soft/50")}>
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-brand")} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted">{n.body}</p>
                  <div className="mt-1 flex gap-3 text-xs text-muted">
                    <span>{formatDistanceToNow(n.createdAt, { addSuffix: true })}</span>
                    {n.href && (
                      <Link href={n.href} className="text-brand hover:underline">
                        Open
                      </Link>
                    )}
                    {!n.readAt && (
                      <form action={markRead.bind(null, n.id)}>
                        <button className="hover:text-ink">Mark read</button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

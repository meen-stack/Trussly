import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";
import { approvalCount } from "@/lib/queues";
import { logout } from "@/app/actions/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [approvals, unread] = await Promise.all([
    approvalCount(user),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const counts = { approvals, unread };
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  const userBlock = (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">{initials}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-white/55">
          {ROLE_LABEL[user.role]} · {user.company.name}
        </p>
      </div>
      <form action={logout}>
        <button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" title="Log out" aria-label="Log out">
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-steel p-4 lg:flex">
        <div className="px-2 py-2">
          <Logo dark href="/dashboard" />
        </div>
        <div className="mt-6 flex-1">
          <AppNav counts={counts} />
        </div>
        <div className="border-t border-white/10 pt-4">{userBlock}</div>
      </aside>
      <header className="sticky top-0 z-20 bg-steel lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo dark href="/dashboard" />
          <form action={logout}>
            <button className="rounded-lg p-2 text-white/70" aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
        <AppNav counts={counts} mobile />
      </header>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

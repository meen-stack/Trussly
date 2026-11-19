import Link from "next/link";
import type { Metadata } from "next";
import { format } from "date-fns";
import { Camera, Plus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/status";

export const metadata: Metadata = { title: "Daily reports" };

export default async function ReportsPage({ params }: PageProps<"/projects/[id]/reports">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const reports = await db.dailyReport.findMany({
    where: { projectId: project.id },
    include: { author: true, _count: { select: { photos: true } } },
    orderBy: { date: "desc" },
  });
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{reports.length} reports</p>
        {can.submitReport(user.role) && (
          <ButtonLink href={`/projects/${project.id}/reports/new`}>
            <Plus className="h-4 w-4" /> File today&apos;s report
          </ButtonLink>
        )}
      </div>
      <Card>
        {reports.length === 0 ? (
          <EmptyState title="No reports yet" body="Site supervisors file one report per day with photos." />
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/projects/${project.id}/reports/${r.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-bg sm:flex-row sm:items-center">
                  <div className="w-28 shrink-0">
                    <p className="font-semibold">{format(r.date, "EEE, MMM d")}</p>
                    <p className="text-xs text-muted">{r.author.name}</p>
                  </div>
                  <p className="line-clamp-2 flex-1 text-sm text-muted sm:line-clamp-1">{r.workDone}</p>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {r.crewCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Camera className="h-3.5 w-3.5" /> {r._count.photos}
                    </span>
                    <span className="font-medium text-ink">{r.progress}%</span>
                    {r.issues && <span className="rounded bg-bad/10 px-1.5 py-0.5 font-medium text-bad">Issue</span>}
                    <StatusBadge status={r.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

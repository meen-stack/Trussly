import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CloudSun, MapPin, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Button, Card, Textarea } from "@/components/ui";
import { StatusBadge } from "@/components/status";
import { reviewReport } from "@/app/actions/reports";

export const metadata: Metadata = { title: "Daily report" };

export default async function ReportPage({ params }: PageProps<"/projects/[id]/reports/[reportId]">) {
  const { id, reportId } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const report = await db.dailyReport.findFirst({ where: { id: reportId, projectId: project.id }, include: { author: true, photos: true } });
  if (!report) notFound();
  const canReview = can.reviewReport(user.role) && report.status === "SUBMITTED";

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">{format(report.date, "EEEE, MMMM d, yyyy")}</h2>
          <StatusBadge status={report.status} />
        </div>
        <p className="mt-1 text-sm text-muted">Filed by {report.author.name} at {format(report.createdAt, "h:mm a")}</p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1.5"><CloudSun className="h-4 w-4 text-muted" /> {report.weather}</span>
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-muted" /> {report.crewCount} on site</span>
          <span className="font-medium">{report.progress}% complete overall</span>
        </div>
        <h3 className="mt-6 text-sm font-semibold">Work done</h3>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{report.workDone}</p>
        {report.issues && (
          <div className="mt-5 flex gap-3 rounded-lg border border-bad/20 bg-bad/5 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-bad" />
            <div>
              <p className="font-semibold text-bad">Issue reported</p>
              <p className="mt-1 whitespace-pre-line">{report.issues}</p>
            </div>
          </div>
        )}
        {report.reviewNote && (
          <p className="mt-5 rounded-lg bg-bg p-3 text-sm">
            <span className="font-medium">Manager&apos;s note:</span> {report.reviewNote}
          </p>
        )}
        {report.photos.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {report.photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? "Site photo"} className="aspect-[4/3] w-full rounded-lg object-cover" />
                {p.lat != null && (
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    <MapPin className="h-3 w-3" /> {p.lat.toFixed(4)}, {p.lng?.toFixed(4)}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </Card>
      {canReview && (
        <Card className="self-start p-5">
          <h3 className="font-display font-semibold">Review this report</h3>
          <form action={reviewReport.bind(null, project.id, report.id)} className="mt-4 space-y-3">
            <Textarea name="note" placeholder="Optional note to the supervisor" />
            <div className="flex gap-2">
              <Button name="decision" value="accept" variant="success" className="flex-1">Accept</Button>
              <Button name="decision" value="return" variant="danger" className="flex-1">Send back</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

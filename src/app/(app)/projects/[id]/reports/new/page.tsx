import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Card } from "@/components/ui";
import { ReportForm } from "@/components/report-form";
import { submitReport } from "@/app/actions/reports";

export const metadata: Metadata = { title: "New daily report" };

export default async function NewReportPage({ params }: PageProps<"/projects/[id]/reports/new">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  if (!can.submitReport(user.role)) redirect(`/projects/${id}/reports`);
  const last = await db.dailyReport.findFirst({ where: { projectId: id }, orderBy: { date: "desc" } });
  return (
    <Card className="max-w-2xl p-6">
      <h2 className="font-display mb-5 text-lg font-semibold">Daily site report</h2>
      <ReportForm action={submitReport.bind(null, project.id)} lastProgress={last?.progress ?? 0} />
    </Card>
  );
}

"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import { filesFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

export async function submitReport(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.submitReport(user.role)) return { error: "Only site supervisors and managers file daily reports." };
  const parsed = z
    .object({
      date: z.coerce.date(),
      weather: z.string().min(1, "Add the weather"),
      crewCount: z.coerce.number().int().min(0).max(5000),
      progress: z.coerce.number().int().min(0).max(100),
      workDone: z.string().min(5, "Describe the work done today"),
      issues: z.string().optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (await db.dailyReport.findUnique({ where: { projectId_date: { projectId: project.id, date: d.date } } })) {
    return { error: "A report for that date already exists." };
  }
  const files = filesFrom(form, "photos");
  if (files.length > 12) return { error: "Attach up to 12 photos per report." };
  let urls: string[];
  try {
    urls = await Promise.all(files.map((f) => storeFile(f, `projects/${project.id}`)));
  } catch (e) {
    return { error: (e as Error).message };
  }
  const lat = parseFloat(String(form.get("lat") ?? ""));
  const lng = parseFloat(String(form.get("lng") ?? ""));
  const report = await db.dailyReport.create({
    data: {
      projectId: project.id,
      authorId: user.id,
      date: d.date,
      weather: d.weather,
      crewCount: d.crewCount,
      progress: d.progress,
      workDone: d.workDone,
      issues: d.issues || null,
      photos: {
        create: urls.map((url) => ({ url, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null })),
      },
    },
  });
  await audit(user.id, `filed the daily report for ${d.date.toISOString().slice(0, 10)}`, "DailyReport", report.id, project.id);
  await notifyProjectRoles(
    project.id,
    ["MANAGER"],
    {
      title: `New daily report: ${project.name}`,
      body: `${user.name} filed today's report${d.issues ? " and flagged an issue" : ""}.`,
      href: `/projects/${project.id}/reports/${report.id}`,
    },
    user.id,
  );
  redirect(`/projects/${project.id}/reports/${report.id}`);
}

export async function reviewReport(projectId: string, reportId: string, form: FormData) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.reviewReport(user.role)) return;
  const decision = form.get("decision") === "accept" ? "ACCEPTED" : "RETURNED";
  const note = String(form.get("note") ?? "").trim() || null;
  const report = await db.dailyReport.findFirst({ where: { id: reportId, projectId: project.id } });
  if (!report || report.status !== "SUBMITTED") return;
  await db.dailyReport.update({ where: { id: report.id }, data: { status: decision, reviewNote: note } });
  await audit(user.id, decision === "ACCEPTED" ? "accepted a daily report" : "sent a daily report back", "DailyReport", report.id, project.id, note ? { note } : undefined);
  await notifyUsers([report.authorId], {
    title: decision === "ACCEPTED" ? "Daily report accepted" : "Daily report sent back",
    body: note ?? (decision === "ACCEPTED" ? `${user.name} accepted your report.` : `${user.name} asked for changes.`),
    href: `/projects/${project.id}/reports/${report.id}`,
  });
  revalidatePath(`/projects/${project.id}`, "layout");
}

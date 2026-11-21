import { format } from "date-fns";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { notifyProjectRoles, notifyUsers } from "@/lib/notify";

const DAY = 864e5;

/**
 * Daily checks at 6 PM (see vercel.json):
 * - managers hear about active projects with no site report today
 * - contractors and managers get reminders 3 days and 1 day before work is due, and a note the day it goes overdue
 * - finance and managers hear when an approved invoice goes overdue
 * Protected by CRON_SECRET, which Vercel Cron sends as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const today = new Date(format(new Date(), "yyyy-MM-dd"));
  const on = (offset: number) => ({ gte: new Date(today.getTime() + offset * DAY), lt: new Date(today.getTime() + (offset + 1) * DAY) });

  const missing = await db.project.findMany({ where: { status: "ACTIVE", reports: { none: { date: today } } }, select: { id: true, name: true } });
  for (const p of missing) {
    await notifyProjectRoles(p.id, ["MANAGER"], { title: `No daily report: ${p.name}`, body: `Nobody has filed today's site report for ${p.name} yet.`, href: `/projects/${p.id}/reports` });
  }

  const open = { status: { notIn: ["VERIFIED", "REJECTED"] as ("VERIFIED" | "REJECTED")[] }, project: { status: "ACTIVE" as const } };
  const reminders = [
    ...(await db.milestone.findMany({ where: { ...open, dueDate: on(3) }, include: { project: true } })).map((m) => ({ m, title: `Due in 3 days: ${m.title}` })),
    ...(await db.milestone.findMany({ where: { ...open, dueDate: on(1) }, include: { project: true } })).map((m) => ({ m, title: `Due tomorrow: ${m.title}` })),
    ...(await db.milestone.findMany({ where: { ...open, dueDate: on(-1) }, include: { project: true } })).map((m) => ({ m, title: `Overdue: ${m.title}` })),
  ];
  for (const { m, title } of reminders) {
    const note = { title, body: `${m.project.name}, due ${format(m.dueDate, "MMM d")}.`, href: `/projects/${m.projectId}/milestones` };
    if (m.assigneeId) await notifyUsers([m.assigneeId], note);
    await notifyProjectRoles(m.projectId, ["MANAGER"], note);
  }

  const overdue = await db.expense.findMany({
    where: { status: { in: ["APPROVED", "PROCESSING"] }, dueDate: on(-1) },
    include: { budgetLine: { include: { project: { include: { company: true } } } } },
  });
  for (const e of overdue) {
    const p = e.budgetLine.project;
    await notifyProjectRoles(p.id, ["FINANCE", "MANAGER"], {
      title: `Invoice overdue: ${formatMoney(e.amount, p.company.currency)} to ${e.vendor}`,
      body: `${p.name}. It was due ${format(e.dueDate!, "MMM d")}.`,
      href: "/finance",
    });
  }
  return Response.json({ missingReports: missing.length, workReminders: reminders.length, overdueInvoices: overdue.length });
}

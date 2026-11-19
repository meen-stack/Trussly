import { format } from "date-fns";
import { db } from "@/lib/db";
import { notifyProjectRoles } from "@/lib/notify";

/**
 * Runs daily at 6 PM (see vercel.json). Alerts managers on every active project with no report today.
 * Protected by CRON_SECRET, which Vercel Cron sends as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const today = new Date(format(new Date(), "yyyy-MM-dd"));
  const missing = await db.project.findMany({ where: { status: "ACTIVE", reports: { none: { date: today } } }, select: { id: true, name: true } });
  for (const p of missing) {
    await notifyProjectRoles(p.id, ["MANAGER"], {
      title: `No daily report: ${p.name}`,
      body: `Nobody has filed today's site report for ${p.name} yet.`,
      href: `/projects/${p.id}/reports`,
    });
  }
  return Response.json({ alerted: missing.length });
}

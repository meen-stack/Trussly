import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({ params }: PageProps<"/projects/[id]/photos">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const photos = await db.photo.findMany({
    where: { OR: [{ report: { projectId: project.id } }, { milestone: { projectId: project.id } }] },
    include: { report: { select: { id: true, date: true } }, milestone: { select: { title: true } } },
    orderBy: { takenAt: "desc" },
  });
  if (photos.length === 0) return <Card><EmptyState title="No photos yet" body="Photos from daily reports and milestone evidence collect here." /></Card>;

  const groups = new Map<string, typeof photos>();
  for (const p of photos) {
    const key = format(p.report?.date ?? p.takenAt, "yyyy-MM-dd");
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([day, list]) => (
        <section key={day}>
          <h2 className="font-display mb-3 font-semibold">{format(new Date(day + "T12:00:00"), "EEEE, MMMM d")}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption ?? "Site photo"} className="aspect-[4/3] w-full object-cover" />
                </a>
                <figcaption className="truncate px-2 py-1.5 text-xs text-muted">
                  {p.report ? (
                    <Link href={`/projects/${project.id}/reports/${p.report.id}`} className="hover:text-brand">Daily report</Link>
                  ) : (
                    <>Milestone: {p.milestone?.title}</>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

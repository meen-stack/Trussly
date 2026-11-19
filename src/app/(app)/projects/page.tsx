import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { visibleProjectsWhere } from "@/lib/access";
import { loadProjectSummary } from "@/lib/project-data";
import { can } from "@/lib/permissions";
import { ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import { ProjectCard } from "@/components/project-card";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await db.project.findMany({ where: visibleProjectsWhere(user), orderBy: { createdAt: "desc" }, select: { id: true } });
  const summaries = await Promise.all(projects.map((p) => loadProjectSummary(p.id)));
  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Every site you can see, with progress and spend at a glance."
        action={
          can.createProject(user.role) && (
            <ButtonLink href="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </ButtonLink>
          )
        }
      />
      {summaries.length === 0 ? (
        <Card>
          <EmptyState title="No projects yet" body="Projects you create or are added to show up here." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => (
            <ProjectCard key={s.project.id} s={s} currency={user.company.currency} />
          ))}
        </div>
      )}
    </>
  );
}

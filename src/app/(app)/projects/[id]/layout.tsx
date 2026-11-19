import { format } from "date-fns";
import { MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { StatusBadge } from "@/components/status";
import { ProjectTabs } from "@/components/project-tabs";
import { updateProjectStatus } from "@/app/actions/projects";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{project.name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {project.location}
            </span>
            <span>
              {format(project.startDate, "MMM d, yyyy")} – {format(project.endDate, "MMM d, yyyy")}
            </span>
          </p>
        </div>
        {can.manageProject(user.role) && (
          <form action={updateProjectStatus.bind(null, project.id)} className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={project.status}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
              aria-label="Project status"
            >
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="COMPLETED">Completed</option>
            </select>
            <button className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm hover:bg-bg">Update</button>
          </form>
        )}
      </div>
      <ProjectTabs projectId={project.id} />
      {children}
    </>
  );
}

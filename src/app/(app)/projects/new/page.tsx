import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { createProject } from "@/app/actions/projects";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!can.createProject(user.role)) redirect("/projects");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="New project" subtitle="We'll split the budget into standard lines you can adjust later." />
      <Card className="max-w-2xl p-6">
        <ActionForm action={createProject} submitLabel="Create project" pendingLabel="Creating…">
          <Field label="Project name">
            <Input name="name" placeholder="Harbour View Residences" required />
          </Field>
          <Field label="Location">
            <Input name="location" placeholder="Austin, TX" required />
          </Field>
          <Field label="Description">
            <Textarea name="description" placeholder="12-unit residential block, 4 storeys" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start date">
              <Input name="startDate" type="date" defaultValue={today} required />
            </Field>
            <Field label="Target completion">
              <Input name="endDate" type="date" required />
            </Field>
            <Field label={`Total budget (${user.company.currency})`}>
              <Input name="budget" inputMode="decimal" placeholder="450000" required />
            </Field>
          </div>
          <Field label="Cover photo" hint="Optional. JPG or PNG up to 8 MB.">
            <Input name="cover" type="file" accept="image/*" />
          </Field>
        </ActionForm>
      </Card>
    </>
  );
}

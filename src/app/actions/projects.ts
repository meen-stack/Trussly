"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { parseMoney } from "@/lib/money";
import { audit, notifyUsers } from "@/lib/notify";
import { filesFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

const DEFAULT_LINES = ["Site preparation", "Foundations", "Structure", "Roofing", "MEP (mechanical, electrical, plumbing)", "Finishes", "Contingency"];

export async function createProject(_: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  if (!can.createProject(user.role)) return { error: "Only owners, admins and managers can create projects." };
  const parsed = z
    .object({
      name: z.string().min(2, "Give the project a name"),
      location: z.string().min(2, "Add a location"),
      description: z.string().optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      budget: z.string(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.endDate <= d.startDate) return { error: "The end date must be after the start date." };
  const total = parseMoney(d.budget);
  if (!total) return { error: "Enter the total budget as a number, like 450000." };

  const cover = filesFrom(form, "cover")[0];
  let coverUrl: string | undefined;
  if (cover) {
    try {
      coverUrl = await storeFile(cover, "covers");
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  // Split the budget across standard lines so the project starts usable; managers can edit after.
  const weights = [0.06, 0.14, 0.28, 0.1, 0.18, 0.16, 0.08];
  const project = await db.project.create({
    data: {
      name: d.name,
      location: d.location,
      description: d.description || null,
      startDate: d.startDate,
      endDate: d.endDate,
      coverUrl,
      companyId: user.companyId,
      members: { create: { userId: user.id } },
      budgetLines: { create: DEFAULT_LINES.map((category, i) => ({ category, budgeted: Math.round(total * weights[i]) })) },
    },
  });
  await audit(user.id, "created the project", "Project", project.id, project.id);
  redirect(`/projects/${project.id}`);
}

export async function updateProjectStatus(projectId: string, form: FormData) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role)) return;
  const status = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"]).parse(form.get("status"));
  await db.project.update({ where: { id: project.id }, data: { status } });
  await audit(user.id, `changed status to ${status.toLowerCase().replace("_", " ")}`, "Project", project.id, project.id);
  revalidatePath(`/projects/${project.id}`);
}

export async function addMember(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role)) return { error: "Only managers and owners can change the team." };
  const userId = String(form.get("userId") ?? "");
  const member = await db.user.findFirst({ where: { id: userId, companyId: user.companyId } });
  if (!member) return { error: "Pick someone from your company." };
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId } },
    create: { projectId: project.id, userId },
    update: {},
  });
  await audit(user.id, `added ${member.name} to the project`, "Project", project.id, project.id);
  await notifyUsers([member.id], {
    title: `You were added to ${project.name}`,
    body: `${user.name} added you to the project team.`,
    href: `/projects/${project.id}`,
  });
  revalidatePath(`/projects/${project.id}`, "layout");
  return { success: `${member.name} added.` };
}

export async function removeMember(projectId: string, form: FormData) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role)) return;
  const userId = String(form.get("userId"));
  await db.projectMember.deleteMany({ where: { projectId: project.id, userId } });
  await audit(user.id, "removed a team member", "Project", project.id, project.id);
  revalidatePath(`/projects/${project.id}`, "layout");
}

export async function addBudgetLine(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role)) return { error: "Only managers and owners can change the budget." };
  const category = String(form.get("category") ?? "").trim();
  const amount = parseMoney(String(form.get("budgeted") ?? ""));
  if (category.length < 2 || amount === null) return { error: "Enter a category and an amount." };
  await db.budgetLine.create({ data: { projectId: project.id, category, budgeted: amount } });
  await audit(user.id, `added budget line "${category}"`, "Project", project.id, project.id, { amount });
  revalidatePath(`/projects/${project.id}`, "layout");
  return { success: "Budget line added." };
}

export async function updateBudgetLine(projectId: string, form: FormData) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role)) return;
  const id = String(form.get("id"));
  const amount = parseMoney(String(form.get("budgeted") ?? ""));
  if (amount === null) return;
  const line = await db.budgetLine.findFirst({ where: { id, projectId: project.id } });
  if (!line) return;
  await db.budgetLine.update({ where: { id }, data: { budgeted: amount } });
  await audit(user.id, `changed the "${line.category}" budget`, "BudgetLine", id, project.id, { from: line.budgeted, to: amount });
  revalidatePath(`/projects/${project.id}`, "layout");
}

export async function addMilestone(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role)) return { error: "Only managers and owners can add milestones." };
  const parsed = z
    .object({ title: z.string().min(2, "Give the milestone a title"), description: z.string().optional(), dueDate: z.coerce.date(), payment: z.string() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const payment = parsed.data.payment ? parseMoney(parsed.data.payment) : 0;
  if (payment === null) return { error: "Enter the payment as a number." };
  const count = await db.milestone.count({ where: { projectId: project.id } });
  const m = await db.milestone.create({
    data: {
      projectId: project.id,
      title: parsed.data.title,
      description: parsed.data.description || null,
      dueDate: parsed.data.dueDate,
      paymentAmount: payment,
      sortOrder: count,
    },
  });
  await audit(user.id, `added milestone "${m.title}"`, "Milestone", m.id, project.id);
  revalidatePath(`/projects/${project.id}`, "layout");
  return { success: "Milestone added." };
}

"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { nextMilestoneStatus, type MilestoneAction } from "@/lib/workflow";
import { audit, notifyProjectRoles } from "@/lib/notify";
import { formatMoney } from "@/lib/money";
import { filesFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

const VERB: Record<MilestoneAction, string> = {
  submit: "submitted",
  pass: "passed inspection on",
  reject: "rejected",
  signOff: "signed off",
};

export async function transitionMilestone(projectId: string, milestoneId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const action = String(form.get("action")) as MilestoneAction;
  const note = String(form.get("note") ?? "").trim() || null;
  const milestone = await db.milestone.findFirst({ where: { id: milestoneId, projectId: project.id } });
  if (!milestone) return { error: "Milestone not found." };

  const result = nextMilestoneStatus(milestone.status, action, user.role);
  if (!result.ok) return { error: result.error };
  if (action === "reject" && !note) return { error: "Say why so the work can be fixed." };

  const files = action === "submit" ? filesFrom(form, "photos") : [];
  if (action === "submit" && files.length === 0) return { error: "Attach at least one photo as evidence." };
  let urls: string[] = [];
  try {
    urls = await Promise.all(files.map((f) => storeFile(f, `projects/${project.id}`)));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const now = new Date();
  await db.milestone.update({
    where: { id: milestone.id },
    data: {
      status: result.next,
      ...(action === "submit" && { submittedNote: note, submittedAt: now, reviewNote: null }),
      ...(action === "pass" && { passedAt: now, reviewNote: note }),
      ...(action === "reject" && { reviewNote: note }),
      ...(action === "signOff" && { signedOffAt: now }),
      ...(urls.length && { photos: { create: urls.map((url) => ({ url, caption: note })) } }),
    },
  });
  await audit(user.id, `${VERB[action]} milestone "${milestone.title}"`, "Milestone", milestone.id, project.id, note ? { note } : undefined);

  const href = `/projects/${project.id}/milestones`;
  if (action === "submit") {
    await notifyProjectRoles(project.id, ["MANAGER"], { title: `Ready for inspection: ${milestone.title}`, body: `${user.name} marked this milestone done on ${project.name}.`, href }, user.id);
  } else if (action === "pass") {
    await notifyProjectRoles(project.id, ["OWNER"], {
      title: `Ready for sign-off: ${milestone.title}`,
      body: `${user.name} passed inspection. Signing off releases ${formatMoney(milestone.paymentAmount)}.`,
      href,
    });
  } else if (action === "reject") {
    await notifyProjectRoles(project.id, ["CONTRACTOR", "MANAGER"], { title: `Milestone rejected: ${milestone.title}`, body: note ?? "", href }, user.id);
  } else {
    await notifyProjectRoles(project.id, ["MANAGER", "CONTRACTOR"], {
      title: `Signed off: ${milestone.title}`,
      body: `${user.name} signed off. ${formatMoney(milestone.paymentAmount)} is released for payment.`,
      href,
    });
  }
  revalidatePath(`/projects/${project.id}`, "layout");
  return { success: "Done." };
}

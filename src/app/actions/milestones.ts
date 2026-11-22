"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { NEEDS_NOTE, nextWorkStatus, type WorkAction } from "@/lib/workflow";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import { formatMoney } from "@/lib/money";
import { mediaFrom } from "@/lib/storage";
import type { FormState } from "./auth";
import { actsForOwner } from "@/lib/release";

const VERB: Record<WorkAction, string> = {
  start: "started work on",
  submit: "submitted work on",
  pass: "passed inspection on",
  fail: "asked for corrections on",
  approve: "approved work on",
  return: "sent back for corrections",
  finalApprove: "gave final approval on",
  reject: "rejected work on",
};

export async function transitionWork(projectId: string, milestoneId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const action = String(form.get("action")) as WorkAction;
  const note = String(form.get("note") ?? "").trim() || null;
  const work = await db.milestone.findFirst({ where: { id: milestoneId, projectId: project.id } });
  if (!work) return { error: "Work item not found." };
  if (user.role === "CONTRACTOR" && work.assigneeId && work.assigneeId !== user.id) return { error: "This work is assigned to another contractor." };

  // Roles the owner has delegated can give the owner's final approval.
  const onBehalf = work.status === "AWAITING_OWNER" && actsForOwner(user.role, user.company);
  const result = nextWorkStatus(work.status, action, onBehalf ? "OWNER" : user.role, work.paymentAmount, user.company.approvalThreshold);
  if (!result.ok) return { error: result.error };
  if (NEEDS_NOTE.includes(action) && !note) return { error: "Say what needs fixing so the contractor knows." };

  let urls: string[] = [];
  if (action === "submit") {
    try {
      urls = await mediaFrom(form, "photos", `projects/${project.id}`);
    } catch (e) {
      return { error: (e as Error).message };
    }
    if (urls.length === 0) return { error: "Attach at least one photo or video as evidence." };
  }

  const now = new Date();
  await db.milestone.update({
    where: { id: work.id },
    data: {
      status: result.next,
      ...(action === "start" && { startedAt: now }),
      ...(action === "submit" && { submittedNote: note, submittedAt: now, inspectNote: null, reviewNote: null, startedAt: work.startedAt ?? now }),
      ...((action === "pass" || action === "fail") && { inspectNote: note, inspectedAt: now }),
      ...(action === "approve" && { reviewNote: note, approvedAt: now, ...(result.next === "VERIFIED" && { verifiedAt: now }) }),
      ...(action === "finalApprove" && { verifiedAt: now, ...(note && { reviewNote: note }) }),
      ...((action === "return" || action === "reject") && { reviewNote: note }),
      ...(urls.length && { photos: { create: urls.map((url) => ({ url, caption: note })) } }),
    },
  });
  await audit(user.id, `${VERB[action]} "${work.title}"${onBehalf ? " on behalf of the owner" : ""}`, "Milestone", work.id, project.id, note ? { note } : undefined);

  const href = `/projects/${project.id}/milestones`;
  const contractor = work.assigneeId ? [work.assigneeId] : [];
  const tellContractor = (title: string, body: string) =>
    contractor.length ? notifyUsers(contractor, { title, body, href }) : notifyProjectRoles(project.id, ["CONTRACTOR"], { title, body, href }, user.id);
  const value = formatMoney(work.paymentAmount, user.company.currency);

  switch (action) {
    case "submit":
      await notifyProjectRoles(project.id, ["SUPERVISOR"], { title: `Inspection requested: ${work.title}`, body: `${user.name} submitted work with photos on ${project.name}.`, href }, user.id);
      break;
    case "pass":
      await notifyProjectRoles(project.id, ["MANAGER"], { title: `Ready for your review: ${work.title}`, body: `${user.name} inspected and passed the work.`, href }, user.id);
      break;
    case "fail":
    case "return":
      await tellContractor(`Corrections needed: ${work.title}`, note ?? "");
      break;
    case "reject":
      await tellContractor(`Work rejected: ${work.title}`, note ?? "");
      break;
    case "approve":
      if (result.next === "AWAITING_OWNER") {
        await notifyProjectRoles(project.id, ["OWNER"], { title: `Final approval needed: ${work.title}`, body: `${user.name} approved ${value} of work, over your limit.`, href });
      } else {
        await tellContractor(`Work approved: ${work.title}`, `Verified by ${user.name}. You can invoice for it now.`);
      }
      break;
    case "finalApprove":
      await tellContractor(`Work approved: ${work.title}`, `${user.name} gave final approval. You can invoice for it now.`);
      await notifyProjectRoles(project.id, ["MANAGER"], { title: `Work verified: ${work.title}`, body: `${user.name} gave final approval on ${value} of work.`, href }, user.id);
      break;
  }
  revalidatePath(`/projects/${project.id}`, "layout");
  revalidatePath("/approvals");
  return { success: "Done." };
}

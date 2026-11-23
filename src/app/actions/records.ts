"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DocumentCategory, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { canDisputeWork, disputeScope, invoiceScope } from "@/lib/scope";
import { ROLE_LABEL, can } from "@/lib/permissions";
import { formatMoney, parseMoney } from "@/lib/money";
import { disputeAction, fullySigned, missingSigners, nextVersion, reopenAfterDispute, validScore } from "@/lib/commercial";
import { clearConfirmations } from "@/lib/confirmations";
import { fingerprint } from "@/lib/signature";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import { filesFrom, mediaFrom, storeFile } from "@/lib/storage";
import type { FormState } from "./auth";

const CATEGORIES: DocumentCategory[] = ["DRAWING", "CONTRACT", "PERMIT", "SPECIFICATION", "REPORT", "OTHER"];

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/approvals");
  revalidatePath("/analytics");
  revalidatePath("/team");
}

// ---------- Documents and signatures ----------

export async function uploadDocument(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.uploadDocument(user.role)) return { error: "Your role can't upload project documents." };
  const title = String(form.get("title") ?? "").trim();
  const category = String(form.get("category")) as DocumentCategory;
  if (title.length < 2) return { error: "Give the document a title." };
  if (!CATEGORIES.includes(category)) return { error: "Pick a category." };
  // Signers are named people: project members, plus owners (who see every project).
  const picked = [...new Set(form.getAll("signers").map(String))];
  const signers = picked.length
    ? await db.user.findMany({
        where: { id: { in: picked }, companyId: user.companyId, role: { not: "FINANCE" }, OR: [{ role: "OWNER" }, { memberships: { some: { projectId: project.id } } }] },
        select: { id: true },
      })
    : [];
  if (signers.length !== picked.length) return { error: "Signers must be on this project." };
  const signerIds = signers.map((s) => s.id);
  const file = filesFrom(form, "file")[0];
  if (!file) return { error: "Attach the file (PDF or image)." };
  let url: string;
  try {
    url = await storeFile(file, `projects/${project.id}/documents`);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const existing = await db.document.findMany({ where: { projectId: project.id }, select: { title: true, version: true } });
  const version = nextVersion(existing, title);
  const doc = await db.document.create({ data: { projectId: project.id, title, category, url, fileName: file.name, version, signerIds, uploadedById: user.id } });
  await audit(user.id, `uploaded "${title}"${version > 1 ? ` (version ${version})` : ""}`, "Document", doc.id, project.id);
  await notifyUsers(signerIds.filter((id) => id !== user.id), { title: `Signature needed: ${title}`, body: `${user.name} needs your signature on a document for ${project.name}.`, href: `/projects/${project.id}/documents` });
  refresh(project.id);
  return { success: version > 1 ? `Uploaded as version ${version}.` : "Uploaded." };
}

/** Typed-name electronic signature. The fingerprint ties the signer, the file and the time together. */
export async function signDocument(projectId: string, documentId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const doc = await db.document.findFirst({ where: { id: documentId, projectId: project.id }, include: { signatures: true } });
  if (!doc) return { error: "Document not found." };
  if (!missingSigners(doc.signerIds, doc.signatures).includes(user.id)) return { error: "Your signature isn't needed on this document." };
  const signedName = String(form.get("signature") ?? "").trim();
  if (signedName.toLowerCase() !== user.name.toLowerCase()) return { error: `Type your full name (${user.name}) to sign.` };
  if (!form.get("agree")) return { error: "Tick the box to confirm you agree." };
  const now = new Date();
  await db.signature.create({
    data: { documentId: doc.id, userId: user.id, signedName, role: user.role, signedAt: now, fingerprint: fingerprint([doc.id, doc.url, doc.version, user.id, signedName, now.toISOString()]) },
  });
  const done = fullySigned(doc.signerIds, [...doc.signatures, { userId: user.id }]);
  await audit(user.id, `signed "${doc.title}" v${doc.version} as ${ROLE_LABEL[user.role]}${done ? " (fully signed)" : ""}`, "Document", doc.id, project.id);
  if (done) await notifyUsers([doc.uploadedById], { title: `Fully signed: ${doc.title}`, body: `Everyone has signed version ${doc.version}.`, href: `/projects/${project.id}/documents` });
  refresh(project.id);
  return { success: done ? "Signed. The document is now fully signed." : "Signed." };
}

// ---------- Ratings ----------

export async function rateWork(projectId: string, milestoneId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.rate(user.role)) return { error: "Only the manager, owner or supervisor rates contractors." };
  const work = await db.milestone.findFirst({ where: { id: milestoneId, projectId: project.id }, include: { ratings: true } });
  if (!work || !work.assigneeId) return { error: "Only assigned work can be rated." };
  if (work.status !== "VERIFIED") return { error: "Rate work once it's verified." };
  if (work.ratings.length) return { error: "This work has already been rated." };
  const [quality, timeliness, safety] = ["quality", "timeliness", "safety"].map((k) => Number(form.get(k)));
  if (![quality, timeliness, safety].every(validScore)) return { error: "Score each one from 1 to 5." };
  const comment = String(form.get("comment") ?? "").trim() || null;
  await db.rating.create({ data: { projectId: project.id, contractorId: work.assigneeId, milestoneId: work.id, raterId: user.id, quality, timeliness, safety, comment } });
  await audit(user.id, `rated "${work.title}" ${quality}/${timeliness}/${safety} (quality/timeliness/safety)`, "Milestone", work.id, project.id, comment ? { note: comment } : undefined);
  await notifyUsers([work.assigneeId], { title: `You were rated on "${work.title}"`, body: `Quality ${quality}, timeliness ${timeliness}, safety ${safety}.${comment ? ` "${comment}"` : ""}`, href: "/team" });
  refresh(project.id);
  return { success: "Rating saved." };
}

// ---------- Disputes ----------

export async function raiseDispute(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const parsed = z
    .object({ title: z.string().min(3, "Give the dispute a title"), body: z.string().min(5, "Explain the issue"), about: z.string().optional(), amount: z.string().optional() })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const [kind, refId] = (parsed.data.about ?? "").split(":");
  let milestoneId: string | null = null;
  let expenseId: string | null = null;
  if (kind === "work") {
    const w = await db.milestone.findFirst({ where: { id: refId, projectId: project.id } });
    if (!w) return { error: "Pick work on this project." };
    if (!canDisputeWork(user, w)) return { error: "You can only dispute your own work." };
    milestoneId = w.id;
  } else if (kind === "invoice") {
    const e = await db.expense.findFirst({ where: { id: refId, budgetLine: { projectId: project.id }, ...invoiceScope(user) } });
    if (!e) return { error: user.role === "CONTRACTOR" ? "You can only dispute your own invoices." : "Pick an invoice on this project." };
    expenseId = e.id;
  }
  const amount = parsed.data.amount ? parseMoney(parsed.data.amount) : null;
  let attachments: string[];
  try {
    attachments = await mediaFrom(form, "media", `projects/${project.id}`);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const d = await db.dispute.create({
    data: { projectId: project.id, title: parsed.data.title, milestoneId, expenseId, amount, raisedById: user.id, messages: { create: { authorId: user.id, body: parsed.data.body, attachments } } },
  });
  await audit(user.id, `raised a dispute: "${d.title}"${amount ? ` (${formatMoney(amount, user.company.currency)})` : ""}`, "Dispute", d.id, project.id, { note: parsed.data.body });
  await notifyProjectRoles(project.id, ["MANAGER", ...(expenseId ? (["FINANCE"] as Role[]) : [])], { title: `Dispute raised: ${d.title}`, body: `${user.name} on ${project.name}.${expenseId ? " Payment of the invoice is on hold." : ""}`, href: `/projects/${project.id}/disputes` }, user.id);
  refresh(project.id);
  return { success: expenseId ? "Dispute raised. The invoice can't be paid until it's resolved." : "Dispute raised." };
}

export async function replyDispute(projectId: string, disputeId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const d = await db.dispute.findFirst({
    where: { id: disputeId, projectId: project.id, ...disputeScope(user) },
    include: { messages: { select: { authorId: true } }, milestone: true, expense: true },
  });
  if (!d) return { error: "Dispute not found." };
  const body = String(form.get("body") ?? "").trim();
  let attachments: string[];
  try {
    attachments = await mediaFrom(form, "media", `projects/${project.id}`);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const action = String(form.get("action") ?? "reply");
  if (action === "reply") {
    if (d.status === "RESOLVED") return { error: "This dispute is resolved." };
    if (body.length < 2 && !attachments.length) return { error: "Write a reply." };
    await db.disputeMessage.create({ data: { disputeId: d.id, authorId: user.id, body, attachments } });
    await notifyUsers([d.raisedById, ...d.messages.map((m) => m.authorId)].filter((id) => id !== user.id), { title: `Reply on dispute: ${d.title}`, body: `${user.name}: ${body.slice(0, 140)}`, href: `/projects/${project.id}/disputes` });
    refresh(project.id);
    return { success: "Sent." };
  }
  const decidedByMe = (d.milestone?.decidedById ?? d.expense?.decidedById) === user.id;
  const step = disputeAction(d.status, action === "escalate" ? "escalate" : "resolve", user.role, decidedByMe);
  if (!step.ok) return { error: step.error };
  if (step.next === "RESOLVED" && body.length < 5) return { error: "Write the resolution." };
  // Settling in the contractor's favour can reopen the rejected work or invoice.
  const reopen = step.next === "RESOLVED" && form.get("reopen") === "on" ? reopenAfterDispute({ work: d.milestone, invoice: d.expense }) : null;
  await db.$transaction([
    ...(reopen?.kind === "work" ? [db.milestone.update({ where: { id: d.milestone!.id }, data: { status: reopen.next, reviewNote: `Reopened by dispute: ${body}` } })] : []),
    ...(reopen?.kind === "invoice" ? [db.expense.update({ where: { id: d.expense!.id }, data: { status: reopen.next, reviewNote: `Reopened by dispute: ${body}`, decidedAt: null } })] : []),
    db.dispute.update({ where: { id: d.id }, data: step.next === "RESOLVED" ? { status: "RESOLVED", resolution: body, resolvedById: user.id, resolvedAt: new Date() } : { status: "ESCALATED" } }),
    ...(body || attachments.length
      ? [db.disputeMessage.create({ data: { disputeId: d.id, authorId: user.id, attachments, body: step.next === "RESOLVED" ? `Resolved: ${body}` : `Escalated to the owner. ${body}`.trim() } })]
      : []),
  ]);
  if (reopen?.kind === "invoice" && reopen.next === "SUBMITTED") await clearConfirmations("INVOICE", d.expense!.id);
  await audit(user.id, `${step.next === "RESOLVED" ? "resolved" : "escalated"} the dispute "${d.title}"`, "Dispute", d.id, project.id, body ? { note: body } : undefined);
  if (reopen?.kind === "work") await audit(user.id, `reopened "${d.milestone!.title}" for corrections after a dispute`, "Milestone", d.milestone!.id, project.id, { from: "REJECTED", to: reopen.next, note: body });
  if (reopen?.kind === "invoice") {
    await audit(user.id, `reopened the ${formatMoney(d.expense!.amount, user.company.currency)} invoice from ${d.expense!.vendor} after a dispute`, "Expense", d.expense!.id, project.id, { from: d.expense!.status, to: reopen.next, note: body });
  }
  const href = `/projects/${project.id}/disputes`;
  if (step.next === "ESCALATED") await notifyProjectRoles(project.id, ["OWNER"], { title: `Dispute escalated: ${d.title}`, body: `${user.name} needs your decision on ${project.name}.`, href });
  else await notifyUsers([d.raisedById, ...d.messages.map((m) => m.authorId)].filter((id) => id !== user.id), { title: `Dispute resolved: ${d.title}`, body, href });
  refresh(project.id);
  return { success: step.next === "RESOLVED" ? "Resolved." : "Escalated to the owner." };
}


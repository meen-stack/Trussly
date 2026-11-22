"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { can } from "@/lib/permissions";
import { formatMoney, parseMoney } from "@/lib/money";
import { canReceive, initialPoStatus, poStatusAfterDelivery, poTotal, stockOf } from "@/lib/commercial";
import { audit, notifyProjectRoles, notifyUsers } from "@/lib/notify";
import type { FormState } from "./auth";
import { actsForOwner, needsTwo, ownerSideRoles } from "@/lib/release";
import { addConfirmation, clearConfirmations } from "@/lib/confirmations";

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/approvals");
  revalidatePath("/analytics");
}

const qty = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function addMaterial(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!can.manageProject(user.role) && user.role !== "SUPERVISOR") return { error: "Only the manager or supervisor can add materials." };
  const parsed = z
    .object({ name: z.string().min(2, "Name the material"), unit: z.string().min(1, "Add a unit, like bags or m³"), reorderAt: z.coerce.number().min(0).default(0) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const exists = await db.material.findFirst({ where: { projectId: project.id, name: { equals: parsed.data.name, mode: "insensitive" } } });
  if (exists) return { error: `${exists.name} is already tracked.` };
  const m = await db.material.create({ data: { projectId: project.id, ...parsed.data } });
  await audit(user.id, `started tracking ${m.name}`, "Material", m.id, project.id);
  refresh(project.id);
  return { success: `${m.name} added.` };
}

export async function createPurchaseOrder(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const supplier = String(form.get("supplier") ?? "").trim();
  const budgetLineId = String(form.get("budgetLineId") ?? "");
  const expected = String(form.get("expectedAt") ?? "");
  if (supplier.length < 2) return { error: "Add the supplier." };
  const line = await db.budgetLine.findFirst({ where: { id: budgetLineId, projectId: project.id } });
  if (!line) return { error: "Pick a budget line." };

  const materials = await db.material.findMany({ where: { projectId: project.id } });
  const items: { materialId: string; quantity: number; unitPrice: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const materialId = String(form.get(`material${i}`) ?? "");
    if (!materialId) continue;
    if (!materials.some((m) => m.id === materialId)) return { error: "Pick materials tracked on this project." };
    const quantity = qty(form.get(`qty${i}`));
    const unitPrice = parseMoney(String(form.get(`price${i}`) ?? ""));
    if (!quantity || !unitPrice) return { error: "Each line needs a quantity and a unit price." };
    items.push({ materialId, quantity, unitPrice });
  }
  if (items.length === 0) return { error: "Add at least one line." };
  const total = poTotal(items.map((i) => ({ ...i, received: 0 })));
  const initial = initialPoStatus(user.role, total, user.company.approvalThreshold);
  if (!initial.ok) return { error: initial.error };
  // Orders that need two people wait for them, whoever raised them.
  const status = needsTwo(total, user.company.twoPersonFrom) ? { ok: true as const, next: "PENDING_APPROVAL" as const } : initial;

  const number = (await db.purchaseOrder.count({ where: { projectId: project.id } })) + 1;
  const po = await db.purchaseOrder.create({
    data: { projectId: project.id, number, supplier, budgetLineId: line.id, status: status.next, expectedAt: expected ? new Date(expected) : null, createdById: user.id, items: { create: items } },
  });
  const money = formatMoney(total, user.company.currency);
  await audit(user.id, `raised PO-${number} to ${supplier} (${money})${status.next === "PENDING_APPROVAL" ? ", awaiting approval" : ""}`, "PurchaseOrder", po.id, project.id);
  if (status.next === "PENDING_APPROVAL") {
    await notifyProjectRoles(project.id, [...new Set([...ownerSideRoles(user.company), "MANAGER", "FINANCE"] as const)], { title: `Purchase order approval: ${money}`, body: `${user.name} raised PO-${number} to ${supplier} on ${project.name}. It needs approval before it's issued.`, href: `/projects/${project.id}/materials` }, user.id);
  } else {
    await notifyProjectRoles(project.id, ["SUPERVISOR"], { title: `PO-${number} issued: ${supplier}`, body: `Deliveries for ${project.name} can be received against it.`, href: `/projects/${project.id}/materials` }, user.id);
  }
  refresh(project.id);
  return { success: status.next === "PENDING_APPROVAL" ? `PO-${number} is waiting for approval.` : `PO-${number} issued.` };
}

/** The manager or owner cancels an order that hasn't been received yet. */
export async function decidePurchaseOrder(projectId: string, poId: string, form: FormData) {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const po = await db.purchaseOrder.findFirst({ where: { id: poId, projectId: project.id }, include: { items: true } });
  if (!po || form.get("decision") !== "cancel") return;
  if (!(po.status === "PENDING_APPROVAL" || po.status === "ISSUED") || !(user.role === "OWNER" || user.role === "MANAGER" || actsForOwner(user.role, user.company))) return;
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "CANCELLED" } });
  await clearConfirmations("PURCHASE_ORDER", po.id);
  await audit(user.id, `cancelled PO-${po.number} to ${po.supplier}`, "PurchaseOrder", po.id, project.id);
  await notifyUsers([po.createdById], { title: `PO-${po.number} cancelled`, body: `${po.supplier}, ${formatMoney(poTotal(po.items), user.company.currency)}.`, href: `/projects/${project.id}/materials` });
  refresh(project.id);
}

/** Confirms a purchase order waiting for approval. Two people when the company's rule says so, otherwise the owner. */
export async function confirmPurchaseOrder(projectId: string, poId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  const po = await db.purchaseOrder.findFirst({ where: { id: poId, projectId: project.id }, include: { items: { include: { material: true } }, budgetLine: true } });
  if (!po) return { error: "Order not found." };
  if (po.status !== "PENDING_APPROVAL") return { error: "This order isn't waiting for approval." };
  if (form.get("decision") === "cancel") {
    await decidePurchaseOrder(projectId, poId, form);
    return { success: "Cancelled." };
  }
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm the order and what it's for." };
  const total = poTotal(po.items);
  const money = formatMoney(total, user.company.currency);
  const confirmed = await addConfirmation({
    user,
    projectId: project.id,
    kind: "PURCHASE_ORDER",
    targetId: po.id,
    amount: total,
    requesterId: po.createdById,
    statement: `The order is needed. The money is for ${po.items.map((i) => i.material.name).join(", ")} from ${po.supplier}, on ${po.budgetLine.category}.`,
    singleOk: (role) => role === "OWNER",
  });
  if (!confirmed.ok) return { error: confirmed.error };
  const behalf = confirmed.asOwner ? " on behalf of the owner" : "";
  const href = `/projects/${project.id}/materials`;
  if (!confirmed.complete) {
    await audit(user.id, `confirmed PO-${po.number} to ${po.supplier} (${money})${behalf}`, "PurchaseOrder", po.id, project.id);
    refresh(project.id);
    return { success: "Confirmed. One more person must confirm." };
  }
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "ISSUED" } });
  await audit(user.id, `approved PO-${po.number} to ${po.supplier} (${money})${behalf}`, "PurchaseOrder", po.id, project.id);
  await notifyUsers([po.createdById], { title: `PO-${po.number} approved`, body: `${po.supplier}, ${money}.`, href });
  await notifyProjectRoles(project.id, ["SUPERVISOR"], { title: `PO-${po.number} issued: ${po.supplier}`, body: `Deliveries for ${project.name} can be received against it.`, href }, user.id);
  refresh(project.id);
  return { success: "Approved. The order is issued." };
}

/** Supervisor or manager logs a delivery against a PO. Stock goes up by what arrived. */
export async function receiveDelivery(projectId: string, poId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!canReceive(user.role)) return { error: "Only the supervisor or manager can receive deliveries." };
  const po = await db.purchaseOrder.findFirst({ where: { id: poId, projectId: project.id }, include: { items: { include: { material: true } } } });
  if (!po) return { error: "Purchase order not found." };
  if (po.status !== "ISSUED" && po.status !== "PARTIALLY_RECEIVED") return { error: "This order isn't open for deliveries." };
  const note = String(form.get("note") ?? "").trim() || null;
  const arrivals = po.items.map((i) => ({ item: i, q: qty(form.get(`recv_${i.id}`)) ?? 0 })).filter((a) => a.q > 0);
  if (arrivals.length === 0) return { error: "Enter what arrived." };
  for (const a of arrivals) if (a.item.received + a.q > a.item.quantity * 1.1) return { error: `More ${a.item.material.name} than was ordered.` };

  const after = po.items.map((i) => ({ ...i, received: i.received + (arrivals.find((a) => a.item.id === i.id)?.q ?? 0) }));
  const status = poStatusAfterDelivery(after);
  await db.$transaction([
    ...arrivals.flatMap((a) => [
      db.purchaseOrderItem.update({ where: { id: a.item.id }, data: { received: { increment: a.q } } }),
      db.materialMovement.create({ data: { materialId: a.item.materialId, kind: "RECEIVED", quantity: a.q, note: note ?? `PO-${po.number}`, poItemId: a.item.id, userId: user.id } }),
    ]),
    db.purchaseOrder.update({ where: { id: po.id }, data: { status } }),
  ]);
  const summary = arrivals.map((a) => `${a.q} ${a.item.material.unit} ${a.item.material.name}`).join(", ");
  await audit(user.id, `received ${summary} on PO-${po.number}`, "PurchaseOrder", po.id, project.id, note ? { note } : undefined);
  await notifyProjectRoles(project.id, ["MANAGER"], { title: `Delivery received: PO-${po.number}`, body: `${summary} from ${po.supplier}.${status === "RECEIVED" ? " The order is complete." : ""}`, href: `/projects/${project.id}/materials` }, user.id);
  refresh(project.id);
  return { success: status === "RECEIVED" ? "Delivery logged. Order complete." : "Delivery logged." };
}

/** Log material used on site (or a stock count correction). Warns when stock falls to the reorder level. */
export async function recordMovement(projectId: string, _: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const project = await getProjectForUser(user, projectId);
  if (!canReceive(user.role)) return { error: "Only the supervisor or manager can log materials." };
  const material = await db.material.findFirst({ where: { id: String(form.get("materialId") ?? ""), projectId: project.id }, include: { movements: true } });
  if (!material) return { error: "Pick a material." };
  const kind = form.get("kind") === "ADJUSTED" ? "ADJUSTED" : "USED";
  const q = qty(form.get("quantity"));
  if (!q) return { error: "Enter a quantity." };
  const before = stockOf(material.movements);
  if (kind === "USED" && q > before) return { error: `Only ${before} ${material.unit} in stock.` };
  const note = String(form.get("note") ?? "").trim() || null;
  await db.materialMovement.create({ data: { materialId: material.id, kind, quantity: q, note, userId: user.id } });
  const after = kind === "USED" ? before - q : before + q;
  await audit(user.id, `${kind === "USED" ? "used" : "added"} ${q} ${material.unit} of ${material.name}`, "Material", material.id, project.id, note ? { note } : undefined);
  if (kind === "USED" && before > material.reorderAt && after <= material.reorderAt) {
    await notifyProjectRoles(project.id, ["MANAGER"], { title: `Low stock: ${material.name}`, body: `${after} ${material.unit} left on ${project.name}. Reorder level is ${material.reorderAt}.`, href: `/projects/${project.id}/materials` });
  }
  refresh(project.id);
  return { success: `Logged. ${after} ${material.unit} in stock.` };
}

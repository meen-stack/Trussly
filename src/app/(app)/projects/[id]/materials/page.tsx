import type { Metadata } from "next";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth";
import { getProjectForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatMoney, formatUnitPrice } from "@/lib/money";
import { canReceive, poReceivedValue, poTotal, stockOf } from "@/lib/commercial";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Select, Stat } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { InlineForm } from "@/components/decision-form";
import { addMaterial, createPurchaseOrder, decidePurchaseOrder, receiveDelivery, recordMovement } from "@/app/actions/materials";

export const metadata: Metadata = { title: "Materials & orders" };

const PO_LABEL = {
  PENDING_APPROVAL: ["Awaiting owner", "warn"],
  ISSUED: ["Issued", "brand"],
  PARTIALLY_RECEIVED: ["Partly delivered", "warn"],
  RECEIVED: ["Delivered", "ok"],
  CANCELLED: ["Cancelled", "neutral"],
} as const;

const fmtQty = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

export default async function MaterialsPage({ params }: PageProps<"/projects/[id]/materials">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getProjectForUser(user, id);
  const { currency, approvalThreshold: threshold } = user.company;
  const [materials, orders, lines] = await Promise.all([
    db.material.findMany({
      where: { projectId: project.id },
      include: { movements: { include: { user: { select: { name: true } } }, orderBy: { createdAt: "desc" } }, orderLines: { include: { purchaseOrder: { select: { status: true } } } } },
      orderBy: { name: "asc" },
    }),
    db.purchaseOrder.findMany({ where: { projectId: project.id }, include: { items: { include: { material: true } }, budgetLine: true, createdBy: true, invoices: true }, orderBy: { number: "desc" } }),
    db.budgetLine.findMany({ where: { projectId: project.id }, orderBy: { category: "asc" } }),
  ]);
  const open = orders.filter((o) => o.status === "ISSUED" || o.status === "PARTIALLY_RECEIVED" || o.status === "PENDING_APPROVAL");
  const stock = materials.map((m) => {
    const onHand = stockOf(m.movements);
    const onOrder = m.orderLines.filter((l) => ["ISSUED", "PARTIALLY_RECEIVED"].includes(l.purchaseOrder.status)).reduce((s, l) => s + Math.max(l.quantity - l.received, 0), 0);
    const used = m.movements.filter((v) => v.kind === "USED").reduce((s, v) => s + v.quantity, 0);
    return { ...m, onHand, onOrder, used, low: onHand <= m.reorderAt };
  });
  const manage = can.manageProject(user.role);
  const logger = canReceive(user.role);
  const recent = materials.flatMap((m) => m.movements.map((v) => ({ ...v, material: m }))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 12);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="On order" value={formatMoney(open.reduce((s, o) => s + poTotal(o.items) - poReceivedValue(o.items), 0), currency)} sub={`${open.length} open purchase order${open.length === 1 ? "" : "s"}`} />
        <Stat label="Delivered" value={formatMoney(orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + poReceivedValue(o.items), 0), currency)} />
        <Stat label="Materials tracked" value={materials.length} />
        <Stat label="Low stock" value={stock.filter((s) => s.low).length} tone={stock.some((s) => s.low) ? "warn" : undefined} sub="At or below reorder level" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Stock on site" subtitle="Delivered minus used. Deliveries come in against purchase orders." />
          {stock.length === 0 ? (
            <EmptyState title="No materials yet" body="Add the materials you want to track, then raise purchase orders for them." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2 font-medium">Material</th>
                    <th className="px-3 py-2 text-right font-medium">In stock</th>
                    <th className="px-3 py-2 text-right font-medium">On order</th>
                    <th className="px-3 py-2 text-right font-medium">Used</th>
                    <th className="px-5 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {stock.map((m) => (
                    <tr key={m.id}>
                      <td className="px-5 py-3 font-medium">{m.name}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">{fmtQty(m.onHand)} <span className="text-muted">{m.unit}</span></td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-muted">{m.onOrder ? fmtQty(m.onOrder) : "–"}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-muted">{fmtQty(m.used)}</td>
                      <td className="px-5 py-3 text-right">{m.low ? <Badge tone={m.onOrder ? "brand" : "warn"}>{m.onOrder ? "Low, on order" : "Reorder"}</Badge> : <Badge tone="ok">OK</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6 self-start">
          {logger && stock.length > 0 && (
            <Card>
              <CardHeader title="Log material use" />
              <div className="p-5">
                <ActionForm action={recordMovement.bind(null, project.id)} submitLabel="Log">
                  <Field label="Material">
                    <Select name="materialId" required defaultValue="">
                      <option value="" disabled>Choose…</option>
                      {stock.map((m) => <option key={m.id} value={m.id}>{m.name} ({fmtQty(m.onHand)} {m.unit})</option>)}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantity"><Input name="quantity" inputMode="decimal" required /></Field>
                    <Field label="Type">
                      <Select name="kind" defaultValue="USED">
                        <option value="USED">Used</option>
                        <option value="ADJUSTED">Count correction (+)</option>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Where / note"><Input name="note" placeholder="Level 2 slab" /></Field>
                </ActionForm>
              </div>
            </Card>
          )}
          {(manage || user.role === "SUPERVISOR") && (
            <Card>
              <CardHeader title="Track a material" />
              <div className="p-5">
                <ActionForm action={addMaterial.bind(null, project.id)} submitLabel="Add material">
                  <Field label="Name"><Input name="name" placeholder="Rebar #5" required /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Unit"><Input name="unit" placeholder="tons" required /></Field>
                    <Field label="Reorder at"><Input name="reorderAt" inputMode="decimal" placeholder="2" /></Field>
                  </div>
                </ActionForm>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Purchase orders</h2>
          {orders.length === 0 && <Card><EmptyState title="No purchase orders yet" /></Card>}
          {orders.map((o) => {
            const total = poTotal(o.items);
            const invoiced = o.invoices.filter((i) => i.status !== "REJECTED").reduce((s, i) => s + i.amount, 0);
            const [label, tone] = PO_LABEL[o.status];
            const receivable = logger && (o.status === "ISSUED" || o.status === "PARTIALLY_RECEIVED");
            return (
              <Card key={o.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted">PO-{o.number} · {o.budgetLine.category}{o.expectedAt ? ` · due ${format(o.expectedAt, "MMM d")}` : ""}</p>
                    <h3 className="font-display font-semibold">{o.supplier}</h3>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatMoney(total, currency)}</p>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {o.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap justify-between gap-2">
                      <span>{fmtQty(i.quantity)} {i.material.unit} {i.material.name} <span className="text-muted">@ {formatUnitPrice(i.unitPrice, currency)}</span></span>
                      <span className={i.received >= i.quantity ? "text-ok" : "text-muted"}>{fmtQty(i.received)} delivered</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">Raised by {o.createdBy.name}, {format(o.createdAt, "MMM d")} · {formatMoney(invoiced, currency)} invoiced</p>
                {o.status === "PENDING_APPROVAL" && user.role === "OWNER" && (
                  <form action={decidePurchaseOrder.bind(null, project.id, o.id)} className="mt-3 flex gap-2">
                    <Button name="decision" value="approve" variant="success">Approve order</Button>
                    <Button name="decision" value="cancel" variant="danger">Cancel</Button>
                  </form>
                )}
                {receivable && (
                  <details className="mt-3 rounded-lg border border-line bg-bg p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Receive a delivery</summary>
                    <InlineForm action={receiveDelivery.bind(null, project.id, o.id)} submitLabel="Log delivery">
                      {o.items.map((i) => (
                        <label key={i.id} className="flex items-center justify-between gap-3">
                          <span className="text-xs">{i.material.name} ({fmtQty(Math.max(i.quantity - i.received, 0))} {i.material.unit} outstanding)</span>
                          <Input name={`recv_${i.id}`} inputMode="decimal" placeholder="0" className="max-w-24" />
                        </label>
                      ))}
                      <Input name="note" placeholder="Delivery note number (optional)" />
                    </InlineForm>
                  </details>
                )}
                {manage && o.status === "ISSUED" && o.items.every((i) => i.received === 0) && (
                  <form action={decidePurchaseOrder.bind(null, project.id, o.id)} className="mt-2">
                    <button name="decision" value="cancel" className="text-xs text-muted hover:text-bad">Cancel this order</button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-6 self-start">
          {manage && stock.length > 0 && (
            <Card>
              <CardHeader title="Raise a purchase order" subtitle={user.role === "MANAGER" ? `Orders over ${formatMoney(threshold, currency)} wait for the owner.` : undefined} />
              <div className="p-5">
                <ActionForm action={createPurchaseOrder.bind(null, project.id)} submitLabel="Raise order">
                  <Field label="Supplier"><Input name="supplier" placeholder="Metro Building Supply" required /></Field>
                  <Field label="Budget line">
                    <Select name="budgetLineId" required defaultValue="">
                      <option value="" disabled>Choose…</option>
                      {lines.map((l) => <option key={l.id} value={l.id}>{l.category}</option>)}
                    </Select>
                  </Field>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="space-y-2 rounded-lg border border-line p-3">
                      <Select name={`material${i}`} defaultValue="" aria-label={`Line ${i + 1} material`}>
                        <option value="">{i === 0 ? "Material…" : "Another material (optional)"}</option>
                        {stock.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                      </Select>
                      <div className="grid grid-cols-2 gap-2">
                        <Input name={`qty${i}`} inputMode="decimal" placeholder="Qty" aria-label="Quantity" />
                        <Input name={`price${i}`} inputMode="decimal" placeholder="Unit price" aria-label="Unit price" />
                      </div>
                    </div>
                  ))}
                  <Field label="Expected delivery"><Input name="expectedAt" type="date" /></Field>
                </ActionForm>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Recent movements" />
            {recent.length === 0 ? (
              <EmptyState title="Nothing logged yet" />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {recent.map((v) => (
                  <li key={v.id} className="px-5 py-2.5">
                    <p>
                      <span className={v.kind === "USED" ? "text-bad" : "text-ok"}>{v.kind === "USED" ? "−" : "+"}{fmtQty(v.quantity)}</span> {v.material.unit} {v.material.name}
                    </p>
                    <p className="text-xs text-muted">{v.user.name} · {format(v.createdAt, "MMM d")}{v.note ? ` · ${v.note}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

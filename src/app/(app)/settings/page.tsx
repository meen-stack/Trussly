import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { updateApprovals, updateCompany } from "@/app/actions/account";
import { DELEGABLE_ROLES } from "@/lib/release";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const c = user.company;
  const editable = user.role === "OWNER" || user.role === "ADMIN";
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-3xl gap-6">
        <Card className="p-6">
          <h2 className="font-display font-semibold">Your account</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-muted">Email</dt>
              <dd className="font-medium break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted">Role</dt>
              <dd className="font-medium">{ROLE_LABEL[user.role]}</dd>
            </div>
          </dl>
        </Card>
        {user.role === "OWNER" && (
          <Card className="p-6">
            <h2 className="font-display mb-4 font-semibold">Payment approvals</h2>
            <ActionForm action={updateApprovals} submitLabel="Save approvals">
              <Field label={`Two people must confirm payments from (${c.currency})`} hint="0 means every payment. You plus a manager or the accountant.">
                <Input name="twoFrom" defaultValue={(c.twoPersonFrom / 100).toFixed(0)} inputMode="decimal" />
              </Field>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">Can sign for you when you&apos;re away</legend>
                {DELEGABLE_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="delegateRoles" value={r} defaultChecked={c.ownerDelegateRoles.includes(r)} className="accent-[#ffc107]" /> {ROLE_LABEL[r]}
                  </label>
                ))}
              </fieldset>
              <Field label="Until (optional)">
                <Input name="delegationEndsAt" type="date" defaultValue={c.delegationEndsAt ? c.delegationEndsAt.toISOString().slice(0, 10) : ""} />
              </Field>
            </ActionForm>
          </Card>
        )}
        <Card className="p-6">
          <h2 className="font-display mb-4 font-semibold">Company</h2>
          {editable ? (
            <ActionForm action={updateCompany} submitLabel="Save settings">
              <Field label="Company name">
                <Input name="name" defaultValue={c.name} required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Currency">
                  <Select name="currency" defaultValue={c.currency}>
                    <option value="USD">US dollar (USD)</option>
                    <option value="NGN">Nigerian naira (NGN)</option>
                    <option value="GBP">British pound (GBP)</option>
                    <option value="EUR">Euro (EUR)</option>
                  </Select>
                </Field>
                <Field label="Owner approval limit">
                  <Input name="threshold" defaultValue={(c.approvalThreshold / 100).toFixed(0)} inputMode="decimal" />
                </Field>
              </div>
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">Only owners and admins can change company settings.</p>
          )}
        </Card>
      </div>
    </>
  );
}

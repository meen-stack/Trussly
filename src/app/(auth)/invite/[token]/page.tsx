import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { acceptInvite } from "@/app/actions/auth";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Join your team" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await db.invite.findUnique({ where: { token }, include: { company: true } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold">This invite has expired</h1>
        <p className="mt-2 text-muted">Ask the person who invited you to send a new link.</p>
      </div>
    );
  }
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Join {invite.company.name}</h1>
      <p className="mt-2 text-muted">
        You&apos;ve been invited as a {ROLE_LABEL[invite.role].toLowerCase()} ({invite.email}).
      </p>
      <ActionForm action={acceptInvite} submitLabel="Join team" className="mt-8 space-y-4" buttonClassName="w-full">
        <input type="hidden" name="token" value={token} />
        <Field label="Your name">
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </ActionForm>
    </div>
  );
}

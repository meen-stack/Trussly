import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { resetPassword } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Choose a new password</h1>
      <ActionForm action={resetPassword} submitLabel="Save password" className="mt-8 space-y-4" buttonClassName="w-full">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </ActionForm>
    </div>
  );
}

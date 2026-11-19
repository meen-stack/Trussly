import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { forgotPassword } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-muted">We&apos;ll email you a link to choose a new one.</p>
      <ActionForm action={forgotPassword} submitLabel="Send reset link" pendingLabel="Sending…" className="mt-8 space-y-4" buttonClassName="w-full">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-brand hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}

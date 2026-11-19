import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { signup } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Start tracking your build</h1>
      <p className="mt-2 text-muted">Create your company workspace. You can invite your team next.</p>
      <ActionForm action={signup} submitLabel="Create account" pendingLabel="Creating…" className="mt-8 space-y-4" buttonClassName="w-full">
        <Field label="Your name">
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Company">
          <Input name="company" autoComplete="organization" required />
        </Field>
        <Field label="Work email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}

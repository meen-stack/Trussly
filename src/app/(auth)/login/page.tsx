import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { DemoPicker } from "@/components/demo-picker";
import { login } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-muted">Log in to check on your sites.</p>
      <ActionForm action={login} submitLabel="Log in" pendingLabel="Logging in…" className="mt-8 space-y-4" buttonClassName="w-full">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="text-right text-sm">
          <Link href="/forgot-password" className="text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        New to BuildTrace?{" "}
        <Link href="/signup" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
      <div className="mt-10 border-t border-line pt-6">
        <p className="mb-3 text-sm font-medium">Or explore the demo as…</p>
        <DemoPicker compact />
      </div>
    </div>
  );
}

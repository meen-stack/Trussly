import Link from "next/link";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { DemoPicker } from "@/components/demo-picker";
import { login } from "@/app/actions/auth";

export const metadata: Metadata = { title: "Log in" };

const DEMO_NOTE = "No sign-up needed. Pick a role and you're in.";

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
          <Link href="/forgot-password" className="text-brand-text hover:underline">
            Forgot password?
          </Link>
        </div>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        New to Trussly?{" "}
        <Link href="/signup" className="font-medium text-brand-text hover:underline">
          Create an account
        </Link>
      </p>
      <div className="mt-10 border-t border-line pt-6">
        <p className="text-sm font-medium">Or explore the demo as…</p>
        <p className="mt-1 mb-3 text-xs text-muted">{DEMO_NOTE}</p>
        <DemoPicker compact />
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/about" className="hover:text-ink hover:underline">
            What is Trussly? Take the tour
          </Link>
        </p>
      </div>
    </div>
  );
}

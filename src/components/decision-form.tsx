"use client";

import { useActionState } from "react";
import { PenLine } from "lucide-react";
import { Button, FormError, Input, Textarea } from "./ui";

type State = { error?: string; success?: string } | undefined;

/** Approve (optionally with a typed-name signature) or reject with a note. */
export function DecisionForm({
  action,
  signAs,
  approveLabel = "Approve",
  rejectLabel = "Reject",
  notePlaceholder = "Note (required to reject)",
}: {
  action: (s: State, f: FormData) => Promise<State>;
  signAs?: string;
  approveLabel?: string;
  rejectLabel?: string;
  notePlaceholder?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.success) return <p className="mt-3 rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm text-ok">{state.success}</p>;
  return (
    <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-line bg-bg p-3">
      <Textarea name="note" rows={2} placeholder={notePlaceholder} />
      {signAs && (
        <label className="block space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <PenLine className="h-3.5 w-3.5" /> Sign to approve: type your full name
          </span>
          <Input name="signature" placeholder={signAs} autoComplete="off" className="font-display italic" />
        </label>
      )}
      <FormError message={state?.error} />
      <div className="flex flex-wrap gap-2">
        <Button name="decision" value="approve" variant="success" disabled={pending}>
          {approveLabel}
        </Button>
        <Button name="decision" value="reject" variant="danger" disabled={pending}>
          {rejectLabel}
        </Button>
      </div>
    </form>
  );
}

/** A text form whose success message replaces it (used for signing, rating, replying). */
export function InlineForm({ action, children, submitLabel, variant = "primary" }: { action: (s: State, f: FormData) => Promise<State>; children: React.ReactNode; submitLabel: string; variant?: "primary" | "secondary" | "success" }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.success) return <p className="mt-2 rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm text-ok">{state.success}</p>;
  return (
    <form action={formAction} className="mt-2 space-y-2">
      {children}
      <FormError message={state?.error} />
      <Button variant={variant} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

/** A form whose own buttons (with name/value) submit it; shows errors and success inline. */
export function ButtonsForm({ action, children, className = "mt-3 space-y-2" }: { action: (s: State, f: FormData) => Promise<State>; children: React.ReactNode; className?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className} aria-busy={pending}>
      <fieldset disabled={pending} className="space-y-2">
        {children}
      </fieldset>
      <FormError message={state?.error} />
      {state?.success && <p className="rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm text-ok">{state.success}</p>}
    </form>
  );
}

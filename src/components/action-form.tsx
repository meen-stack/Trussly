"use client";

import { useActionState, type ReactNode } from "react";
import { Button, FormError } from "./ui";

type State = { error?: string; success?: string } | undefined;

/** A form bound to a server action, with pending state and inline error/success messages. */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Saving…",
  className = "space-y-4",
  buttonClassName,
}: {
  action: (state: State, form: FormData) => Promise<State>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <FormError message={state?.error} />
      {state?.success && (
        <p className="rounded-lg border border-ok/20 bg-ok/5 px-3 py-2 text-sm break-words text-ok">{state.success}</p>
      )}
      <Button type="submit" disabled={pending} className={buttonClassName}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </form>
  );
}

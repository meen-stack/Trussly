"use client";

import { useActionState, useState } from "react";
import type { WorkAction } from "@/lib/workflow";
import { Button, FormError, Input, Textarea } from "./ui";

type State = { error?: string; success?: string } | undefined;
type Action = (s: State, f: FormData) => Promise<State>;

const COPY: Record<WorkAction, { button: string; variant: "primary" | "success" | "danger" | "secondary"; form?: { placeholder: string; submit: string } }> = {
  start: { button: "Start work", variant: "secondary" },
  submit: { button: "Submit completed work", variant: "primary", form: { placeholder: "What was completed?", submit: "Submit for inspection" } },
  pass: { button: "Pass inspection", variant: "success" },
  fail: { button: "Needs corrections", variant: "danger", form: { placeholder: "What needs fixing?", submit: "Send back for corrections" } },
  approve: { button: "Approve work", variant: "success" },
  return: { button: "Send back", variant: "secondary", form: { placeholder: "What needs fixing?", submit: "Send back for corrections" } },
  finalApprove: { button: "Give final approval", variant: "success" },
  reject: { button: "Reject", variant: "danger", form: { placeholder: "Why is this work rejected?", submit: "Reject work" } },
};

/** Buttons for whichever verification steps this user can take right now. */
export function WorkActions({ action, options }: { action: Action; options: WorkAction[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [mode, setMode] = useState<WorkAction | null>(null);
  if (options.length === 0) return null;

  if (mode && COPY[mode].form) {
    const c = COPY[mode];
    return (
      <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-line bg-bg p-3">
        <input type="hidden" name="action" value={mode} />
        {mode === "submit" && <Input name="photos" type="file" accept="image/*" capture="environment" multiple required aria-label="Photos of the completed work" />}
        <Textarea name="note" rows={2} placeholder={c.form!.placeholder} required={mode !== "submit"} />
        <FormError message={state?.error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} variant={c.variant === "secondary" ? "primary" : c.variant}>
            {pending ? "Saving…" : c.form!.submit}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="mt-3 flex flex-wrap gap-2">
      {options.map((a) =>
        COPY[a].form ? (
          <Button key={a} type="button" variant={COPY[a].variant} onClick={() => setMode(a)}>
            {COPY[a].button}
          </Button>
        ) : (
          <Button key={a} name="action" value={a} variant={COPY[a].variant} disabled={pending}>
            {COPY[a].button}
          </Button>
        ),
      )}
      <FormError message={state?.error} />
    </form>
  );
}

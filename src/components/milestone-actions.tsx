"use client";

import { useActionState, useState } from "react";
import { Button, FormError, Input, Textarea } from "./ui";

type State = { error?: string; success?: string } | undefined;
type Action = (s: State, f: FormData) => Promise<State>;

/** Buttons for whichever milestone steps this user can take right now. */
export function MilestoneActions({ action, options }: { action: Action; options: ("submit" | "pass" | "reject" | "signOff")[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [mode, setMode] = useState<null | "submit" | "reject">(null);
  if (options.length === 0) return null;

  if (mode) {
    return (
      <form action={formAction} className="mt-3 space-y-2 rounded-lg border border-line bg-bg p-3">
        <input type="hidden" name="action" value={mode} />
        {mode === "submit" && <Input name="photos" type="file" accept="image/*" multiple required />}
        <Textarea name="note" rows={2} placeholder={mode === "submit" ? "What was completed?" : "Why is it being rejected?"} required={mode === "reject"} />
        <FormError message={state?.error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} variant={mode === "reject" ? "danger" : "primary"}>
            {pending ? "Saving…" : mode === "submit" ? "Submit for inspection" : "Reject"}
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
      {options.includes("submit") && (
        <Button type="button" onClick={() => setMode("submit")}>
          Mark done
        </Button>
      )}
      {options.includes("pass") && (
        <Button name="action" value="pass" variant="success" disabled={pending}>
          Pass inspection
        </Button>
      )}
      {options.includes("signOff") && (
        <Button name="action" value="signOff" variant="success" disabled={pending}>
          Sign off & release payment
        </Button>
      )}
      {options.includes("reject") && (
        <Button type="button" variant="danger" onClick={() => setMode("reject")}>
          Reject
        </Button>
      )}
      <FormError message={state?.error} />
    </form>
  );
}

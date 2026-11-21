"use client";

import { useActionState, useState } from "react";
import { Button, FormError, Input, Textarea } from "./ui";

type State = { error?: string; success?: string } | undefined;
type Action = (s: State, f: FormData) => Promise<State>;
export type InvoiceOption = "approve" | "reject" | "process" | "pay" | "rejectPayment";

/** Buttons for whichever invoice or payment steps this user can take right now. */
export function InvoiceActions({ decide, pay, options, balance }: { decide: Action; pay: Action; options: InvoiceOption[]; balance: string }) {
  const [mode, setMode] = useState<null | "reject" | "pay" | "rejectPayment">(null);
  // Close the open form once the server accepts it.
  const closeOnSuccess = (run: Action): Action => async (s, f) => {
    const result = await run(s, f);
    if (result?.success) setMode(null);
    return result;
  };
  const [dState, decideAction, dPending] = useActionState(closeOnSuccess(decide), undefined);
  const [pState, payAction, pPending] = useActionState(closeOnSuccess(pay), undefined);
  if (options.length === 0) return null;
  const error = dState?.error ?? pState?.error;
  const pending = dPending || pPending;

  if (mode === "reject") {
    return (
      <form action={decideAction} className="mt-2 space-y-2">
        <input type="hidden" name="decision" value="reject" />
        <Textarea name="note" rows={2} placeholder="Why is it rejected?" required />
        <FormError message={dState?.error} />
        <div className="flex gap-2">
          <Button variant="danger" disabled={pending} className="px-3 py-1 text-xs">Reject invoice</Button>
          <Button type="button" variant="ghost" className="px-3 py-1 text-xs" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      </form>
    );
  }
  if (mode === "pay" || mode === "rejectPayment") {
    return (
      <form action={payAction} className="mt-2 space-y-2">
        <input type="hidden" name="action" value={mode} />
        {mode === "pay" ? (
          <>
            <Input name="amount" inputMode="decimal" defaultValue={balance} aria-label="Amount paid" required />
            <Input name="reference" placeholder="Payment reference (optional)" />
          </>
        ) : (
          <Textarea name="note" rows={2} placeholder="Why is the payment refused?" required />
        )}
        <FormError message={pState?.error} />
        <div className="flex gap-2">
          <Button variant={mode === "pay" ? "success" : "danger"} disabled={pending} className="px-3 py-1 text-xs">
            {mode === "pay" ? "Record payment" : "Refuse payment"}
          </Button>
          <Button type="button" variant="ghost" className="px-3 py-1 text-xs" onClick={() => setMode(null)}>Cancel</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap justify-end gap-1">
      {options.includes("approve") && (
        <form action={decideAction}>
          <Button name="decision" value="approve" variant="success" disabled={pending} className="px-3 py-1 text-xs">Approve</Button>
        </form>
      )}
      {options.includes("reject") && <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => setMode("reject")}>Reject</Button>}
      {options.includes("process") && (
        <form action={payAction}>
          <Button name="action" value="process" variant="secondary" disabled={pending} className="px-3 py-1 text-xs">Start processing</Button>
        </form>
      )}
      {options.includes("pay") && <Button variant="success" className="px-3 py-1 text-xs" onClick={() => setMode("pay")}>Record payment</Button>}
      {options.includes("rejectPayment") && <Button variant="danger" className="px-3 py-1 text-xs" onClick={() => setMode("rejectPayment")}>Refuse</Button>}
      {error && <div className="w-full"><FormError message={error} /></div>}
    </div>
  );
}

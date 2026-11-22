"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
import { cancelInvite, resendInvite } from "@/app/actions/auth";

const iconButton = "flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-medium hover:bg-bg disabled:opacity-50";

/** Copy the join link, email it again, or cancel a pending invite. */
export function InviteActions({ inviteId, link }: { inviteId: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const [state, resend, pending] = useActionState(resendInvite, undefined);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt("Copy this link", link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" onClick={copy} className={iconButton}>
        {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <form action={resend}>
        <input type="hidden" name="inviteId" value={inviteId} />
        <button className={iconButton} disabled={pending}>
          <Mail className="h-3.5 w-3.5" />
          {pending ? "Sending…" : "Email again"}
        </button>
      </form>
      <form action={cancelInvite}>
        <input type="hidden" name="inviteId" value={inviteId} />
        <button className={`${iconButton} text-muted`} aria-label="Cancel invite" title="Cancel invite">
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
      {state?.success && <span className="text-xs text-ok">{state.success}</span>}
      {state?.error && <span className="text-xs text-bad">{state.error}</span>}
    </div>
  );
}

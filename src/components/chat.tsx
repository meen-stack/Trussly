"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { FormError } from "./ui";
import { MediaPicker } from "./media";

type State = { error?: string; success?: string } | undefined;

function hasMedia(form: HTMLFormElement | null) {
  const files = form?.querySelector<HTMLInputElement>('input[name="media"]')?.files;
  return Boolean(form?.querySelector('input[name="mediaUrl"]') || files?.length);
}

/** Message box: Enter sends, Shift+Enter adds a line. */
export function ChatComposer({ action, folder, direct }: { action: (s: State, f: FormData) => Promise<State>; folder: string; direct: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [uploading, setUploading] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={formAction} className="relative border-t border-line p-3">
      <FormError message={state?.error} />
      <div className="flex items-end gap-2">
        <MediaPicker name="media" folder={folder} direct={direct} compact label="Attach photos or videos" onBusyChange={setUploading} />
        <textarea
          name="body"
          rows={1}
          placeholder="Write a message…"
          aria-label="Message"
          className="max-h-40 min-h-10 flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!uploading && (e.currentTarget.value.trim() || hasMedia(form.current))) form.current?.requestSubmit();
            }
          }}
        />
        <button disabled={pending || uploading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-ink hover:bg-[#ffb300] disabled:opacity-50" aria-label="Send">
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

/** Keeps a chat fresh without a socket server: re-renders from the server every few seconds while visible. */
export function LiveRefresh({ every = 5000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

/** Scrolls the message list to the newest message when it changes. */
export function ScrollToEnd({ marker }: { marker: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [marker]);
  return <div ref={ref} />;
}

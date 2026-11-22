"use client";

import { useEffect, useState } from "react";
import type { Role } from "@prisma/client";
import {
  BarChart3, Camera, CheckSquare, ClipboardList, FileSignature, HardHat, LayoutDashboard, Menu, MessageCircle, Package, PartyPopper, Receipt, Wallet,
} from "lucide-react";
import { cn } from "./ui";

type Step = { Icon: typeof Menu; title: string; text: string };

const WELCOME: Step = { Icon: LayoutDashboard, title: "Welcome to Trussly", text: "Your sites, from work done to money paid." };
const MENU: Step = { Icon: Menu, title: "Everything is in the menu", text: "Tap ☰ on your phone, or use the sidebar." };
const CHAT: Step = { Icon: MessageCircle, title: "Talk to the team", text: "Chat one to one, in groups or per project." };
const DONE: Step = { Icon: PartyPopper, title: "You're set", text: "Reopen this tour anytime from the menu." };

const STEPS: Record<Role, Step[]> = {
  OWNER: [
    { Icon: LayoutDashboard, title: "All sites at a glance", text: "Spend, progress and risks on one screen." },
    { Icon: CheckSquare, title: "Approve the big items", text: "Work, invoices and changes over your limit." },
    { Icon: BarChart3, title: "See the numbers", text: "Forecasts and contractor scores in Analytics." },
  ],
  ADMIN: [
    { Icon: LayoutDashboard, title: "All sites at a glance", text: "Spend, progress and risks on one screen." },
    { Icon: CheckSquare, title: "Approvals", text: "Everything waiting on you, in one list." },
  ],
  MANAGER: [
    { Icon: HardHat, title: "Approve work", text: "Inspected work comes to you to sign off." },
    { Icon: Receipt, title: "Invoices and changes", text: "Approve invoices and price change orders." },
    { Icon: Package, title: "Materials", text: "Order, receive and track stock on site." },
  ],
  SUPERVISOR: [
    { Icon: ClipboardList, title: "Daily report", text: "Weather, crew, progress and photos, in a minute." },
    { Icon: HardHat, title: "Inspect work", text: "Pass it, or send it back with a note." },
    { Icon: Package, title: "Deliveries", text: "Log what arrives and what gets used." },
  ],
  CONTRACTOR: [
    { Icon: Camera, title: "Submit your work", text: "Add photos when a job is done." },
    { Icon: Receipt, title: "Get paid", text: "Invoice verified work and track payment." },
    { Icon: FileSignature, title: "Sign and settle", text: "Sign contracts, propose changes, raise disputes." },
  ],
  FINANCE: [
    { Icon: Wallet, title: "Pay invoices", text: "Approved invoices, most urgent first." },
    { Icon: Receipt, title: "Part payments", text: "Pay in parts. Disputed invoices stay on hold." },
    { Icon: BarChart3, title: "Reports", text: "Budget, committed and paid for each project." },
  ],
};

const KEY = (userId: string) => `trussly-tour-${userId}`;
export const openTour = () => window.dispatchEvent(new Event("trussly:tour"));

/** A short walkthrough for each role. Shows once per person on this device, with Skip; reopened from the menu. */
export function Tour({ userId, role, name }: { userId: string; role: Role; name: string }) {
  const steps = [{ ...WELCOME, title: `Hi ${name.split(" ")[0]}, welcome` }, ...STEPS[role], MENU, CHAT, DONE];
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    const show = () => {
      setI(0);
      setOpen(true);
    };
    let seen = true;
    try {
      seen = !!localStorage.getItem(KEY(userId)) || !!localStorage.getItem("trussly-tour-off");
    } catch {}
    const t = seen ? undefined : setTimeout(show, 400);
    window.addEventListener("trussly:tour", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("trussly:tour", show);
    };
  }, [userId]);

  const finish = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY(userId), new Date().toISOString());
    } catch {}
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;
  const step = steps[i];
  const last = i === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 text-center shadow-2xl">
        <div className="flex justify-end">
          {!last && (
            <button onClick={finish} className="rounded-lg px-2 py-1 text-sm font-medium text-muted hover:text-ink">
              Skip
            </button>
          )}
        </div>
        <div className="mx-auto mt-2 flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft">
          <step.Icon className="h-9 w-9 text-brand-text" />
        </div>
        <h2 className="font-display mt-5 text-xl font-semibold">{step.title}</h2>
        <p className="mt-2 text-muted">{step.text}</p>
        <div className="mt-6 flex justify-center gap-1.5" aria-hidden>
          {steps.map((_, k) => (
            <span key={k} className={cn("h-1.5 rounded-full transition-all", k === i ? "w-6 bg-brand" : "w-1.5 bg-line")} />
          ))}
        </div>
        <div className="mt-6 flex gap-2">
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium">
              Back
            </button>
          )}
          <button onClick={() => (last ? finish() : setI(i + 1))} className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink">
            {last ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Menu entry that reopens the tour. */
export function TourButton({ className, onClick, children }: { className?: string; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onClick?.();
        openTour();
      }}
    >
      {children}
    </button>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Bell, Camera, ClipboardList, LineChart, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/ui";
import { DemoPicker } from "@/components/demo-picker";
import { getCurrentUser } from "@/lib/auth";

const FEATURES = [
  {
    Icon: ClipboardList,
    title: "Daily site reports",
    body: "Supervisors file from their phone in two minutes: weather, crew, work done, issues and geotagged photos. Missing a report by 6 PM raises an alert.",
  },
  {
    Icon: BadgeCheck,
    title: "Milestone sign-off",
    body: "Contractors submit evidence, the manager inspects, the owner signs off. Payment is released only when all three agree.",
  },
  {
    Icon: Wallet,
    title: "Budget against actual",
    body: "Every invoice is approved against a budget line. Lines turn amber at 90% and red past 100%, and big invoices go to the owner.",
  },
  {
    Icon: LineChart,
    title: "Forecast final cost",
    body: "Spend and site-reported progress combine into a running forecast, so you see an overrun months before the final invoice.",
  },
  {
    Icon: Camera,
    title: "Photo timeline",
    body: "Every photo from every report and milestone, by day. Watch the building rise without getting on a plane.",
  },
  {
    Icon: ShieldCheck,
    title: "Audit trail",
    body: "Every approval, rejection and budget change is recorded with who and when. Nothing can be quietly edited later.",
  },
];

const STEPS = [
  ["Set up the project", "Budget lines, milestones tied to payments and the team, each with their own role."],
  ["Site reports daily", "The supervisor's report and photos land in the manager's queue the same afternoon."],
  ["Approve with evidence", "Invoices and milestones move through review with notes and photos attached."],
  ["Watch the numbers", "The dashboard flags projects that are behind plan or heading over budget."],
];

export default async function Landing() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="bg-surface">
      {/* Hero */}
      <section className="blueprint relative overflow-hidden bg-steel text-white">
        <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-brand/25 blur-3xl" />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <Logo dark />
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-lg px-3 py-2 text-white/80 hover:text-white">
              Log in
            </Link>
            <ButtonLink href="/signup" className="hidden sm:inline-flex">
              Start free
            </ButtonLink>
          </nav>
        </header>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-2 lg:pt-16 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Remote construction monitoring
            </p>
            <h1 className="font-display mt-5 text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
              See your site <span className="text-brand">every day</span>, from anywhere.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/70">
              BuildTrace gives developers and investors daily site reports, photo evidence, milestone sign-off and budget against actual spend,
              so overruns get caught while they&apos;re still small.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="#demo" className="px-5 py-3 text-base">
                Try the live demo
              </ButtonLink>
              <ButtonLink href="/signup" variant="secondary" className="border-white/20 bg-white/5 px-5 py-3 text-base text-white hover:bg-white/10">
                Create your workspace
              </ButtonLink>
            </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-line bg-bg">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          <Fact value="85%" label="of construction projects go over budget" />
          <Fact value="28%" label="average cost overrun on those projects" />
          <Fact value="1 day" label="is how stale your information is with BuildTrace, not 1 month" />
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted sm:px-6">
          Overrun figures: study of projects across 20 countries over 70 years, via{" "}
          <a className="underline" href="https://www.propelleraero.com/blog/10-construction-project-cost-overrun-statistics-you-need-to-hear/" target="_blank" rel="noreferrer">
            Propeller
          </a>
          .
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="font-display max-w-2xl text-3xl font-semibold sm:text-4xl">Everything between the site and the money, in one place.</h2>
        <p className="mt-3 max-w-2xl text-muted">Built around how construction actually gets paid for: evidence first, then approval, then payment.</p>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="bg-surface p-7">
              <Icon className="h-6 w-6 text-brand" />
              <h3 className="font-display mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-bg">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="font-display flex h-10 w-10 items-center justify-center rounded-full bg-steel font-semibold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex flex-wrap gap-6 text-sm text-muted">
            <span className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-brand" /> Works on any phone, no app to install
            </span>
            <span className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-brand" /> Email and in-app alerts
            </span>
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="blueprint scroll-mt-4 bg-steel text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">Explore the demo as any role</h2>
          <p className="mt-3 max-w-2xl text-white/70">
            Northline Developments is running three projects. Pick a person and you&apos;ll see exactly what they see, with real approvals waiting.
          </p>
          <div className="mt-10">
            <DemoPicker dark />
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <p>Built by damian1-hash · A portfolio project</p>
        </div>
      </footer>
    </div>
  );
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-5xl font-semibold text-brand">{value}</p>
      <p className="mt-2 text-muted">{label}</p>
    </div>
  );
}

/** A static, stylised preview of the project dashboard for the hero. */
function HeroPreview() {
  const lines = [
    ["Foundations", 97, "ok"],
    ["Structure", 52, "ok"],
    ["MEP", 91, "warn"],
    ["Finishes", 12, "ok"],
  ] as const;
  return (
    <div className="relative">
      <div className="rounded-2xl border border-white/10 bg-white p-5 text-ink shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted">Austin, TX</p>
            <p className="font-display font-semibold">Harbour View Residences</p>
          </div>
          <span className="rounded-full border border-warn/20 bg-warn/10 px-2 py-0.5 text-xs font-medium text-warn">Watch</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            ["36%", "complete"],
            ["$1.4M", "spent"],
            ["$4.3M", "forecast"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-lg bg-bg py-3">
              <p className="font-display text-lg font-semibold">{v}</p>
              <p className="text-xs text-muted">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {lines.map(([name, pct, tone]) => (
            <div key={name}>
              <div className="flex justify-between text-xs">
                <span>{name}</span>
                <span className="text-muted">{pct}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-bg">
                <div className={`h-full rounded-full ${tone === "warn" ? "bg-warn" : "bg-ok"}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-6 -left-4 hidden w-60 rounded-xl border border-line bg-white p-3 text-ink shadow-xl sm:block">
        <p className="text-xs font-semibold">Ready for sign-off</p>
        <p className="mt-0.5 text-xs text-muted">Ground and level 1 frame · $180,000</p>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-md bg-ok px-2 py-1 text-[11px] font-medium text-white">Sign off</span>
          <span className="rounded-md border border-line px-2 py-1 text-[11px]">View photos</span>
        </div>
      </div>
    </div>
  );
}

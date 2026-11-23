/**
 * Seeds the demo company used by the "explore the demo" buttons.
 * Dates are relative to today so the demo always looks current. Safe to re-run: it rebuilds the demo company.
 */
import { PrismaClient, type Company, type DocumentCategory, type MilestoneStatus, type ExpenseStatus, type Role, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { DEMO_EMAILS, DEMO_PASSWORD } from "../src/lib/demo";

const db = new PrismaClient();
const DAY = 864e5;
const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const daysAgo = (n: number) => new Date(today.getTime() - n * DAY);
const at = (d: Date, hour: number) => new Date(d.getTime() + hour * 3600e3);
const $ = (dollars: number) => Math.round(dollars * 100);

let seed = 1;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

const art = (progress: number, floors: number, weather: string) =>
  `/api/demo-art?progress=${progress}&seed=${Math.floor(rand() * 1e5)}&floors=${floors}&weather=${encodeURIComponent(weather)}`;

const WORK = [
  "Poured columns on grid lines C to F. Formwork struck on the floor below.",
  "Blockwork continued on the north elevation. Scaffold raised one lift.",
  "Rebar fixed for the next slab. Inspection booked with the engineer.",
  "MEP first fix in units on the lower floors. Conduit and sleeves set.",
  "Slab pour completed, 64 m³. Curing in progress, covered overnight.",
  "Stair core formwork erected. Crane lifted precast lintels into place.",
  "Waterproofing to the basement walls. Backfill started on the east side.",
  "Window frames delivered and stored. Installation started on level 1.",
];
const ISSUES = [
  "Rebar delivery arrived 2 tonnes short. Supplier promises the rest Thursday.",
  "Rain stopped concrete work after 11 AM. Half a day lost.",
  "Crane out of service for 3 hours awaiting a hydraulic part.",
  "Inspector asked for extra cover on two columns. Rework needed.",
];
const WEATHER = ["Sunny", "Sunny", "Cloudy", "Sunny", "Light rain", "Hot", "Cloudy"];
const MATERIALS = ["12 t rebar from Texas Rebar Supply", "64 m³ ready-mix concrete", "3,000 concrete blocks", "Formwork plywood, 80 sheets", "Electrical conduit and boxes", null, null];
const EQUIPMENT = ["Tower crane, concrete pump", "Tower crane, 2 mixers", "Excavator, dumper", "Scaffold hoist", "Tower crane"];
const INCIDENTS = ["Near miss: unsecured plank on level 2 scaffold. Fixed and toolbox talk held.", "Minor cut to a labourer's hand. First aid given, back at work."];
const REMARKS = ["Good productivity today. On track for the slab pour.", "Crew stretched thin. Asked the contractor for 4 more fixers.", "Housekeeping needs improving on level 1.", "Quality of blockwork is good.", null, null];

async function main() {
  // On deploys we only seed once, so visitors' changes aren't wiped by every build.
  // Checking the newest demo account (not just the company) means deploys that add demo data reseed once.
  // Bump this marker account when new demo data must reseed on deploy.
  if (process.argv.includes("--if-missing") && (await db.user.findUnique({ where: { email: "priya@demo.trussly.app" } }))) {
    console.log("Demo company already exists, skipping seed.");
    return;
  }
  const demoUsers = await db.user.findMany({ where: { email: { endsWith: "@demo.trussly.app" } }, select: { id: true } });
  await db.nameChange.deleteMany({ where: { changedById: { in: demoUsers.map((u) => u.id) } } });
  // The audit trail blocks deleting the people in it, so the demo reset clears the demo's own trail first.
  await db.auditEvent.deleteMany({ where: { actorId: { in: demoUsers.map((u) => u.id) } } });
  // Projects first: deleting them cascades reports and invoices, which reference users.
  await db.project.deleteMany({ where: { company: { name: "Northline Developments" } } });
  await db.company.deleteMany({ where: { name: "Northline Developments" } });
  await db.user.deleteMany({ where: { email: { endsWith: "@demo.trussly.app" } } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const company = await db.company.create({ data: { name: "Northline Developments", currency: "USD", approvalThreshold: $(10000) } });

  const mk = (name: string, role: Role, email: string, title: string) =>
    db.user.create({ data: { name, role, email, title, passwordHash, companyId: company.id } });
  const olivia = await mk("Olivia Bennett", "OWNER", DEMO_EMAILS.OWNER, "Managing Director");
  const marcus = await mk("Marcus Reid", "MANAGER", DEMO_EMAILS.MANAGER, "Senior Project Manager");
  const sam = await mk("Sam Okafor", "SUPERVISOR", DEMO_EMAILS.SUPERVISOR, "Site Supervisor");
  const carla = await mk("Carla Mendes", "CONTRACTOR", DEMO_EMAILS.CONTRACTOR, "Mendes Structural Ltd");
  const dev = await mk("Dev Patel", "SUPERVISOR", "dev@demo.trussly.app", "Site Supervisor");
  const ruth = await mk("Ruth Alvarez", "CONTRACTOR", "ruth@demo.trussly.app", "Alvarez Electrical");
  const fiona = await mk("Fiona Reyes", "FINANCE", DEMO_EMAILS.FINANCE, "Finance Officer");
  const jonah = await mk("Jonah Price", "CONTRACTOR", "jonah@demo.trussly.app", "Price Roofing Co.");
  const priya = await mk("Priya Shah", "SUPERVISOR", "priya@demo.trussly.app", "Site Supervisor");

  // Work items: title, deadline (days from today), value, work status, assignee, invoice, notes.
  type Inv = { status: ExpenseStatus; paidShare?: number; dueIn?: number; note?: string };
  type Work = { title: string; due: number; value: number; status: MilestoneStatus; who: User | null; line: string; inv?: Inv; note?: string };
  type Spec = {
    name: string;
    location: string;
    description: string;
    start: number; // days ago
    end: number; // days from now
    floors: number;
    progress: number; // today
    budget: number;
    lines: [string, number, number][]; // category, share of budget, share of that line committed
    supervisor: User;
    contractors: User[];
    reportDays: number;
    reportOffset?: number; // reports stop this many days ago (finished projects)
    status?: "ACTIVE" | "COMPLETED";
    skipToday: boolean;
    work: Work[];
    extra: [string, string, string, number, ExpenseStatus, User, string?][]; // line, vendor, description, dollars, status, submitter, note
  };

  const specs: Spec[] = [
    {
      name: "Harbour View Residences",
      location: "Austin, TX",
      description: "6-storey residential block with 24 apartments and ground-floor retail.",
      start: 140,
      end: 230,
      floors: 6,
      progress: 36,
      budget: 4_200_000,
      lines: [
        ["Site preparation", 0.05, 0.88],
        ["Foundations", 0.14, 0.97],
        ["Structure", 0.3, 0.52],
        ["Roofing", 0.08, 0],
        ["MEP", 0.18, 0.12],
        ["Finishes", 0.17, 0],
        ["Contingency", 0.08, 0.1],
      ],
      supervisor: sam,
      contractors: [carla, ruth, jonah],
      reportDays: 34,
      skipToday: false,
      work: [
        { title: "Site cleared and hoarded", due: -120, value: 60_000, status: "VERIFIED", who: carla, line: "Site preparation", inv: { status: "PAID", paidShare: 1 } },
        { title: "Foundations complete", due: -70, value: 220_000, status: "VERIFIED", who: carla, line: "Foundations", inv: { status: "PROCESSING", paidShare: 0.6, dueIn: 12 } },
        { title: "Ground and level 1 frame", due: -12, value: 180_000, status: "AWAITING_OWNER", who: carla, line: "Structure", note: "Frame checked against drawings. All columns within tolerance.", inv: { status: "SUBMITTED", dueIn: 28 } },
        { title: "Level 2 slab poured", due: 2, value: 150_000, status: "SUBMITTED", who: carla, line: "Structure", note: "Slab poured and cured. Cube test results attached." },
        { title: "Electrical first fix, levels 1 and 2", due: -3, value: 9_500, status: "INSPECTED", who: ruth, line: "MEP", note: "All circuits tested. Certificates on site." },
        { title: "Level 3 and 4 frame", due: 45, value: 220_000, status: "IN_PROGRESS", who: carla, line: "Structure" },
        { title: "Roof watertight", due: 110, value: 160_000, status: "NOT_STARTED", who: jonah, line: "Roofing" },
      ],
      extra: [
        ["Structure", "Texas Rebar Supply", "Rebar for level 3 slab", 8_400, "SUBMITTED", marcus],
        ["MEP", "Alvarez Electrical", "Cable and switchgear supply", 23_750, "OWNER_REVIEW", ruth],
      ],
    },
    {
      name: "Riverside Medical Centre",
      location: "Houston, TX",
      description: "3-storey outpatient clinic with basement parking.",
      start: 210,
      end: 55,
      floors: 3,
      progress: 66,
      budget: 2_800_000,
      lines: [
        ["Site preparation", 0.04, 0.87],
        ["Foundations", 0.16, 1.04],
        ["Structure", 0.27, 1.06],
        ["Roofing", 0.07, 0.8],
        ["MEP", 0.22, 0.48],
        ["Finishes", 0.17, 0.15],
        ["Contingency", 0.07, 0.6],
      ],
      supervisor: dev,
      contractors: [carla, ruth, jonah],
      reportDays: 30,
      skipToday: true,
      work: [
        { title: "Basement and foundations", due: -150, value: 260_000, status: "VERIFIED", who: carla, line: "Foundations", inv: { status: "PAID", paidShare: 1 } },
        { title: "Structural frame", due: -60, value: 300_000, status: "VERIFIED", who: carla, line: "Structure", inv: { status: "APPROVED", dueIn: -6 } },
        { title: "Plant room roof deck", due: -95, value: 40_000, status: "VERIFIED", who: jonah, line: "Roofing", inv: { status: "PAID", paidShare: 1 } },
        { title: "Roof watertight", due: -20, value: 120_000, status: "CORRECTIONS", who: jonah, line: "Roofing", note: "Flashing incomplete at the plant room upstand. Fix and resubmit." },
        { title: "Electrical containment", due: -8, value: 8_000, status: "VERIFIED", who: ruth, line: "MEP", inv: { status: "APPROVED", dueIn: 21 } },
        { title: "MEP second fix", due: 25, value: 200_000, status: "IN_PROGRESS", who: ruth, line: "MEP" },
        { title: "Handover", due: 55, value: 180_000, status: "NOT_STARTED", who: null, line: "Finishes" },
      ],
      extra: [
        ["Finishes", "Brightwall Interiors", "Drywall materials, ground floor", 6_200, "SUBMITTED", carla],
        ["Structure", "Gulf Ready-Mix", "Concrete, invoice 2231", 4_300, "PAYMENT_REJECTED", marcus, "Duplicate of invoice 2219, already paid."],
      ],
    },
    {
      name: "Oakridge Townhomes",
      location: "San Antonio, TX",
      description: "Phase 1 of 8 two-storey townhomes.",
      start: 26,
      end: 300,
      floors: 2,
      progress: 7,
      budget: 1_650_000,
      lines: [
        ["Site preparation", 0.07, 0.86],
        ["Foundations", 0.18, 0.1],
        ["Structure", 0.25, 0],
        ["Roofing", 0.1, 0],
        ["MEP", 0.16, 0],
        ["Finishes", 0.16, 0],
        ["Contingency", 0.08, 0],
      ],
      supervisor: sam,
      contractors: [carla],
      reportDays: 18,
      skipToday: false,
      work: [
        { title: "Site cleared and services located", due: -5, value: 45_000, status: "VERIFIED", who: carla, line: "Site preparation", inv: { status: "OWNER_REVIEW", dueIn: 27 } },
        { title: "Foundations for units 1 to 4", due: 40, value: 120_000, status: "IN_PROGRESS", who: carla, line: "Foundations" },
        { title: "Units 1 to 4 framed", due: 110, value: 160_000, status: "NOT_STARTED", who: carla, line: "Structure" },
      ],
      extra: [],
    },
    {
      name: "Cedar Park Dental Clinic",
      location: "Cedar Park, TX",
      description: "Fit-out of a 6-chair dental clinic in an existing retail unit. Handed over to the client.",
      start: 150,
      end: -12,
      floors: 1,
      progress: 100,
      budget: 640_000,
      lines: [
        ["Site preparation", 0.05, 0.96],
        ["Structure", 0.12, 0.98],
        ["MEP", 0.34, 0.97],
        ["Finishes", 0.41, 0.95],
        ["Contingency", 0.08, 0.4],
      ],
      supervisor: priya,
      contractors: [carla, ruth],
      reportDays: 20,
      reportOffset: 12,
      status: "COMPLETED",
      skipToday: true,
      work: [
        { title: "Strip-out and new partitions", due: -120, value: 70_000, status: "VERIFIED", who: carla, line: "Structure", inv: { status: "PAID", paidShare: 1 } },
        { title: "Plumbing, medical gas and electrics", due: -60, value: 210_000, status: "VERIFIED", who: ruth, line: "MEP", inv: { status: "PAID", paidShare: 1 } },
        { title: "Finishes and joinery", due: -20, value: 240_000, status: "VERIFIED", who: carla, line: "Finishes", inv: { status: "PAID", paidShare: 1 } },
      ],
      extra: [],
    },
  ];

  const VENDOR_OF = (u: User) => u.title ?? u.name;
  const RANK: MilestoneStatus[] = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "INSPECTED", "AWAITING_OWNER", "VERIFIED"];
  const reached = (st: MilestoneStatus, step: MilestoneStatus) => RANK.indexOf(st) >= RANK.indexOf(step);

  for (const [pi, s] of specs.entries()) {
    const startDate = daysAgo(s.start);
    const endDate = new Date(today.getTime() + s.end * DAY);
    const project = await db.project.create({
      data: {
        name: s.name,
        location: s.location,
        description: s.description,
        startDate,
        endDate,
        companyId: company.id,
        coverUrl: art(Math.min(s.progress + 10, 100), s.floors, "Sunny"),
        status: s.status ?? "ACTIVE",
        members: { create: [marcus, s.supervisor, ...s.contractors].map((u) => ({ userId: u.id })) },
      },
    });
    const log = (actorId: string, action: string, entityType: string, entityId: string, createdAt: Date, note?: string) =>
      db.auditEvent.create({ data: { actorId, action, entityType, entityId, projectId: project.id, createdAt, detail: note ? { note } : undefined } });
    await log(olivia.id, "created the project", "Project", project.id, startDate);

    // Daily reports: Monday to Saturday, progress rising to today's figure.
    const days: Date[] = [];
    for (let d = s.reportDays; d >= (s.skipToday ? 1 : 0); d--) {
      const date = daysAgo(d + (s.reportOffset ?? 0));
      if (date.getUTCDay() !== 0) days.push(date);
    }
    const startProgress = Math.max(0, s.progress - Math.round(s.reportDays * (s.progress / Math.max(s.start, 1)) * 1.1));
    for (const [i, date] of days.entries()) {
      const progress = Math.round(startProgress + ((s.progress - startProgress) * (i + 1)) / days.length);
      const weather = pick(WEATHER);
      const issue = rand() < 0.14 ? pick(ISSUES) : null;
      const last = i === days.length - 1;
      const status = last ? "SUBMITTED" : rand() < 0.04 ? "RETURNED" : "ACCEPTED";
      const report = await db.dailyReport.create({
        data: {
          projectId: project.id,
          authorId: s.supervisor.id,
          date,
          weather,
          crewCount: 8 + Math.floor(rand() * 22),
          progress,
          workDone: pick(WORK),
          issues: issue,
          materials: pick(MATERIALS),
          equipment: pick(EQUIPMENT),
          incidents: rand() < 0.06 ? pick(INCIDENTS) : null,
          remarks: pick(REMARKS),
          status,
          reviewNote: status === "RETURNED" ? "Please add photos of the east elevation." : null,
          createdAt: at(date, 16 + rand() * 2),
          photos: {
            create: Array.from({ length: 1 + Math.floor(rand() * 2) }, () => ({
              url: art(progress, s.floors, weather),
              lat: 29.7 + pi * 0.4 + rand() * 0.01,
              lng: -95.4 - pi * 0.5 + rand() * 0.01,
              takenAt: at(date, 9 + rand() * 6),
            })),
          },
        },
      });
      await log(s.supervisor.id, `filed the daily report for ${date.toISOString().slice(0, 10)}`, "DailyReport", report.id, report.createdAt);
      if (status !== "SUBMITTED") await log(marcus.id, status === "ACCEPTED" ? "accepted a daily report" : "sent a daily report back", "DailyReport", report.id, at(date, 19));
    }

    const lineIds: Record<string, string> = {};
    const committed: Record<string, number> = {};
    for (const [category, share] of s.lines) {
      const line = await db.budgetLine.create({ data: { projectId: project.id, category, budgeted: $(s.budget * share) } });
      lineIds[category] = line.id;
      committed[category] = 0;
    }
    const pay = (expenseId: string, amount: number, paidAt: Date, i: number) =>
      db.payment.create({ data: { expenseId, amount, paidAt, reference: `ACH-${String(4100 + pi * 100 + i).padStart(5, "0")}`, recordedById: fiona.id } });

    // Work items, each with its verification history and invoice.
    for (const [i, w] of s.work.entries()) {
      const dueDate = new Date(today.getTime() + w.due * DAY);
      const anchor = Math.min(dueDate.getTime(), today.getTime());
      const submitted = reached(w.status, "SUBMITTED") || w.status === "CORRECTIONS";
      const submittedAt = submitted ? new Date(anchor - 4 * DAY) : null;
      const inspectedAt = reached(w.status, "INSPECTED") || w.status === "CORRECTIONS" ? new Date(anchor - 3 * DAY) : null;
      const approvedAt = reached(w.status, "AWAITING_OWNER") ? new Date(anchor - 2 * DAY) : null;
      const verifiedAt = w.status === "VERIFIED" ? new Date(anchor - DAY) : null;
      const m = await db.milestone.create({
        data: {
          projectId: project.id,
          title: w.title,
          dueDate,
          paymentAmount: $(w.value),
          status: w.status,
          sortOrder: i,
          assigneeId: w.who?.id,
          startedAt: w.status === "NOT_STARTED" ? null : new Date(anchor - 30 * DAY),
          submittedAt,
          submittedNote: submitted ? (w.status === "SUBMITTED" || w.status === "INSPECTED" ? w.note : "Work complete. Photos attached.") : null,
          inspectedAt,
          inspectNote: w.status === "CORRECTIONS" ? w.note : inspectedAt ? "Inspected on site. Matches drawings." : null,
          approvedAt,
          reviewNote: w.status === "AWAITING_OWNER" ? w.note : null,
          verifiedAt,
          photos: submitted ? { create: [{ url: art(Math.max(5, s.progress + w.due / 4), s.floors, "Sunny"), caption: w.title, takenAt: submittedAt! }] } : undefined,
        },
      });
      const who = w.who ?? carla;
      if (submittedAt) await log(who.id, `submitted work on "${w.title}"`, "Milestone", m.id, submittedAt);
      if (inspectedAt) await log(s.supervisor.id, w.status === "CORRECTIONS" ? `asked for corrections on "${w.title}"` : `passed inspection on "${w.title}"`, "Milestone", m.id, inspectedAt, w.status === "CORRECTIONS" ? w.note : undefined);
      if (approvedAt) await log(marcus.id, `approved work on "${w.title}"`, "Milestone", m.id, approvedAt);
      if (verifiedAt && $(w.value) > company.approvalThreshold) await log(olivia.id, `gave final approval on "${w.title}"`, "Milestone", m.id, verifiedAt);

      if (w.inv && w.who) {
        const amount = $(w.value);
        const retention = Math.round(amount * 0.05);
        const createdAt = new Date((verifiedAt ?? new Date(anchor)).getTime() + DAY);
        const created = createdAt > today ? at(daysAgo(1), 10) : createdAt;
        const e = await db.expense.create({
          data: {
            budgetLineId: lineIds[w.line],
            milestoneId: m.id,
            submitterId: w.who.id,
            vendor: VENDOR_OF(w.who),
            description: `Progress claim: ${w.title}`,
            amount,
            retention,
            status: w.inv.status,
            createdAt: created,
            dueDate: new Date(today.getTime() + (w.inv.dueIn ?? -20) * DAY),
            decidedAt: ["APPROVED", "PROCESSING", "PAID"].includes(w.inv.status) ? new Date(created.getTime() + DAY) : null,
          },
        });
        if (["APPROVED", "PROCESSING", "PAID"].includes(w.inv.status)) committed[w.line] += amount;
        await log(w.who.id, `submitted a $${w.value.toLocaleString("en-US")} invoice for "${w.title}"`, "Expense", e.id, created);
        if (w.inv.paidShare) {
          const paid = Math.round((amount - retention) * w.inv.paidShare);
          await pay(e.id, paid, new Date(created.getTime() + 12 * DAY), i);
          await log(fiona.id, `paid $${(paid / 100).toLocaleString("en-US")} to ${VENDOR_OF(w.who)}`, "Expense", e.id, new Date(created.getTime() + 12 * DAY));
        }
      }
    }

    // Invoices not tied to work: materials, plant hire, and some waiting in the queues.
    for (const [cat, vendor, description, dollars, status, by, note] of s.extra) {
      const e = await db.expense.create({
        data: { budgetLineId: lineIds[cat], submitterId: by.id, vendor, description, amount: $(dollars), status, reviewNote: note, createdAt: daysAgo(2), dueDate: new Date(today.getTime() + 28 * DAY) },
      });
      await log(by.id, `submitted a $${dollars.toLocaleString("en-US")} invoice for ${cat}`, "Expense", e.id, daysAgo(2));
      if (status === "OWNER_REVIEW") await log(marcus.id, `approved $${dollars.toLocaleString("en-US")} from ${vendor} and sent it to the owner`, "Expense", e.id, at(daysAgo(1), 5));
      if (status === "PAYMENT_REJECTED") await log(fiona.id, `refused payment of $${dollars.toLocaleString("en-US")} to ${vendor}`, "Expense", e.id, at(daysAgo(1), 3), note);
    }

    // History: earlier spend filling each line to its committed share, mostly paid.
    const VENDORS: Record<string, string[]> = {
      "Site preparation": ["Lone Star Earthworks", "Clearline Demolition"],
      Foundations: ["Gulf Ready-Mix", "Texas Rebar Supply"],
      Structure: ["Texas Rebar Supply", "Gulf Ready-Mix", "Lone Star Steel"],
      Roofing: ["Summit Roofing Co"],
      MEP: ["FlowRight Plumbing", "Coastal HVAC"],
      Finishes: ["Brightwall Interiors"],
      Contingency: ["Various"],
    };
    let n = 0;
    for (const [category, share, spentShare] of s.lines) {
      let remaining = Math.max(0, Math.round($(s.budget * share) * spentShare) - committed[category]);
      const count = remaining > 0 ? 2 + Math.floor(rand() * 3) : 0;
      for (let k = 0; k < count && remaining > 0; k++) {
        const amount = k === count - 1 ? remaining : Math.round((remaining / (count - k)) * (0.7 + rand() * 0.6));
        remaining -= amount;
        const decided = daysAgo(Math.max(3, Math.round(s.start - ((k + 1) / (count + 1)) * (s.start - 2) * (0.4 + spentShare * 0.6))));
        const vendor = pick(VENDORS[category] ?? ["Various"]);
        const paidAt = new Date(decided.getTime() + 14 * DAY);
        const isPaid = paidAt < today;
        const e = await db.expense.create({
          data: {
            budgetLineId: lineIds[category],
            submitterId: marcus.id,
            vendor,
            description: `${category}: ${pick(["materials", "plant hire", "deliveries", "testing"])}`,
            amount,
            status: isPaid ? "PAID" : "APPROVED",
            createdAt: new Date(decided.getTime() - 2 * DAY),
            decidedAt: decided,
            dueDate: new Date(decided.getTime() + 28 * DAY),
          },
        });
        await log(marcus.id, `approved $${(amount / 100).toLocaleString("en-US")} from ${vendor}`, "Expense", e.id, decided);
        if (isPaid) await pay(e.id, amount, paidAt, 50 + n++);
      }
    }
  }

  await seedAdvanced({ company, olivia, marcus, sam, carla, dev, ruth, fiona, jonah });

  // A few notifications so the bell isn't empty on first visit.
  const notes: [string, string, string, string][] = [
    [olivia.id, "Final approval needed: Ground and level 1 frame", "Marcus Reid approved $180,000 of work, over your limit.", "Harbour View Residences"],
    [olivia.id, "Invoice approval needed: $23,750", "This invoice is over your $10,000 limit. Marcus Reid has approved it.", "Harbour View Residences"],
    [olivia.id, "Over budget: Structure", "Riverside Medical Centre: Structure is at 106% of its budget.", "Riverside Medical Centre"],
    [marcus.id, "Ready for your review: Electrical first fix, levels 1 and 2", "Sam Okafor inspected and passed the work.", "Harbour View Residences"],
    [marcus.id, "No daily report: Riverside Medical Centre", "Nobody has filed today's site report yet.", "Riverside Medical Centre"],
    [sam.id, "Inspection requested: Level 2 slab poured", "Carla Mendes submitted work with photos.", "Harbour View Residences"],
    [jonah.id, "Corrections needed: Roof watertight", "Flashing incomplete at the plant room upstand. Fix and resubmit.", "Riverside Medical Centre"],
    [carla.id, "Payment received: $125,400", "Mendes Structural Ltd, ref ACH-04101. Balance remaining: $83,600.", "Harbour View Residences"],
    [fiona.id, "Overdue: $300,000 to Mendes Structural Ltd", "Riverside Medical Centre. This invoice was due 6 days ago.", "Riverside Medical Centre"],
    [fiona.id, "Ready to pay: $8,000", "Alvarez Electrical on Riverside Medical Centre is approved for payment.", "Riverside Medical Centre"],
  ];
  for (const [userId, title, body, projectName] of notes) {
    const p = await db.project.findFirstOrThrow({ where: { name: projectName, companyId: company.id } });
    await db.notification.create({ data: { userId, title, body, href: `/projects/${p.id}`, createdAt: at(daysAgo(0), -2 - rand() * 20) } });
  }

  console.log(`Seeded demo company "${company.name}". Demo password: ${DEMO_PASSWORD}`);
}

type People = Record<"olivia" | "marcus" | "sam" | "carla" | "dev" | "ruth" | "fiona" | "jonah", User> & { company: Company };

/** Change orders, materials and purchase orders, documents and signatures, ratings, disputes and chats. */
async function seedAdvanced(x: People) {
  const { company, olivia, marcus, sam, carla, dev, ruth, fiona, jonah } = x;
  const hv = await db.project.findFirstOrThrow({ where: { companyId: company.id, name: "Harbour View Residences" }, include: { budgetLines: true, milestones: true } });
  const rv = await db.project.findFirstOrThrow({ where: { companyId: company.id, name: "Riverside Medical Centre" }, include: { budgetLines: true, milestones: true } });
  const ok = await db.project.findFirstOrThrow({ where: { companyId: company.id, name: "Oakridge Townhomes" }, include: { milestones: true } });
  const line = (p: typeof hv, cat: string) => p.budgetLines.find((l) => l.category === cat)!;
  const work = (p: { milestones: { id: string; title: string }[] }, title: string) => p.milestones.find((m) => m.title === title)!;
  const log = (projectId: string, actorId: string, action: string, entityType: string, entityId: string, createdAt: Date, note?: string) =>
    db.auditEvent.create({ data: { actorId, action, entityType, entityId, projectId, createdAt, detail: note ? { note } : undefined } });
  const print = (...parts: (string | number)[]) => createHash("sha256").update(parts.join("|")).digest("hex");
  const money = (c: number) => `$${(c / 100).toLocaleString("en-US")}`;

  // ---- Change orders ----
  type CO = { p: typeof hv; title: string; reason: string; dollars: number; days: number; cat: string; work?: string; by: User; decided?: { by: User; ago: number; approve: boolean; note?: string }; ago: number };
  const cos: CO[] = [
    { p: hv, title: "Upgrade lobby glazing to low-E units", reason: "Client request after the energy model review. Reduces cooling load and meets the green lease terms.", dollars: 18_500, days: 5, cat: "Finishes", by: marcus, ago: 30, decided: { by: olivia, ago: 26, approve: true } },
    { p: hv, title: "Omit basement storage partitions", reason: "Tenant mix changed; storage cages will be supplied by the retail tenant.", dollars: -6_200, days: 0, cat: "Finishes", by: marcus, ago: 19, decided: { by: marcus, ago: 18, approve: true } },
    { p: hv, title: "Additional rebar at transfer beam (RFI-14)", reason: "Engineer's response to RFI-14 adds two T25 bars top and bottom at grid C/4. See structural drawings rev B.", dollars: 7_800, days: 2, cat: "Structure", work: "Level 3 and 4 frame", by: carla, ago: 3 },
    { p: hv, title: "Rooftop solar array, 42 kW", reason: "Owner's sustainability target. Panels, inverters and roof penetrations.", dollars: 64_000, days: 8, cat: "Roofing", by: marcus, ago: 2 },
    { p: rv, title: "Extra fire stopping to service risers", reason: "Fire engineer's inspection found unsealed penetrations not shown on the original MEP drawings.", dollars: 12_000, days: 3, cat: "MEP", work: "MEP second fix", by: ruth, ago: 40, decided: { by: olivia, ago: 37, approve: true } },
    { p: rv, title: "Premium vinyl flooring in waiting areas", reason: "Architect proposed a higher grade finish.", dollars: 9_400, days: 0, cat: "Finishes", by: marcus, ago: 22, decided: { by: marcus, ago: 21, approve: false, note: "Not in the client's brief. Stay with the specified finish." } },
  ];
  const counters = new Map<string, number>();
  for (const c of cos) {
    const number = (counters.get(c.p.id) ?? 0) + 1;
    counters.set(c.p.id, number);
    const amount = $(c.dollars);
    const createdAt = at(daysAgo(c.ago), 9);
    const bl = line(c.p, c.cat);
    const m = c.work ? work(c.p, c.work) : null;
    const decidedAt = c.decided ? at(daysAgo(c.decided.ago), 15) : null;
    const co = await db.changeOrder.create({
      data: {
        projectId: c.p.id, number, title: c.title, reason: c.reason, amount, daysImpact: c.days, budgetLineId: bl.id, milestoneId: m?.id, requestedById: c.by.id, createdAt,
        status: c.decided ? (c.decided.approve ? "APPROVED" : "REJECTED") : "PROPOSED",
        decidedById: c.decided?.by.id, decidedAt, decisionNote: c.decided?.note,
      },
    });
    await log(c.p.id, c.by.id, `proposed change order CO-${number} "${c.title}" (${money(amount)})`, "ChangeOrder", co.id, createdAt);
    if (c.decided && decidedAt) {
      await log(c.p.id, c.decided.by.id, `${c.decided.approve ? "approved and signed" : "rejected"} change order CO-${number} (${money(amount)})`, "ChangeOrder", co.id, decidedAt, c.decided.note);
      if (c.decided.approve) {
        await db.signature.create({ data: { changeOrderId: co.id, userId: c.decided.by.id, signedName: c.decided.by.name, role: c.decided.by.role, signedAt: decidedAt, fingerprint: print(co.id, number, amount, c.title, c.decided.by.id, decidedAt.toISOString()) } });
        await db.budgetLine.update({ where: { id: bl.id }, data: { budgeted: { increment: amount } } });
        if (m) await db.milestone.update({ where: { id: m.id }, data: { paymentAmount: { increment: amount } } });
        if (c.days) await db.project.update({ where: { id: c.p.id }, data: { endDate: { set: new Date((await db.project.findUniqueOrThrow({ where: { id: c.p.id } })).endDate.getTime() + c.days * DAY) } } });
      }
    }
  }

  // ---- Materials and purchase orders (Harbour View) ----
  const mats = Object.fromEntries(
    await Promise.all(
      ([
        ["rebar", "Rebar #5", "tons", 4],
        ["concrete", "Ready-mix concrete", "m³", 10],
        ["blocks", "Concrete blocks", "blocks", 500],
        ["ply", "Formwork plywood", "sheets", 20],
        ["cable", "Electrical cable 2.5 mm²", "m", 300],
      ] as const).map(async ([k, name, unit, reorderAt]) => [k, await db.material.create({ data: { projectId: hv.id, name, unit, reorderAt } })] as const),
    ),
  );
  type PO = { n: number; supplier: string; cat: string; by: User; ago: number; status: "PENDING_APPROVAL" | "ISSUED" | "PARTIALLY_RECEIVED" | "RECEIVED"; items: [keyof typeof mats, number, number, number[]][]; expected?: number }; // material, qty, unit $, deliveries
  const pos: PO[] = [
    { n: 1, supplier: "Texas Rebar Supply", cat: "Structure", by: marcus, ago: 48, status: "RECEIVED", items: [["rebar", 24, 1_050, [12, 12]]] },
    { n: 2, supplier: "Gulf Ready-Mix", cat: "Structure", by: marcus, ago: 20, status: "PARTIALLY_RECEIVED", items: [["concrete", 120, 165, [64]]], expected: 6 },
    { n: 3, supplier: "Alvarez Electrical", cat: "MEP", by: marcus, ago: 9, status: "ISSUED", items: [["cable", 2_000, 1.85, []]], expected: 4 },
    { n: 4, supplier: "Metro Building Supply", cat: "Structure", by: marcus, ago: 1, status: "PENDING_APPROVAL", items: [["blocks", 6_000, 2.1, []], ["ply", 80, 48, []]], expected: 10 },
  ];
  for (const po of pos) {
    const createdAt = at(daysAgo(po.ago), 8);
    const order = await db.purchaseOrder.create({
      data: { projectId: hv.id, number: po.n, supplier: po.supplier, budgetLineId: line(hv, po.cat).id, status: po.status, createdById: po.by.id, createdAt, expectedAt: po.expected ? new Date(today.getTime() + po.expected * DAY) : null },
    });
    const total = po.items.reduce((s, [, q, p]) => s + q * $(p), 0);
    await log(hv.id, po.by.id, `raised PO-${po.n} to ${po.supplier} (${money(total)})${po.status === "PENDING_APPROVAL" ? ", awaiting the owner" : ""}`, "PurchaseOrder", order.id, createdAt);
    for (const [k, quantity, price, deliveries] of po.items) {
      const item = await db.purchaseOrderItem.create({ data: { purchaseOrderId: order.id, materialId: mats[k].id, quantity, unitPrice: $(price), received: deliveries.reduce((s, d) => s + d, 0) } });
      for (const [i, q] of deliveries.entries()) {
        const when = at(daysAgo(Math.max(po.ago - 4 - i * 9, 1)), 7);
        await db.materialMovement.create({ data: { materialId: mats[k].id, kind: "RECEIVED", quantity: q, note: `PO-${po.n}, delivery note DN-${4100 + po.n * 10 + i}`, poItemId: item.id, userId: sam.id, createdAt: when } });
        await log(hv.id, sam.id, `received ${q} ${mats[k].unit} ${mats[k].name} on PO-${po.n}`, "PurchaseOrder", order.id, when);
      }
    }
  }
  // Earlier stock bought before tracking started, and usage on site.
  await db.materialMovement.create({ data: { materialId: mats.blocks.id, kind: "ADJUSTED", quantity: 1_400, note: "Opening stock count", userId: sam.id, createdAt: at(daysAgo(30), 7) } });
  await db.materialMovement.create({ data: { materialId: mats.ply.id, kind: "ADJUSTED", quantity: 60, note: "Opening stock count", userId: sam.id, createdAt: at(daysAgo(30), 7) } });
  const uses: [keyof typeof mats, number, number, string][] = [
    ["rebar", 9, 38, "Level 1 slab and columns"],
    ["rebar", 8, 22, "Level 2 slab"],
    ["rebar", 4, 6, "Level 3 columns"],
    ["concrete", 34, 12, "Level 2 slab pour"],
    ["concrete", 22, 4, "Level 3 columns"],
    ["blocks", 620, 14, "Ground floor partitions"],
    ["blocks", 360, 5, "Level 1 stair core"],
    ["ply", 38, 10, "Level 3 formwork"],
  ];
  for (const [k, q, ago, note] of uses) {
    const when = at(daysAgo(ago), 16);
    await db.materialMovement.create({ data: { materialId: mats[k].id, kind: "USED", quantity: q, note, userId: sam.id, createdAt: when } });
    await log(hv.id, sam.id, `used ${q} ${mats[k].unit} of ${mats[k].name}`, "Material", mats[k].id, when);
  }

  // ---- Documents and signatures ----
  type Doc = { p: { id: string }; title: string; cat: DocumentCategory; file: string; v?: number; by: User; ago: number; signers?: User[]; signed?: [User, number][] };
  const docs: Doc[] = [
    { p: hv, title: "Structural drawings", cat: "DRAWING", file: "structural-drawings-v1.pdf", by: marcus, ago: 135 },
    { p: hv, title: "Structural drawings", cat: "DRAWING", file: "structural-drawings-v2.pdf", v: 2, by: marcus, ago: 4 },
    { p: hv, title: "Subcontract: Mendes Structural", cat: "CONTRACT", file: "main-contract-mendes.pdf", by: marcus, ago: 132, signers: [olivia, carla], signed: [[olivia, 131], [carla, 130]] },
    { p: hv, title: "Subcontract: Alvarez Electrical", cat: "CONTRACT", file: "electrical-subcontract-alvarez.pdf", by: marcus, ago: 3, signers: [olivia, marcus, ruth], signed: [[marcus, 3]] },
    { p: hv, title: "Building permit BP-2026-0418", cat: "PERMIT", file: "building-permit.pdf", by: marcus, ago: 138 },
    { p: rv, title: "Main contract", cat: "CONTRACT", file: "riverside-contract.pdf", by: olivia, ago: 208, signers: [olivia, marcus], signed: [[olivia, 207], [marcus, 207]] },
    { p: rv, title: "Fire strategy report", cat: "REPORT", file: "fire-strategy.pdf", by: marcus, ago: 41 },
  ];
  for (const d of docs) {
    const createdAt = at(daysAgo(d.ago), 10);
    const doc = await db.document.create({ data: { projectId: d.p.id, title: d.title, category: d.cat, url: `/demo/docs/${d.file}`, fileName: d.file, version: d.v ?? 1, signerIds: (d.signers ?? []).map((u) => u.id), uploadedById: d.by.id, createdAt } });
    await log(d.p.id, d.by.id, `uploaded "${d.title}"${d.v ? ` (version ${d.v})` : ""}`, "Document", doc.id, createdAt);
    for (const [u, ago] of d.signed ?? []) {
      const signedAt = at(daysAgo(ago), 14);
      await db.signature.create({ data: { documentId: doc.id, userId: u.id, signedName: u.name, role: u.role, signedAt, fingerprint: print(doc.id, doc.url, doc.version, u.id, u.name, signedAt.toISOString()) } });
      await log(d.p.id, u.id, `signed "${d.title}" v${doc.version}`, "Document", doc.id, signedAt);
    }
  }

  // ---- Ratings on verified work ----
  const ratings: [{ id: string; milestones: { id: string; title: string; assigneeId: string | null }[] }, string, User, number, number, number, string | null][] = [
    [hv, "Site cleared and hoarded", marcus, 5, 4, 5, "Tidy site, good hoarding."],
    [hv, "Foundations complete", marcus, 4, 4, 5, null],
    [rv, "Basement and foundations", marcus, 4, 3, 4, "Two weeks late on the basement walls, quality good."],
    [rv, "Structural frame", marcus, 4, 3, 5, null],
    [rv, "Electrical containment", dev, 5, 5, 4, "Neat runs, certificates on time."],
    [rv, "Plant room roof deck", dev, 3, 2, 4, "Deck finished late and the first inspection failed."],
    [ok, "Site cleared and services located", marcus, 5, 5, 5, "Ahead of programme."],
  ];
  for (const [p, title, rater, quality, timeliness, safety, comment] of ratings) {
    const m = p.milestones.find((w) => w.title === title)!;
    // Low timeliness scores go with work verified after its deadline.
    if (timeliness <= 3) {
      const full = await db.milestone.findUniqueOrThrow({ where: { id: m.id } });
      await db.milestone.update({ where: { id: m.id }, data: { verifiedAt: new Date(full.dueDate.getTime() + (timeliness === 2 ? 9 : 4) * DAY) } });
    }
    await db.rating.create({ data: { projectId: p.id, contractorId: m.assigneeId!, milestoneId: m.id, raterId: rater.id, quality, timeliness, safety, comment, createdAt: at(daysAgo(5), 11) } });
  }

  // ---- Disputes ----
  const rvInvoice = await db.expense.findFirstOrThrow({ where: { milestone: { projectId: rv.id, title: "Structural frame" } } });
  const disputes: { p: { id: string }; title: string; by: User; ago: number; status: "OPEN" | "ESCALATED" | "RESOLVED"; milestoneId?: string; expenseId?: string; dollars?: number; thread: [User, number, string][]; resolved?: [User, number, string] }[] = [
    {
      p: rv, title: "Flashing detail missing from drawings", by: jonah, ago: 18, status: "OPEN", milestoneId: work(rv, "Roof watertight").id, dollars: 6_500,
      thread: [
        [jonah, 18, "The plant room upstand flashing isn't on drawing R-04. We priced what was drawn. The extra flashing is $6,500 of work we didn't include."],
        [marcus, 17, "Spec section 07 62 00 requires flashing at all upstands. I'll check with the architect whether R-04 is wrong or just incomplete."],
        [jonah, 15, "Thanks. We can do the work now and settle the cost after, so the roof isn't held up."],
      ],
    },
    {
      p: rv, title: "Back-charge for crane standby", by: marcus, ago: 9, status: "ESCALATED", expenseId: rvInvoice.id, dollars: 14_000,
      thread: [
        [marcus, 9, "The frame was 6 days late, and we paid crane standby of $14,000. I'm proposing to deduct it from this invoice."],
        [carla, 8, "The delay was caused by late steel deliveries from the client-nominated supplier. We don't accept the back-charge."],
        [marcus, 7, "Escalated to the owner. We can't agree this between us."],
      ],
    },
    {
      p: hv, title: "Skip hire charged twice", by: carla, ago: 60, status: "RESOLVED", milestoneId: work(hv, "Site cleared and hoarded").id, dollars: 1_200,
      thread: [
        [carla, 60, "Skip hire for week 3 was deducted from our invoice, but we hired our own skips that week."],
        [marcus, 58, "Checked the delivery notes. You're right, ours went to the other site."],
      ],
      resolved: [marcus, 57, "Credit of $1,200 added to the next valuation."],
    },
  ];
  for (const d of disputes) {
    const createdAt = at(daysAgo(d.ago), 9);
    const row = await db.dispute.create({
      data: {
        projectId: d.p.id, title: d.title, raisedById: d.by.id, status: d.status, milestoneId: d.milestoneId, expenseId: d.expenseId, amount: d.dollars ? $(d.dollars) : null, createdAt,
        ...(d.resolved && { resolution: d.resolved[2], resolvedById: d.resolved[0].id, resolvedAt: at(daysAgo(d.resolved[1]), 12) }),
        messages: { create: [...d.thread, ...(d.resolved ? [[d.resolved[0], d.resolved[1], `Resolved: ${d.resolved[2]}`] as [User, number, string]] : [])].map(([u, ago, body], i) => ({ authorId: u.id, body, createdAt: at(daysAgo(ago), 9 + i) })) },
      },
    });
    await log(d.p.id, d.by.id, `raised a dispute: "${d.title}"`, "Dispute", row.id, createdAt, d.thread[0][2]);
    if (d.status === "ESCALATED") await log(d.p.id, marcus.id, `escalated the dispute "${d.title}"`, "Dispute", row.id, at(daysAgo(7), 12));
    if (d.resolved) await log(d.p.id, d.resolved[0].id, `resolved the dispute "${d.title}"`, "Dispute", row.id, at(daysAgo(d.resolved[1]), 12), d.resolved[2]);
  }

  // ---- Chats ----
  const everyone = [olivia, marcus, sam, carla, dev, ruth, fiona, jonah];
  const seen = (u: User, unread: string[]) => (unread.includes(u.id) ? new Date(0) : new Date());
  type Line = [User, number, string]; // author, hours ago, text
  const chat = async (data: { title?: string; companyWide?: boolean; projectId?: string; members: User[]; unreadFor?: User[] }, lines: Line[]) => {
    const unread = (data.unreadFor ?? []).map((u) => u.id);
    const last = lines.length ? new Date(Date.now() - Math.min(...lines.map((l) => l[1])) * 3600e3) : new Date();
    const c = await db.conversation.create({
      data: {
        companyId: company.id, title: data.title, companyWide: data.companyWide ?? false, projectId: data.projectId, createdById: marcus.id, lastMessageAt: last,
        members: { create: data.members.map((u) => ({ userId: u.id, lastReadAt: seen(u, unread) })) },
        messages: { create: lines.map(([u, h, body]) => ({ authorId: u.id, body, createdAt: new Date(Date.now() - h * 3600e3) })) },
      },
    });
    return c;
  };
  await chat({ title: "Northline Developments (everyone)", companyWide: true, members: everyone, unreadFor: [sam, carla, ruth, jonah, dev, fiona] }, [
    [olivia, 52, "Morning all. Safety stand-down on every site Friday 7am after last week's near miss. Supervisors, please run it with your crews."],
    [sam, 51, "Will do at Harbour View."],
    [dev, 50, "Same at Riverside."],
    [fiona, 6, "Reminder: invoices for this month need to be in by the 25th to make the next payment run."],
  ]);
  await chat({ projectId: hv.id, members: [olivia, fiona, marcus, sam, carla, ruth, jonah], unreadFor: [olivia, marcus] }, [
    [sam, 30, "Level 2 slab cubes came back at 34 MPa on 7 days. Good to strip the soffit props on level 1."],
    [marcus, 29, "Great. Carla, can you start level 3 columns Monday?"],
    [carla, 28, "Yes, crew of 8 from Monday. Rebar for level 3 is on site."],
    [ruth, 5, "First fix on levels 1 and 2 is done and tested. Certificates are uploaded with the work."],
    [sam, 2, "Concrete delivery for level 3 columns is booked for Thursday 6am. PO-2 still has 56 m³ open."],
  ]);
  await chat({ projectId: rv.id, members: [olivia, fiona, marcus, dev, carla, ruth, jonah], unreadFor: [jonah] }, [
    [dev, 26, "Roof inspection failed again at the plant room upstand. Photos are on the work item."],
    [jonah, 25, "We'll fix the flashing Thursday. The drawing question is in the dispute."],
    [marcus, 3, "Architect confirmed R-04 is being revised. Jonah, please go ahead and we'll settle the cost under the dispute."],
  ]);
  await chat({ projectId: ok.id, members: [olivia, fiona, marcus, sam, carla] }, [[marcus, 70, "Site setup is complete. Foundations start next week."]]);
  await chat({ members: [marcus, carla], unreadFor: [marcus] }, [
    [marcus, 27, "Carla, the RFI-14 rebar change order is in. I'll look at it today."],
    [carla, 26, "Thanks. Price is from Texas Rebar's latest quote, attached to the order."],
    [carla, 1, "Can we walk the level 3 deck tomorrow at 8 before the pour?"],
  ]);
  await chat({ members: [olivia, fiona], unreadFor: [olivia] }, [[fiona, 4, "Olivia, the $300,000 Mendes invoice on Riverside is overdue but on hold because of the crane dispute. Do you want to pay the undisputed part?"]]);
  await chat({ title: "Harbour View structure", members: [olivia, marcus, sam, carla], unreadFor: [sam] }, [
    [marcus, 48, "Group for the frame. Programme review every Monday 9am."],
    [olivia, 47, "Thanks Marcus. Please flag anything that threatens the topping-out date."],
    [carla, 20, "Level 3 columns are 2 days behind because of the rain, still fine for topping out."],
    [sam, 19, "Agreed, the deck is safe to work on once the edge protection is up tomorrow."],
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

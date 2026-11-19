/**
 * Seeds the demo company used by the "explore the demo" buttons.
 * Dates are relative to today so the demo always looks current. Safe to re-run: it rebuilds the demo company.
 */
import { PrismaClient, type MilestoneStatus, type ExpenseStatus, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
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

async function main() {
  // On deploys we only seed once, so visitors' changes aren't wiped by every build.
  if (process.argv.includes("--if-missing") && (await db.company.findFirst({ where: { name: "Northline Developments" } }))) {
    console.log("Demo company already exists, skipping seed.");
    return;
  }
  // Projects first: deleting them cascades reports and invoices, which reference users.
  await db.project.deleteMany({ where: { company: { name: "Northline Developments" } } });
  await db.company.deleteMany({ where: { name: "Northline Developments" } });
  await db.user.deleteMany({ where: { email: { endsWith: "@demo.buildtrace.app" } } });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const company = await db.company.create({ data: { name: "Northline Developments", currency: "USD", approvalThreshold: $(10000) } });

  const mk = (name: string, role: Role, email: string, title: string) =>
    db.user.create({ data: { name, role, email, title, passwordHash, companyId: company.id } });
  const olivia = await mk("Olivia Bennett", "OWNER", DEMO_EMAILS.OWNER, "Managing Director");
  const marcus = await mk("Marcus Reid", "MANAGER", DEMO_EMAILS.MANAGER, "Senior Project Manager");
  const sam = await mk("Sam Okafor", "SUPERVISOR", DEMO_EMAILS.SUPERVISOR, "Site Supervisor");
  const carla = await mk("Carla Mendes", "CONTRACTOR", DEMO_EMAILS.CONTRACTOR, "Mendes Structural Ltd");
  const dev = await mk("Dev Patel", "SUPERVISOR", "dev@demo.buildtrace.app", "Site Supervisor");
  const ruth = await mk("Ruth Alvarez", "CONTRACTOR", "ruth@demo.buildtrace.app", "Alvarez Electrical");

  type Spec = {
    name: string;
    location: string;
    description: string;
    start: number; // days ago
    end: number; // days from now
    floors: number;
    progress: number; // today
    budget: number;
    lines: [string, number, number][]; // category, share of budget, share of that line spent
    supervisor: typeof sam;
    contractors: (typeof carla)[];
    reportDays: number;
    skipToday: boolean;
    milestones: [string, number, number, MilestoneStatus, string?][]; // title, due offset (days from today), payment, status, note
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
      contractors: [carla, ruth],
      reportDays: 34,
      skipToday: false,
      milestones: [
        ["Site cleared and hoarded", -120, 60_000, "SIGNED_OFF"],
        ["Foundations complete", -70, 220_000, "SIGNED_OFF"],
        ["Ground and level 1 frame", -12, 180_000, "PASSED", "Frame checked against drawings. All columns within tolerance."],
        ["Level 2 slab poured", 2, 150_000, "SUBMITTED", "Slab poured and cured. Cube test results attached."],
        ["Level 3 and 4 frame", 45, 220_000, "OPEN"],
        ["Roof watertight", 110, 160_000, "OPEN"],
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
      contractors: [carla, ruth],
      reportDays: 30,
      skipToday: true,
      milestones: [
        ["Basement and foundations", -150, 260_000, "SIGNED_OFF"],
        ["Structural frame", -60, 300_000, "SIGNED_OFF"],
        ["Roof watertight", -20, 120_000, "REJECTED", "Flashing incomplete at the plant room upstand. Fix and resubmit."],
        ["MEP second fix", 25, 200_000, "OPEN"],
        ["Handover", 55, 180_000, "OPEN"],
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
      milestones: [
        ["Site cleared and services located", -5, 45_000, "SIGNED_OFF"],
        ["Foundations for units 1 to 4", 40, 120_000, "OPEN"],
        ["Units 1 to 4 framed", 110, 160_000, "OPEN"],
      ],
    },
  ];

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
        members: { create: [marcus, s.supervisor, ...s.contractors].map((u) => ({ userId: u.id })) },
      },
    });
    const log = (actorId: string, action: string, entityType: string, entityId: string, createdAt: Date, note?: string) =>
      db.auditEvent.create({ data: { actorId, action, entityType, entityId, projectId: project.id, createdAt, detail: note ? { note } : undefined } });
    await log(olivia.id, "created the project", "Project", project.id, startDate);

    // Daily reports: Monday to Saturday, progress rising to today's figure.
    const days: Date[] = [];
    for (let d = s.reportDays; d >= (s.skipToday ? 1 : 0); d--) {
      const date = daysAgo(d);
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

    // Budget lines and invoices.
    const VENDORS: Record<string, string[]> = {
      "Site preparation": ["Lone Star Earthworks", "Clearline Demolition"],
      Foundations: ["Mendes Structural Ltd", "Gulf Ready-Mix"],
      Structure: ["Mendes Structural Ltd", "Texas Rebar Supply", "Gulf Ready-Mix"],
      Roofing: ["Summit Roofing Co"],
      MEP: ["Alvarez Electrical", "FlowRight Plumbing"],
      Finishes: ["Brightwall Interiors"],
      Contingency: ["Various"],
    };
    for (const [category, share, spentShare] of s.lines) {
      const budgeted = $(s.budget * share);
      const line = await db.budgetLine.create({ data: { projectId: project.id, category, budgeted } });
      let remaining = Math.round(budgeted * spentShare);
      const n = remaining > 0 ? 2 + Math.floor(rand() * 4) : 0;
      for (let k = 0; k < n && remaining > 0; k++) {
        const amount = k === n - 1 ? remaining : Math.round((remaining / (n - k)) * (0.7 + rand() * 0.6));
        remaining -= amount;
        const decided = daysAgo(Math.max(1, Math.round(s.start - ((k + 1) / (n + 1)) * (s.start - 2) * (0.4 + spentShare * 0.6))));
        const vendor = pick(VENDORS[category] ?? ["Various"]);
        const e = await db.expense.create({
          data: {
            budgetLineId: line.id,
            submitterId: vendor.startsWith("Alvarez") ? ruth.id : vendor.startsWith("Mendes") ? carla.id : marcus.id,
            vendor,
            description: `${category}: ${pick(["materials", "labour", "plant hire", "progress claim"])}`,
            amount,
            status: "APPROVED",
            createdAt: new Date(decided.getTime() - 2 * DAY),
            decidedAt: decided,
          },
        });
        await log(marcus.id, `approved $${(amount / 100).toLocaleString("en-US")} from ${vendor}`, "Expense", e.id, decided);
      }
    }

    // Invoices waiting in the approval queues.
    if (pi < 2) {
      const lines = await db.budgetLine.findMany({ where: { projectId: project.id } });
      const byCat = (c: string) => lines.find((l) => l.category === c)!;
      const pending: [string, string, string, number, ExpenseStatus, string][] = [
        ["Structure", "Texas Rebar Supply", "Rebar for level 3 slab", 8_400, "PENDING", carla.id],
        ["MEP", "Alvarez Electrical", "Level 1 and 2 first fix", 23_750, "MANAGER_APPROVED", ruth.id],
      ];
      if (pi === 1) pending.push(["Finishes", "Brightwall Interiors", "Drywall materials, ground floor", 6_200, "PENDING", carla.id]);
      for (const [cat, vendor, description, dollars, status, submitterId] of pending) {
        const e = await db.expense.create({
          data: { budgetLineId: byCat(cat).id, submitterId, vendor, description, amount: $(dollars), status, createdAt: daysAgo(1) },
        });
        await log(submitterId, `submitted a $${dollars.toLocaleString("en-US")} invoice for ${cat}`, "Expense", e.id, daysAgo(1));
        if (status === "MANAGER_APPROVED") await log(marcus.id, `approved $${dollars.toLocaleString("en-US")} from ${vendor} and sent it to the owner`, "Expense", e.id, at(daysAgo(1), 5));
      }
    }

    // Milestones with evidence.
    for (const [i, [title, due, payment, status, note]] of s.milestones.entries()) {
      const dueDate = new Date(today.getTime() + due * DAY);
      const done = status !== "OPEN";
      const submittedAt = done ? new Date(Math.min(dueDate.getTime(), today.getTime()) - 3 * DAY) : null;
      const m = await db.milestone.create({
        data: {
          projectId: project.id,
          title,
          dueDate,
          paymentAmount: $(payment),
          status,
          sortOrder: i,
          submittedAt,
          submittedNote: done ? (status === "SUBMITTED" ? note : "Work complete. Photos attached.") : null,
          reviewNote: status === "PASSED" || status === "REJECTED" ? note : null,
          passedAt: status === "PASSED" || status === "SIGNED_OFF" ? new Date(submittedAt!.getTime() + DAY) : null,
          signedOffAt: status === "SIGNED_OFF" ? new Date(submittedAt!.getTime() + 2 * DAY) : null,
          photos: done ? { create: [{ url: art(Math.max(5, s.progress + due / 4), s.floors, "Sunny"), caption: title, takenAt: submittedAt! }] } : undefined,
        },
      });
      if (submittedAt) await log(carla.id, `submitted milestone "${title}"`, "Milestone", m.id, submittedAt);
      if (status === "PASSED" || status === "SIGNED_OFF") await log(marcus.id, `passed inspection on milestone "${title}"`, "Milestone", m.id, new Date(submittedAt!.getTime() + DAY), note);
      if (status === "SIGNED_OFF") await log(olivia.id, `signed off milestone "${title}"`, "Milestone", m.id, new Date(submittedAt!.getTime() + 2 * DAY));
      if (status === "REJECTED") await log(olivia.id, `rejected milestone "${title}"`, "Milestone", m.id, new Date(submittedAt!.getTime() + DAY), note);
    }
  }

  // A few notifications so the bell isn't empty on first visit.
  const notes: [string, string, string, string][] = [
    [olivia.id, "Ready for sign-off: Ground and level 1 frame", "Marcus Reid passed inspection. Signing off releases $180,000.", "Harbour View Residences"],
    [olivia.id, "Approval needed: $23,750", "This invoice is over your $10,000 limit. Marcus Reid has approved it.", "Harbour View Residences"],
    [olivia.id, "Over budget: Structure", "Riverside Medical Centre: Structure is at 106% of its budget.", "Riverside Medical Centre"],
    [marcus.id, "Ready for inspection: Level 2 slab poured", "Carla Mendes marked this milestone done.", "Harbour View Residences"],
    [marcus.id, "No daily report: Riverside Medical Centre", "Nobody has filed today's site report yet.", "Riverside Medical Centre"],
    [carla.id, "Milestone rejected: Roof watertight", "Flashing incomplete at the plant room upstand. Fix and resubmit.", "Riverside Medical Centre"],
    [sam.id, "Daily report accepted", "Marcus Reid accepted your report.", "Harbour View Residences"],
  ];
  for (const [userId, title, body, projectName] of notes) {
    const p = await db.project.findFirstOrThrow({ where: { name: projectName, companyId: company.id } });
    await db.notification.create({ data: { userId, title, body, href: `/projects/${p.id}`, createdAt: at(daysAgo(0), -2 - rand() * 20) } });
  }

  console.log(`Seeded demo company "${company.name}". Demo password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

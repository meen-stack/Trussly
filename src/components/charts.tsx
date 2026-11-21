"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const money = (currency: string) => (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);

const axis = { fontSize: 12, fill: "#a1a1aa" };
const tip = {
  contentStyle: { background: "#141416", border: "1px solid #27272a", borderRadius: 8, color: "#f5f5f5" },
  labelStyle: { color: "#a1a1aa" },
  itemStyle: { color: "#f5f5f5" },
};
const day = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const timeAxis = { dataKey: "t", type: "number" as const, domain: ["dataMin", "dataMax"] as [string, string], tickFormatter: day, tick: axis, axisLine: false, tickLine: false, minTickGap: 28 };

export function BudgetChart({ data, currency }: { data: { category: string; budgeted: number; spent: number }[]; currency: string }) {
  const fmt = money(currency);
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke="#27272a" />
        <XAxis type="number" tickFormatter={fmt} tick={axis} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="category" width={130} tick={axis} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(Number(v))} cursor={{ fill: "rgba(255,255,255,0.04)" }} {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="budgeted" name="Budget" fill="#3f3f46" radius={[0, 4, 4, 0]} barSize={12} />
        <Bar dataKey="spent" name="Spent" fill="#ffc107" radius={[0, 4, 4, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProgressChart({ data }: { data: { t: number; actual: number; planned: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#27272a" />
        <XAxis {...timeAxis} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={axis} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => `${v}%`} labelFormatter={(t) => day(Number(t))} {...tip} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line isAnimationActive={false} type="monotone" dataKey="planned" name="Planned" stroke="#71717a" strokeDasharray="5 4" dot={false} strokeWidth={2} />
        <Line isAnimationActive={false} type="monotone" dataKey="actual" name="Reported on site" stroke="#ffc107" dot={false} strokeWidth={2.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SpendChart({ data, budget, currency }: { data: { t: number; spent: number }[]; budget: number; currency: string }) {
  const fmt = money(currency);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke="#27272a" />
        <XAxis {...timeAxis} />
        <YAxis tickFormatter={fmt} tick={axis} axisLine={false} tickLine={false} domain={[0, Math.max(budget * 1.05, 1)]} />
        <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(t) => day(Number(t))} {...tip} />
        <ReferenceLine y={budget} stroke="#f87171" strokeDasharray="4 4" label={{ value: "Budget", position: "insideTopRight", fontSize: 12, fill: "#f87171" }} />
        <Line isAnimationActive={false} type="stepAfter" dataKey="spent" name="Approved spend" stroke="#ffc107" dot={false} strokeWidth={2.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}

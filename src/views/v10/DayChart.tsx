import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** The dashboard's 24-hour chart, without vs with the interventions — loaded on its own (recharts weighs ~300 kB). */
export default function DayChart({ day, reduce, fmt1 }: { day: Array<{ h: number; prima: number; dopo: number }>; reduce: boolean; fmt1: (v: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={day} margin={{ top: 6, right: 4, bottom: 0, left: -22 }}>
        <defs>
          <linearGradient id="dash-before" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--radar-hot)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--radar-hot)" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
        <XAxis dataKey="h" type="category" tickLine={false} axisLine={false} interval={5} tickFormatter={(h) => `${h}:00`} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} domain={["dataMin - 1", "dataMax + 1"]} tickFormatter={(v) => `${Math.round(v)}°`} />
        <Tooltip formatter={(v: number, n: string) => [`${fmt1(v)}°`, n === "prima" ? "Senza interventi" : "Con gli interventi"]} labelFormatter={(h) => `Ore ${h}:00`} contentStyle={{ borderRadius: 16, border: "none" }} />
        <Area type="monotone" dataKey="prima" stroke="var(--radar-hot)" strokeWidth={2} fill="url(#dash-before)" isAnimationActive={!reduce} />
        <Area type="monotone" dataKey="dopo" stroke="var(--ok)" strokeWidth={2.5} fill="none" isAnimationActive={!reduce} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

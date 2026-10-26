import type { LabState } from "./lab-store";
import { vineMetrics } from "./lab-store";
import { comparison, piazzaEstimate } from "./scenarios";
import { REFERENCE_M2, UNIT_COST, euroRange, grouped, interventionCost, type CostRange } from "./intervention-cost";
import { NO_MIX, VINE_LEVELS, VINE_REFERENCE_M2, VINE_UNIT_COST, vineCost, vineMixOf, zoneMixOf, type VineMix } from "./vine-interventions";
import { coolingShare, estimatedTemp, type Season } from "./season-climate";

/**
 * The summary of the two projects, shared by the dashboard and the PDF report so both read the same numbers:
 * the result before → after, its words and colour step, the level, the cost and the benefits.
 */
const avg = (n: number[]) => n.reduce((a, b) => a + b, 0) / Math.max(1, n.length);
export const heatStep = (t: number) => (t >= 39 ? 0 : t >= 36 ? 1 : t >= 30 ? 2 : t >= 26 ? 3 : 4);
export const heatWords = (t: number) => (t >= 39 ? "Troppo caldo" : t >= 36 ? "Molto caldo" : t >= 30 ? "Caldo" : t >= 18 ? "Si sta bene" : t >= 10 ? "Fresco" : "Freddo");
export const thirstStep = (s: number) => (s >= 80 ? 0 : s >= 65 ? 1 : s >= 45 ? 2 : s >= 25 ? 3 : 4);
export const thirstWords = (s: number) => (s >= 65 ? "Sete forte" : s >= 35 ? "Da tenere d'occhio" : "Le viti stanno bene");
const levelName = (id: string | null) => (id ? comparison.find((c) => c.id === id)?.s ?? null : null);

const PIAZZA_PRESETS = { zero: [3, 10, 10], mvp: [6, 20, 15], roadmap: [12, 40, 30] } as const;

export type PiazzaSummary = {
  day: Array<{ h: number; prima: number; dopo: number }>; estimated: boolean;
  hour: number; before: number; after: number; empty: boolean; level: string | null;
  m2: number; measured: boolean; cost: CostRange;
  co2: number; water: number; shadeM2: number; lawnM2: number; shadeArea: number;
};

/** Piazza: a whole day of the season (real year of the place, else an estimate) read at its hottest hour. */
export function piazzaSummary(urban: LabState["urban"], season: Season, profile: Array<number | null> | null, areaM2: number | null): PiazzaSummary {
  const est = piazzaEstimate(urban.trees, urban.permeable, urban.shade);
  const day = Array.from({ length: 24 }, (_, h) => {
    const before = profile?.[h] ?? estimatedTemp(season, h, urban.realTemp ?? 40);
    return { h, prima: +before.toFixed(1), dopo: +(before - est.dT * coolingShare(before)).toFixed(1) };
  });
  const hot = day.reduce((a, b) => (b.prima > a.prima ? b : a), day[0]!);
  const m2 = areaM2 ?? REFERENCE_M2;
  const empty = urban.trees + urban.permeable + urban.shade === 0;
  const preset = (Object.keys(PIAZZA_PRESETS) as Array<keyof typeof PIAZZA_PRESETS>)
    .find((k) => PIAZZA_PRESETS[k][0] === urban.trees && PIAZZA_PRESETS[k][1] === urban.permeable && PIAZZA_PRESETS[k][2] === urban.shade) ?? null;
  return {
    day, estimated: !profile || profile.every((v) => v === null),
    hour: hot.h, before: hot.prima, after: hot.dopo, empty, level: empty ? null : levelName(preset) ?? "Su misura",
    m2, measured: areaM2 !== null, cost: interventionCost(m2, urban.trees, urban.permeable, urban.shade).total,
    co2: Math.round(urban.trees * 22), water: Math.round(m2 * (urban.permeable / 100) * 0.7 * 0.6),
    shadeM2: Math.round(m2 * (urban.shade / 100) + urban.trees * 30),
    lawnM2: Math.round((m2 * urban.permeable) / 100), shadeArea: Math.round((m2 * urban.shade) / 100),
  };
}

/** What was put in the piazza, one line each with its unit cost (shared by the dashboard rows and the report). */
export const piazzaMix = (urban: LabState["urban"], s: PiazzaSummary) => [
  { label: "Alberi", value: `${urban.trees}`, cost: `${euroRange(UNIT_COST.tree)} l'uno` },
  { label: "Prato", value: `${urban.permeable}%`, cost: `${grouped(s.lawnM2)} m² · ${euroRange(UNIT_COST.lawnM2)} al m²` },
  { label: "Ombra", value: `${urban.shade}%`, cost: `${grouped(s.shadeArea)} m² · ${euroRange(UNIT_COST.shadeM2)} al m²` },
];

export type VineSummary = {
  before: number; after: number; zones: Array<{ after: number; plain: number; temp: number; moisture: number }>;
  mix: VineMix; same: boolean; empty: boolean; level: string | null; safe: number;
  m2: number; measured: boolean; cost: CostRange;
};

/** Vineyard: the average thirst of the three zones as left in the simulation, without and with each zone's interventions. */
export function vineSummary(vine: LabState["vineyard"], areaM2: number | null): VineSummary {
  const mixes = vine.zones.map((z) => zoneMixOf(z, vineMixOf(vine)));
  const after = vineMetrics({ ...vine, zones: vine.zones.map((z, i) => ({ ...z, ...mixes[i] })) }).results.map((r) => r.s);
  const plain = vineMetrics({ ...vine, zones: vine.zones.map((z) => ({ ...z, ...NO_MIX })) }).results.map((r) => r.s);
  const m2 = areaM2 ?? VINE_REFERENCE_M2;
  const cost = mixes.reduce((t, m) => { const c = vineCost(m2 / Math.max(1, mixes.length), m).total; return { lo: t.lo + c.lo, hi: t.hi + c.hi }; }, { lo: 0, hi: 0 });
  const empty = mixes.every((m) => m.irrigation + m.shade + m.windbreak === 0);
  const first = mixes[0] ?? NO_MIX;
  const same = mixes.every((m) => m.irrigation === first.irrigation && m.shade === first.shade && m.windbreak === first.windbreak);
  const preset = same ? VINE_LEVELS.find((p) => p.irrigation === first.irrigation && p.shade === first.shade && p.windbreak === first.windbreak)?.id ?? null : null;
  return {
    before: avg(plain), after: avg(after),
    zones: vine.zones.map((z, i) => ({ after: after[i] ?? 0, plain: plain[i] ?? 0, temp: z.temperature, moisture: z.moisture })),
    mix: { irrigation: avg(mixes.map((m) => m.irrigation)), shade: avg(mixes.map((m) => m.shade)), windbreak: avg(mixes.map((m) => m.windbreak)) },
    same, empty, level: empty ? null : levelName(preset) ?? "Su misura", safe: after.filter((s) => s < 35).length,
    m2, measured: areaM2 !== null, cost,
  };
}

/** What was put in the vineyard, one line each with its cost per hectare. */
export const vineMixRows = (s: VineSummary) => [
  { label: "Irrigazione", value: `+${Math.round(s.mix.irrigation)}%`, cost: `${euroRange(VINE_UNIT_COST.irrigation)} l'ettaro` },
  { label: "Teli d'ombra", value: `${Math.round(s.mix.shade)}%`, cost: `${euroRange(VINE_UNIT_COST.shade)} l'ettaro` },
  { label: "Frangivento", value: `${Math.round(s.mix.windbreak)}%`, cost: `${euroRange(VINE_UNIT_COST.windbreak)} l'ettaro` },
];

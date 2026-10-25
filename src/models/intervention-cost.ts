/**
 * Indicative costs of the three interventions in an Italian piazza (works, materials and first care, VAT excluded).
 * Ranges, not quotes: they only give the order of magnitude before a real project.
 * - Albero: planting a street tree with root ball, pit and stake, and the first years of watering.
 * - Prato: taking up the paving and laying soil and lawn, or a draining paving.
 * - Ombra: pergolas, sails or awnings on a light frame.
 */
export const UNIT_COST = {
  tree: { lo: 600, hi: 1500 },
  lawnM2: { lo: 60, hi: 140 },
  shadeM2: { lo: 120, hi: 350 },
} as const;

/** Reference surface when the place has no mapped shape: the piazza the simulation was built on. */
export const REFERENCE_M2 = 4000;

export type CostRange = { lo: number; hi: number };

/** Total cost of the intervention and its cost for each m² of the piazza. */
export function interventionCost(m2: number, trees: number, permeablePct: number, shadePct: number): { total: CostRange; perM2: CostRange } {
  const lawn = m2 * (permeablePct / 100), shade = m2 * (shadePct / 100);
  const total = {
    lo: trees * UNIT_COST.tree.lo + lawn * UNIT_COST.lawnM2.lo + shade * UNIT_COST.shadeM2.lo,
    hi: trees * UNIT_COST.tree.hi + lawn * UNIT_COST.lawnM2.hi + shade * UNIT_COST.shadeM2.hi,
  };
  return { total, perM2: { lo: m2 > 0 ? total.lo / m2 : 0, hi: m2 > 0 ? total.hi / m2 : 0 } };
}

/** "120 mila €", "1,4 mln €" or "850 €": short amounts that fit a card. */
export function euroShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mln €`;
  if (v >= 10_000) return `${Math.round(v / 1000).toLocaleString("it-IT")} mila €`;
  return `${Math.round(v).toLocaleString("it-IT")} €`;
}

/** Thousands always grouped with a dot, also for 4 digits ("4.000"), as Italian readers expect for m². */
export const grouped = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** A cost range in one short line: "124–331 mila €", "0,9–1,4 mln €", else "850–2.100 €". */
export function euroRange({ lo, hi }: CostRange): string {
  if (hi >= 1_000_000) return `${(lo / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })}–${(hi / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} mln €`;
  if (hi >= 10_000) return `${grouped(lo / 1000)}–${grouped(hi / 1000)} mila €`;
  return `${grouped(lo)}–${grouped(hi)} €`;
}

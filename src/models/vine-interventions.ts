import type { VineZoneState } from "./lab-store";

/**
 * The three things a grower can do against the vines' thirst, applied to every zone of the vineyard:
 * - irrigation: emergency drip watering, + points of water in the soil (0–20);
 * - shade: shade cloth over the rows, % of the canopy covered (0–100): up to 3 °C less on the leaves;
 * - windbreak: hedges or nets around the plot, % of the edge (0–100): up to 60 % less wind that dries the canopy.
 */
export type VineMix = { irrigation: number; shade: number; windbreak: number };
export const NO_MIX: VineMix = { irrigation: 0, shade: 0, windbreak: 0 };
export const VINE_MAX = { irrigation: 20, shade: 100, windbreak: 100 } as const;

/** The ready vineyard of each level: the same ladder as the piazza (free → few sensors → full project). */
export const VINE_LEVELS: Array<{ id: "zero" | "mvp" | "roadmap" } & VineMix> = [
  { id: "zero", irrigation: 4, shade: 0, windbreak: 20 },
  { id: "mvp", irrigation: 8, shade: 30, windbreak: 40 },
  { id: "roadmap", irrigation: 16, shade: 80, windbreak: 70 },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The zones as the vines feel them once the mix is in place. */
export function applyVineMix(zones: VineZoneState[], m: VineMix): VineZoneState[] {
  return zones.map((z) => ({
    ...z,
    moisture: clamp(z.moisture + m.irrigation, 0, 60),
    temperature: clamp(z.temperature - (m.shade / 100) * 3, 0, 45),
    wind: clamp(z.wind * (1 - (m.windbreak / 100) * 0.6), 0, 30),
  }));
}

/** Reads a stored vineyard (older saves have no mix). */
export const vineMixOf = (v: Partial<VineMix>): VineMix => ({ irrigation: v.irrigation ?? 0, shade: v.shade ?? 0, windbreak: v.windbreak ?? 0 });

/**
 * Indicative costs per hectare (works and materials, VAT excluded), full extent of each item; the mix pays its share.
 * Drip line for emergency watering 3.000–6.000 €/ha, shade cloth on the rows 4.000–8.000 €/ha,
 * hedge or windbreak net along the edge 6.000–12.000 €/ha.
 */
export const VINE_UNIT_COST = { irrigation: { lo: 3000, hi: 6000 }, shade: { lo: 4000, hi: 8000 }, windbreak: { lo: 6000, hi: 12000 } } as const;
/** Reference surface when the vineyard has no mapped shape: one hectare. */
export const VINE_REFERENCE_M2 = 10_000;

export function vineCost(m2: number, m: VineMix): { total: { lo: number; hi: number }; perHa: { lo: number; hi: number } } {
  const share = { irrigation: m.irrigation / VINE_MAX.irrigation, shade: m.shade / VINE_MAX.shade, windbreak: m.windbreak / VINE_MAX.windbreak };
  const perHa = (k: "lo" | "hi") => share.irrigation * VINE_UNIT_COST.irrigation[k] + share.shade * VINE_UNIT_COST.shade[k] + share.windbreak * VINE_UNIT_COST.windbreak[k];
  const ha = m2 / 10_000;
  return { perHa: { lo: perHa("lo"), hi: perHa("hi") }, total: { lo: perHa("lo") * ha, hi: perHa("hi") * ha } };
}

/** The mix halfway along the path no mix → Subito, gratis → Pochi sensori → Progetto completo (u from 0 to 3). */
export function vineMixAt(u: number): VineMix {
  const path = [NO_MIX, ...VINE_LEVELS];
  const i = clamp(Math.floor(u), 0, path.length - 2), f = clamp(u - i, 0, 1);
  const a = path[i]!, b = path[i + 1]!;
  const lerp = (x: number, y: number, step: number) => Math.round((x + (y - x) * f) / step) * step;
  return { irrigation: lerp(a.irrigation, b.irrigation, 1), shade: lerp(a.shade, b.shade, 1), windbreak: lerp(a.windbreak, b.windbreak, 1) };
}

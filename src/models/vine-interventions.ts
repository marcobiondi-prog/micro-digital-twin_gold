import type { VineZoneState } from "./lab-store";

/**
 * The three things a grower can do for the vines, applied zone by zone:
 * - irrigation: emergency drip watering, + points of water in the soil (0–20);
 * - pestAnimal: defence against animal pests (insects and mites: traps, mating disruption, targeted treatments), % (0–100):
 *   takes up to 85 % of the zone's animal pests off;
 * - pestPlant: defence against plant pests (fungi such as downy and powdery mildew, weeds), % (0–100): up to 85 % off.
 * How many pests a zone has (animalPests / plantPests, 0–100) is a condition of the zone, like its temperature.
 */
export type VineMix = { irrigation: number; pestAnimal: number; pestPlant: number };
export const NO_MIX: VineMix = { irrigation: 0, pestAnimal: 0, pestPlant: 0 };
export const VINE_MAX = { irrigation: 20, pestAnimal: 100, pestPlant: 100 } as const;
/** The pests a zone has when nobody said otherwise: some insects, a little more fungus. */
export const PEST_DEFAULT = { animal: 30, plant: 40 } as const;
/** The share of the pests a full defence takes off. */
export const DEFENCE_MAX = 0.85;

/** The ready vineyard of each level: the same ladder as the piazza (free → few sensors → full project). */
export const VINE_LEVELS: Array<{ id: "zero" | "mvp" | "roadmap" } & VineMix> = [
  { id: "zero", irrigation: 4, pestAnimal: 0, pestPlant: 20 },
  { id: "mvp", irrigation: 8, pestAnimal: 40, pestPlant: 50 },
  { id: "roadmap", irrigation: 16, pestAnimal: 80, pestPlant: 80 },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The pests left once the defence is in place (0–100). */
export const pestsLeft = (pests: number, defence: number) => clamp(pests, 0, 100) * (1 - (clamp(defence, 0, 100) / 100) * DEFENCE_MAX);

/** A zone as the vines feel it once the mix is in place. */
export function applyZoneMix(z: VineZoneState, m: VineMix): VineZoneState {
  return {
    ...z,
    moisture: clamp(z.moisture + m.irrigation, 0, 60),
    animalPests: pestsLeft(z.animalPests ?? PEST_DEFAULT.animal, m.pestAnimal),
    plantPests: pestsLeft(z.plantPests ?? PEST_DEFAULT.plant, m.pestPlant),
  };
}

/** The zones as the vines feel them once the same mix is in place everywhere. */
export const applyVineMix = (zones: VineZoneState[], m: VineMix): VineZoneState[] => zones.map((z) => applyZoneMix(z, m));

/** Each zone keeps its own mix; a zone saved before zones had one takes the vineyard's (older saves: none). */
export const zoneMixOf = (z: Partial<VineMix>, fallback: VineMix = NO_MIX): VineMix =>
  z.irrigation === undefined && z.pestAnimal === undefined && z.pestPlant === undefined ? fallback : vineMixOf(z);

/** Reads a stored vineyard (older saves have no mix). */
export const vineMixOf = (v: Partial<VineMix>): VineMix => ({ irrigation: v.irrigation ?? 0, pestAnimal: v.pestAnimal ?? 0, pestPlant: v.pestPlant ?? 0 });

/**
 * Indicative costs per hectare and season (works and materials, VAT excluded), full extent of each item; the mix pays
 * its share. Drip line for emergency watering 3.000–6.000 €/ha; defence against animal pests (traps, mating-disruption
 * dispensers, targeted treatments) 400–1.200 €/ha; defence against plant pests (fungicide rounds, grassing and mowing)
 * 500–1.500 €/ha.
 */
export const VINE_UNIT_COST = { irrigation: { lo: 3000, hi: 6000 }, pestAnimal: { lo: 400, hi: 1200 }, pestPlant: { lo: 500, hi: 1500 } } as const;
/** Reference surface when the vineyard has no mapped shape: one hectare. */
export const VINE_REFERENCE_M2 = 10_000;

export function vineCost(m2: number, m: VineMix): { total: { lo: number; hi: number }; perHa: { lo: number; hi: number } } {
  const share = { irrigation: m.irrigation / VINE_MAX.irrigation, pestAnimal: m.pestAnimal / VINE_MAX.pestAnimal, pestPlant: m.pestPlant / VINE_MAX.pestPlant };
  const perHa = (k: "lo" | "hi") => share.irrigation * VINE_UNIT_COST.irrigation[k] + share.pestAnimal * VINE_UNIT_COST.pestAnimal[k] + share.pestPlant * VINE_UNIT_COST.pestPlant[k];
  const ha = m2 / 10_000;
  return { perHa: { lo: perHa("lo"), hi: perHa("hi") }, total: { lo: perHa("lo") * ha, hi: perHa("hi") * ha } };
}

/** The mix halfway along the path no mix → Subito, gratis → Pochi sensori → Progetto completo (u from 0 to 3). */
export function vineMixAt(u: number): VineMix {
  const path = [NO_MIX, ...VINE_LEVELS];
  const i = clamp(Math.floor(u), 0, path.length - 2), f = clamp(u - i, 0, 1);
  const a = path[i]!, b = path[i + 1]!;
  const lerp = (x: number, y: number, step: number) => Math.round((x + (y - x) * f) / step) * step;
  return { irrigation: lerp(a.irrigation, b.irrigation, 1), pestAnimal: lerp(a.pestAnimal, b.pestAnimal, 1), pestPlant: lerp(a.pestPlant, b.pestPlant, 1) };
}

import { useSyncExternalStore } from "react";
import type { Season } from "./season-climate";

/**
 * The piazza's reading as its simulation shows it now (the arc's season and hour): perceived heat without and with the
 * interventions. Published by the simulation, read by its map, so both always say the same numbers.
 */
export type PiazzaReading = {
  before: number; after: number; when: string;
  /** The arc's season and hour (the place's hour the year is read at) and its ends, so the dashboard draws the same arc. */
  season?: Season; hour?: number; min?: number; max?: number;
};
let piazza: PiazzaReading | null = null;
const subs = new Set<() => void>();
export function setPiazzaReading(r: PiazzaReading) {
  if (piazza && piazza.before === r.before && piazza.after === r.after && piazza.when === r.when && piazza.min === r.min && piazza.max === r.max && piazza.season === r.season && piazza.hour === r.hour) return;
  piazza = r;
  subs.forEach((f) => f());
}
export function usePiazzaReading(): PiazzaReading | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => piazza, () => null);
}
export const getPiazzaReading = (): PiazzaReading | null => piazza;

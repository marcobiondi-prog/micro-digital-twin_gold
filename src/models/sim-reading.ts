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
  /** The place it was read for (placeKey), so a reading kept from another place is never shown. */
  place?: string;
};
export const placeKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
const KEY = "mdt-piazza-reading-v1";
// Kept on the device, so the dashboard opened after a reload still follows the season and hour set in the simulation.
let piazza: PiazzaReading | null = (() => {
  try { return typeof localStorage === "undefined" ? null : (JSON.parse(localStorage.getItem(KEY) ?? "null") as PiazzaReading | null); } catch { return null; }
})();
const subs = new Set<() => void>();
export function setPiazzaReading(r: PiazzaReading) {
  if (piazza && piazza.place === r.place && piazza.before === r.before && piazza.after === r.after && piazza.when === r.when && piazza.min === r.min && piazza.max === r.max && piazza.season === r.season && piazza.hour === r.hour) return;
  piazza = r;
  try { localStorage.setItem(KEY, JSON.stringify(r)); } catch { /* storage optional */ }
  subs.forEach((f) => f());
}
const forPlace = (r: PiazzaReading | null, place?: string) => (r && place && r.place && r.place !== place ? null : r);
/** The reading, only if it was made for `place` (when given). */
export function usePiazzaReading(place?: string): PiazzaReading | null {
  const r = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => piazza, () => null);
  return forPlace(r, place);
}
export const getPiazzaReading = (place?: string): PiazzaReading | null => forPlace(piazza, place);

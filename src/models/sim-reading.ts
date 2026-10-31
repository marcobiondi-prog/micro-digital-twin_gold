import { useSyncExternalStore } from "react";

/**
 * The piazza's reading as its simulation shows it now (the arc's season and hour): perceived heat without and with the
 * interventions. Published by the simulation, read by its map, so both always say the same numbers.
 */
export type PiazzaReading = { before: number; after: number; when: string };
let piazza: PiazzaReading | null = null;
const subs = new Set<() => void>();
export function setPiazzaReading(r: PiazzaReading) {
  if (piazza && piazza.before === r.before && piazza.after === r.after && piazza.when === r.when) return;
  piazza = r;
  subs.forEach((f) => f());
}
export function usePiazzaReading(): PiazzaReading | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => piazza, () => null);
}

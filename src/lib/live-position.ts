import { useSyncExternalStore } from "react";

/**
 * Where the phone is right now, while the map's GPS follows it: kept only in memory, never saved. The map's pin and
 * camera follow it fix by fix (like a car's navigation map); the simulation's place moves only when the phone has
 * really gone somewhere else (SimulationGrid), so walking around a piazza never saves nor rebuilds anything.
 */
export type LivePos = { lat: number; lng: number; acc: number; at: number };
let live: LivePos | null = null;
const subs = new Set<() => void>();
export function setLivePos(p: LivePos | null) {
  if (p && live && p.lat === live.lat && p.lng === live.lng && p.acc === live.acc) return;
  live = p;
  subs.forEach((f) => f());
}
export const getLivePos = () => live;
export function useLivePos(): LivePos | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => live, () => null);
}

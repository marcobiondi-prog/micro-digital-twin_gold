import { useSyncExternalStore } from "react";

/**
 * Where the user put a place's pin by hand (dragged on the 2D map), per place: it wins over the centre worked out from
 * the map data, which can be missing or off. Kept on this device (localStorage mdt-pin-fix-v1), keyed by the place's
 * own point.
 */
const KEY = "mdt-pin-fix-v1";
type Fixes = Record<string, [number, number]>;
let state: Fixes = {};
let loaded = false;
const subs = new Set<() => void>();
const load = () => {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (raw && typeof raw === "object" && !Array.isArray(raw)) state = raw; } catch { /* start empty */ }
};
export const pinKey = (lat: number, lng: number) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
export function setPinFix(lat: number, lng: number, at: [number, number] | null) {
  load();
  const next = { ...state };
  if (at) next[pinKey(lat, lng)] = at; else delete next[pinKey(lat, lng)];
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* this session only */ }
  subs.forEach((f) => f());
}
const EMPTY: Fixes = {};
export function usePinFix(lat: number, lng: number): [number, number] | null {
  const all = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => { load(); return state; }, () => EMPTY);
  return all[pinKey(lat, lng)] ?? null;
}

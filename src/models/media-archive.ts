import { useSyncExternalStore } from "react";

/**
 * Photos and videos put away in the Cronologia's archive, by key ("piazza-<id>"), with when they were archived. Kept on
 * this device (localStorage mdt-media-archive-v1): archiving only moves them out of the day piles, nothing is deleted.
 */
const KEY = "mdt-media-archive-v1";
let state: Record<string, string> = {};
let loaded = false;
const subs = new Set<() => void>();
const load = () => {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (raw && typeof raw === "object") state = raw; } catch { /* unreadable: start empty */ }
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } subs.forEach((f) => f()); };
const EMPTY: Record<string, string> = {};

export function useMediaArchive(): Record<string, string> {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => { load(); return state; }, () => EMPTY);
}
export function archiveMedia(keys: string[]) { load(); const at = new Date().toISOString(); state = { ...state, ...Object.fromEntries(keys.map((k) => [k, at])) }; save(); }
export function restoreMedia(keys: string[]) { load(); const next = { ...state }; keys.forEach((k) => delete next[k]); state = next; save(); }

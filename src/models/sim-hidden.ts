import { useEffect, useMemo, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readMarks, takeLegacyMarks, writeMarks } from "@/lib/account-marks";
import { useLabMedia, type MediaItem, type MediaKind } from "@/models/lab-media-store";

/**
 * Photos and videos taken out of a simulation, by key ("piazza-<id>"), with when. Deleting in the simulation (a row,
 * a group, Elimina tutti) only takes the file out of the simulation's list (and of its report): it stays in the
 * Cronologia, where it can still be seen, archived or deleted for good. Kept on this device (localStorage
 * mdt-sim-hidden-v1) and, signed in, in the account's media storage (<user>/meta/sim-hidden.json, lib/account-marks), merged on sign-in like the archive.
 */
const KEY = "mdt-sim-hidden-v1";
let state: Record<string, string> = {};
let loaded = false;
const subs = new Set<() => void>();
const load = () => {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (raw && typeof raw === "object") state = raw; } catch { /* unreadable: start empty */ }
};
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } subs.forEach((f) => f()); };
const upload = () => writeMarks("sim-hidden", state);
const save = () => { keep(); void upload(); };
const isMarks = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** Mounted once by the root: on sign-in the account's marks and this device's are merged (never replaced). */
export function useSyncSimHidden() {
  useEffect(() => {
    // The account's marks (its file, plus what an older version kept in the user data, moved out of it) and this
    // device's are merged, never replaced.
    const adopt = async (uid: string, meta: unknown) => {
      load();
      const legacy = await takeLegacyMarks("sim_hidden", meta);
      const saved = await readMarks(uid, "sim-hidden");
      const merged = { ...legacy, ...saved, ...state };
      const changed = Object.keys(merged).length !== Object.keys(saved).length;
      state = merged; keep();
      if (changed && Object.keys(merged).length) upload();
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) void adopt(data.session.user.id, data.session.user.user_metadata); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => { if (event === "SIGNED_IN" && s) void adopt(s.user.id, s.user.user_metadata); });
    return () => data.subscription.unsubscribe();
  }, []);
}

const EMPTY: Record<string, string> = {};
export function useSimHidden(): Record<string, string> {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => { load(); return state; }, () => EMPTY);
}
export const flowOf = (k: MediaKind) => (k === "urban" ? "piazza" : "vigneto");
export const simKey = (k: MediaKind, id: string) => `${flowOf(k)}-${id}`;
export function hideFromSim(k: MediaKind, items: MediaItem[]) {
  load();
  const at = new Date().toISOString();
  state = { ...state, ...Object.fromEntries(items.map((i) => [simKey(k, i.id), at])) };
  save();
}
/** Drops marks: a file deleted for good, or put back in its simulation. */
export function unhide(keys: string[]) { load(); if (!keys.some((k) => state[k])) return; const next = { ...state }; keys.forEach((k) => delete next[k]); state = next; save(); }
/** A file moved to a new id (uploaded from the device to the account): its mark follows it. */
export function moveHidden(from: string, to: string) {
  load();
  if (!state[from]) return;
  const next = { ...state, [to]: state[from]! };
  delete next[from];
  state = next; save();
}
export function isHidden(k: MediaKind, id: string) { load(); return !!state[simKey(k, id)]; }
/** The simulation's own photos and videos: every file of the project but those taken out of it. */
export function simOnly(k: MediaKind, list: MediaItem[]) { load(); return list.filter((i) => !state[simKey(k, i.id)]); }
export function useSimMedia(k: MediaKind) {
  const all = useLabMedia(k);
  const hidden = useSimHidden();
  return useMemo(() => all.filter((i) => !hidden[simKey(k, i.id)]), [all, hidden, k]);
}

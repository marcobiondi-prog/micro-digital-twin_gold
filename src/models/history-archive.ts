import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readMarks, writeMarks } from "@/lib/account-marks";

/**
 * Interventions put away in the Cronologia's archive, by entry id, with when they were archived — like the photos'
 * archive (models/media-archive): kept on this device (localStorage mdt-history-archive-v1) and, signed in, in the
 * account's media storage (<user>/meta/history-archive.json, lib/account-marks), merged on sign-in, never replaced.
 * Archiving deletes nothing: it only moves the entries out of the day cards.
 */
const KEY = "mdt-history-archive-v1";
let state: Record<string, string> = {};
let loaded = false;
const subs = new Set<() => void>();
const load = () => {
  if (loaded || typeof localStorage === "undefined") return;
  loaded = true;
  try { const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}"); if (raw && typeof raw === "object" && !Array.isArray(raw)) state = raw; } catch { /* unreadable: start empty */ }
};
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } subs.forEach((f) => f()); };
const upload = () => writeMarks("history-archive", state);
const save = () => { keep(); void upload(); };

/** Mounted once by the root: on sign-in the account's archive and this device's are merged and kept in both. */
export function useSyncHistoryArchive() {
  useEffect(() => {
    const adopt = async (uid: string) => {
      load();
      const saved = await readMarks(uid, "history-archive");
      const merged = { ...saved, ...state };
      const changed = Object.keys(merged).length !== Object.keys(saved).length;
      state = merged; keep();
      if (changed && Object.keys(merged).length) upload();
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) void adopt(data.session.user.id); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => { if (event === "SIGNED_IN" && s) void adopt(s.user.id); });
    return () => data.subscription.unsubscribe();
  }, []);
}
const EMPTY: Record<string, string> = {};

export function useHistoryArchive(): Record<string, string> {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => { load(); return state; }, () => EMPTY);
}
export function archiveHistory(ids: string[]) { load(); const at = new Date().toISOString(); state = { ...state, ...Object.fromEntries(ids.map((k) => [k, at])) }; save(); }
export function restoreHistory(ids: string[]) { load(); const next = { ...state }; ids.forEach((k) => delete next[k]); state = next; save(); }

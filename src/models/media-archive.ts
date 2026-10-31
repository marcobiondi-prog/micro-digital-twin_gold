import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Photos and videos put away in the Cronologia's archive, by key ("piazza-<id>"), with when they were archived. Kept on
 * this device (localStorage mdt-media-archive-v1) and, signed in (Premium), in the account's user data
 * (media_archive), so it follows the user on every device: archiving only moves them out of the day piles.
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
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage unavailable */ } subs.forEach((f) => f()); };
/** To the account too, when signed in. */
const upload = async () => {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  if (data.session) await supabase.auth.updateUser({ data: { media_archive: state } }).catch(() => undefined);
};
const save = () => { keep(); void upload(); };
const isArchive = (v: unknown): v is Record<string, string> => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/** Mounted once: on sign-in the account's archive comes to this device, or this device's goes to an account without one. */
export function useSyncMediaArchive() {
  useEffect(() => {
    const adopt = (meta: unknown) => {
      load();
      const saved = (meta as { media_archive?: unknown } | null)?.media_archive;
      // Merged, never replaced: what this device archived and what the account archived both stay in the archive.
      const merged = { ...(isArchive(saved) ? saved : {}), ...state };
      const changed = !isArchive(saved) || Object.keys(merged).length !== Object.keys(saved).length;
      state = merged; keep();
      if (changed && Object.keys(merged).length) void upload();
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) adopt(data.session.user.user_metadata); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => { if (event === "SIGNED_IN" && s) adopt(s.user.user_metadata); });
    return () => data.subscription.unsubscribe();
  }, []);
}
const EMPTY: Record<string, string> = {};

export function useMediaArchive(): Record<string, string> {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => { load(); return state; }, () => EMPTY);
}
export function archiveMedia(keys: string[]) { load(); const at = new Date().toISOString(); state = { ...state, ...Object.fromEntries(keys.map((k) => [k, at])) }; save(); }
export function restoreMedia(keys: string[]) { load(); const next = { ...state }; keys.forEach((k) => delete next[k]); state = next; save(); }

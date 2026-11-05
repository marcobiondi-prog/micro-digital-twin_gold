import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isProId, type ProId } from "@/models/professional-id";

/**
 * The professional profile in use: kept on this device (localStorage) and, signed in, in the account's user data too,
 * so it follows the account to another device. undefined while the page is not yet on the phone (server render).
 */
const KEY = "mdt-pro-id-v1";
let current: ProId | null | undefined;
const subs = new Set<() => void>();

const read = (): ProId | null => {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    return isProId(v) ? v : null;
  } catch { return null; }
};
const snapshot = () => (current === undefined ? (current = read()) : current);
const set = (id: ProId | null) => {
  current = id;
  try {
    if (id) window.localStorage.setItem(KEY, JSON.stringify(id));
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode: memory only */ }
  subs.forEach((f) => f());
};

/** The profile now, read outside React (the root's landing after the tutorial). */
export const getProId = (): ProId | null => snapshot() ?? null;

export function useProId(): ProId | null | undefined {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, snapshot, () => undefined);
}

/** Saves the profile (null removes it) on this device and, signed in, in the account. */
export async function saveProId(id: ProId | null): Promise<void> {
  set(id);
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.auth.updateUser({ data: { pro_id: id } }).catch(() => undefined);
}

/** Before signing out: the profile on this device goes into the account (if a save had failed), so the next sign-in brings it back. */
export async function keepProIdInAccount(): Promise<void> {
  const id = snapshot();
  if (id) await supabase.auth.updateUser({ data: { pro_id: id } }).catch(() => undefined);
}

/**
 * Mounted once: on sign-in the account's profile comes to this device, or this device's goes to an account without one;
 * on sign-out the profile leaves this device (kept in the account for the next sign-in).
 */
export function useSyncProId() {
  useEffect(() => {
    const adopt = (meta: unknown) => {
      const saved = (meta as { pro_id?: unknown } | null)?.pro_id;
      if (isProId(saved)) set(saved);
      else if (snapshot()) void supabase.auth.updateUser({ data: { pro_id: snapshot() } }).catch(() => undefined);
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) adopt(data.session.user.user_metadata); });
    // Signing out of the personal account signs out of the professional profile too (it stays saved in the account
    // and comes back with the next sign-in).
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) adopt(s.user.user_metadata);
      if (event === "SIGNED_OUT" && snapshot()) {
        set(null);
        toast("Sei uscito anche dal profilo professionale", { description: "Accedi di nuovo e torna da solo." });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

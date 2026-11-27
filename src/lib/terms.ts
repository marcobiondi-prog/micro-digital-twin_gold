import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Terms of use accepted once: after the tutorial a page asks to accept the Termini di servizio and the Informativa
 * sulla privacy; once accepted it is never asked again on this device (localStorage mdt-terms-v1, the time accepted)
 * and, signed in, in the account (user data terms_at), so a sign-in on another device brings the acceptance with it.
 */
const KEY = "mdt-terms-v1";
export const TERMS_VERSION = 1;
const listeners = new Set<() => void>();

export function termsAcceptedAt(): number | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { at?: number; v?: number } | null;
    return v && typeof v.at === "number" ? v.at : null;
  } catch { return null; }
}

function markLocal(at: number) {
  try { localStorage.setItem(KEY, JSON.stringify({ at, v: TERMS_VERSION })); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}

export function useTermsAcceptedAt(): number | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, termsAcceptedAt, () => null);
}

/** Accepted now: on this device and, signed in, in the account. Never undone. */
export async function acceptTerms() {
  if (termsAcceptedAt()) return;
  const at = Date.now();
  markLocal(at);
  await writeAccount(at);
}

async function writeAccount(at: number) {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || (user.user_metadata as { terms_at?: number } | null)?.terms_at) return;
    await supabase.auth.updateUser({ data: { terms_at: at, terms_v: TERMS_VERSION } });
  } catch { /* offline: the device keeps it, the next sign-in writes it */ }
}

/** Keeps device and account in step: an account that accepted brings it here, a device that accepted writes it there. */
export function installTermsSync() {
  const step = (user: { user_metadata?: unknown } | null | undefined) => {
    if (!user) return;
    const acc = (user.user_metadata as { terms_at?: number } | null)?.terms_at;
    const local = termsAcceptedAt();
    if (acc && !local) markLocal(acc);
    else if (local && !acc) void writeAccount(local);
  };
  void supabase.auth.getSession().then(({ data }) => step(data.session?.user));
  const { data } = supabase.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_IN") step(session?.user); });
  return () => data.subscription.unsubscribe();
}

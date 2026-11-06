import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isProId, type ProId, type ProKind } from "@/models/professional-id";

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
const snapshot = () => {
  if (current === undefined) {
    current = read();
    // A profile saved before this memory existed counts as registered too (written quietly: no re-render from here).
    if (current && !lastSnap()[current.kind]) { last = { ...lastSnap(), [current.kind]: current }; try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* memory only */ } }
  }
  return current;
};
/**
 * The last profile registered of each kind (on this device, and signed in in the account as pro_last): leaving a
 * profile or the account keeps it, so identifying again as the same professional recognises it — "Continua come …" —
 * and its project's history comes back with it.
 */
const LAST_KEY = "mdt-pro-id-last-v1";
type Last = Partial<Record<ProKind, ProId>>;
let last: Last | undefined;
const readLast = (): Last => {
  try {
    const v = JSON.parse(window.localStorage.getItem(LAST_KEY) ?? "{}") as Record<string, unknown>;
    const out: Last = {};
    for (const k of ["agronomo", "funzionario"] as const) { const p = v[k]; if (isProId(p) && p.kind === k) out[k] = p; }
    return out;
  } catch { return {}; }
};
const lastSnap = () => (last === undefined ? (last = readLast()) : last);
const keepLast = (id: ProId) => {
  last = { ...lastSnap(), [id.kind]: id };
  try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* memory only */ }
  subs.forEach((f) => f());
};
/** The profile of that kind registered before on this device or account, if any. */
export function useLastProId(kind: ProKind | null): ProId | null {
  const all = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, lastSnap, () => ({}) as Last);
  return kind ? all[kind] ?? null : null;
}
export const lastProKind = (): ProKind | null => {
  const l = lastSnap();
  return l.funzionario && !l.agronomo ? "funzionario" : l.agronomo && !l.funzionario ? "agronomo" : null;
};

/**
 * Guest mode: "Entra come ospite" on the sector page lets one in without a professional profile — both simulations
 * open, to try them. Kept on this device (localStorage mdt-guest-v1); identifying as a profile ends it.
 */
const GUEST_KEY = "mdt-guest-v1";
let guest: boolean | undefined;
const guestSnap = () => {
  if (guest === undefined) { try { guest = window.localStorage.getItem(GUEST_KEY) === "1"; } catch { guest = false; } }
  return guest;
};
const setGuestFlag = (on: boolean) => {
  guest = on;
  try { if (on) window.localStorage.setItem(GUEST_KEY, "1"); else window.localStorage.removeItem(GUEST_KEY); } catch { /* memory only */ }
  subs.forEach((f) => f());
};
/** Enters as a guest: no profile, both simulations open. */
export function enterAsGuest() { setGuestFlag(true); clearSectorGate(); }
/** Leaves guest mode (the sector page shows again). */
export function leaveGuest() { setGuestFlag(false); }
export const isGuest = (): boolean => guestSnap();
/** Whether one entered as a guest (false while the page is not yet on the phone). */
export function useGuest(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, guestSnap, () => false);
}

const set = (id: ProId | null) => {
  if (id) { keepLast(id); if (guestSnap()) { guest = false; try { window.localStorage.removeItem(GUEST_KEY); } catch { /* memory only */ } } }
  current = id;
  try {
    if (id) window.localStorage.setItem(KEY, JSON.stringify(id));
    else window.localStorage.removeItem(KEY);
  } catch { /* private mode: memory only */ }
  subs.forEach((f) => f());
};

/**
 * The sector page (views/v10/SectorGate) opened on one sector's form: after leaving a profile or the account, or from
 * the account panel's identification rows — straight to the form, past the sector choice and the profile page.
 */
type GateAsk = { kind: ProKind | null; at: number };
let gateAsk: GateAsk = { kind: null, at: 0 };
const gateSubs = new Set<() => void>();
export function openSectorGate(kind: ProKind | null) { gateAsk = { kind, at: Date.now() }; gateSubs.forEach((f) => f()); }
export function clearSectorGate() { if (gateAsk.at) { gateAsk = { kind: null, at: 0 }; gateSubs.forEach((f) => f()); } }
export function useSectorGateAsk(): GateAsk {
  return useSyncExternalStore((f) => { gateSubs.add(f); return () => { gateSubs.delete(f); }; }, () => gateAsk, () => gateAsk);
}

/** The profile now, read outside React (the root's landing after the tutorial). */
export const getProId = (): ProId | null => snapshot() ?? null;

export function useProId(): ProId | null | undefined {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, snapshot, () => undefined);
}

/** The account's own registered profiles, plus the one now in use: never the other profiles this device knows. */
const accountLast = (meta: unknown, id: ProId | null): Record<string, ProId> => {
  const prev = (meta as { pro_last?: Record<string, unknown> } | null)?.pro_last ?? {};
  const out: Record<string, ProId> = {};
  for (const k of ["agronomo", "funzionario"] as const) { const p = prev[k]; if (isProId(p) && p.kind === k) out[k] = p; }
  if (id) out[id.kind] = id;
  return out;
};

/** Saves the profile (null removes it) on this device and, signed in, in the account. */
export async function saveProId(id: ProId | null): Promise<void> {
  set(id);
  const { data } = await supabase.auth.getSession();
  // pro_left: the profile was left on purpose ("Esci dal profilo"), so the next sign-in does not bring it back by itself.
  if (data.session) await supabase.auth.updateUser({ data: { pro_id: id, pro_last: accountLast(data.session.user.user_metadata, id), pro_left: id === null } }).catch(() => undefined);
}

/** Before signing out: the profile on this device goes into the account (if a save had failed), so the next sign-in brings it back. */
export async function keepProIdInAccount(): Promise<void> {
  const id = snapshot();
  const { data } = await supabase.auth.getSession();
  if (id && data.session) await supabase.auth.updateUser({ data: { pro_id: id, pro_last: accountLast(data.session.user.user_metadata, id) } }).catch(() => undefined);
}

/**
 * Mounted once: on sign-in the account's profile comes to this device, or this device's goes to an account without one;
 * on sign-out the profile leaves this device (kept in the account for the next sign-in).
 */
/**
 * Once per account (pro_checked): a profile in use that the account never worked with — a municipal officer's on an
 * account whose history is all vineyard, or the reverse — came from this device, not from the account (an older
 * sign-in took the device's profile). When a profile of the kind the account did work with is known (the account's
 * own registered ones first, then this device's), it is put back with a toast; without one, the sector page opens on
 * that kind's form.
 */
async function checkKind(inUse: ProId, meta: unknown) {
  if ((meta as { pro_checked?: unknown } | null)?.pro_checked === true) return;
  const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { limit: (n: number) => Promise<{ data: Array<{ flow: string }> | null; error: unknown }> } } })
    .from("intervention_history").select("flow").limit(1000);
  if (error || !data) return;
  const piazza = data.filter((r) => r.flow === "piazza").length, vigneto = data.filter((r) => r.flow === "vigneto").length;
  const worked: ProKind | null = vigneto > 0 && piazza === 0 ? "agronomo" : piazza > 0 && vigneto === 0 ? "funzionario" : null;
  const done = () => supabase.auth.updateUser({ data: { pro_checked: true } }).catch(() => undefined);
  if (!worked || worked === inUse.kind) { void done(); return; }
  const prev = (meta as { pro_last?: Record<string, unknown> } | null)?.pro_last?.[worked];
  const right = isProId(prev) && prev.kind === worked ? prev : lastSnap()[worked] ?? null;
  if (right) {
    await saveProId(right);
    void done();
    toast(`Ho rimesso il tuo profilo: ${right.name}`, { description: worked === "agronomo" ? "Il tuo account ha sempre lavorato sul vigneto." : "Il tuo account ha sempre lavorato sulla piazza." });
    return;
  }
  // No profile of that kind is known: the wrong one leaves the account (in use and registered) and the sector page
  // opens on the right form.
  const own = { ...((meta as { pro_last?: Record<string, unknown> } | null)?.pro_last ?? {}) };
  delete own[inUse.kind];
  set(null);
  void supabase.auth.updateUser({ data: { pro_id: null, pro_last: own, pro_checked: true } }).catch(() => undefined);
  openSectorGate(worked);
  toast(worked === "agronomo" ? "Il tuo account ha sempre lavorato sul vigneto" : "Il tuo account ha sempre lavorato sulla piazza", { description: "Identificati di nuovo: ci vuole un minuto." });
}

export function useSyncProId() {
  useEffect(() => {
    const adopt = (meta: unknown) => {
      // The profiles registered before with this account come to this device too.
      const prev = (meta as { pro_last?: Record<string, unknown> } | null)?.pro_last;
      if (prev && typeof prev === "object") for (const k of ["agronomo", "funzionario"] as const) { const p = prev[k]; if (isProId(p) && p.kind === k && !lastSnap()[k]) keepLast(p); }
      const saved = (meta as { pro_id?: unknown } | null)?.pro_id;
      if (isProId(saved)) { set(saved); void checkKind(saved, meta); return; }
      // What the account itself registered (never the profiles this device met before signing in, which can be someone
      // else's or a guest's try): the most recent of them comes back by itself.
      const own = (["agronomo", "funzionario"] as const).map((k) => (prev as Record<string, unknown> | undefined)?.[k]).filter((p): p is ProId => isProId(p));
      if ((meta as { pro_left?: unknown } | null)?.pro_left === true) return;
      const back = own.sort((x, y) => (y.at > x.at ? 1 : -1))[0];
      if (back) { set(back); void supabase.auth.updateUser({ data: { pro_id: back } }).catch(() => undefined); toast(`Bentornato, ${back.name}`, { description: "Sei entrato con il tuo profilo professionale." }); return; }
      // A brand-new account with no profile of its own takes the one identified on this device.
      if (snapshot()) void supabase.auth.updateUser({ data: { pro_id: snapshot() } }).catch(() => undefined);
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) adopt(data.session.user.user_metadata); });
    // Signing out of the personal account signs out of the professional profile too (it stays saved in the account
    // and comes back with the next sign-in).
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) adopt(s.user.user_metadata);
      if (event === "SIGNED_OUT" && snapshot()) {
        const was = snapshot()!.kind;
        set(null);
        // The sector page opens straight on that profile's form, which recognises it.
        openSectorGate(was);
        toast("Sei uscito anche dal profilo professionale", { description: "Accedi di nuovo e torna da solo." });
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

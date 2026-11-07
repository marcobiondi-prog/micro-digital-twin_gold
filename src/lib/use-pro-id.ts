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
/**
 * Every profile registered on this device, per kind, newest first (localStorage mdt-pro-id-known-v1, at most
 * KNOWN_MAX each): when more people identified on the same phone — two officers of different offices, two farmers —
 * the form's "Ti abbiamo riconosciuto" lets one choose who is using it. The same person identified again (same name
 * and the same licence or town and office) replaces their older entry.
 */
const KNOWN_KEY = "mdt-pro-id-known-v1";
const KNOWN_MAX = 8;
const KNOWN_KINDS = ["agronomo", "funzionario"] as const;
type Known = Record<ProKind, ProId[]>;
let known: Known | undefined;
const sameProfile = (a: ProId, b: ProId) => a.kind === b.kind && a.name.trim().toLowerCase() === b.name.trim().toLowerCase()
  && (a.kind === "agronomo" && b.kind === "agronomo" ? a.licence === b.licence && a.region === b.region
    : a.kind === "funzionario" && b.kind === "funzionario" ? a.comune === b.comune && a.office === b.office : false);
const knownSnap = (): Known => {
  if (known) return known;
  const out: Known = { agronomo: [], funzionario: [] };
  try {
    const v = JSON.parse(window.localStorage.getItem(KNOWN_KEY) ?? "{}") as Record<string, unknown>;
    for (const k of KNOWN_KINDS) { const list = v[k]; if (Array.isArray(list)) out[k] = list.filter((p): p is ProId => isProId(p) && p.kind === k).slice(0, KNOWN_MAX); }
  } catch { /* none */ }
  // The last profile of each kind, kept before this list existed, counts too.
  for (const k of KNOWN_KINDS) { const p = lastSnap()[k]; if (p && !out[k].some((q) => sameProfile(q, p))) out[k] = [...out[k], p]; }
  return (known = out);
};
const keepKnown = (id: ProId) => {
  const k = knownSnap();
  known = { ...k, [id.kind]: [id, ...k[id.kind].filter((p) => !sameProfile(p, id))].slice(0, KNOWN_MAX) };
  try { window.localStorage.setItem(KNOWN_KEY, JSON.stringify(known)); } catch { /* memory only */ }
};
/** Takes a profile off this device's list of profiles registered before (it stays in the account it was saved to). */
export function forgetKnownProId(id: ProId) {
  const k = knownSnap();
  known = { ...k, [id.kind]: k[id.kind].filter((p) => !sameProfile(p, id)) };
  try { window.localStorage.setItem(KNOWN_KEY, JSON.stringify(known)); } catch { /* memory only */ }
  const l = lastSnap();
  if (l[id.kind] && sameProfile(l[id.kind]!, id)) {
    const rest = { ...l }; const next = known[id.kind][0];
    if (next) rest[id.kind] = next; else delete rest[id.kind];
    last = rest;
    try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* memory only */ }
  }
  subs.forEach((f) => f());
}
const keepLast = (id: ProId) => {
  last = { ...lastSnap(), [id.kind]: id };
  try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* memory only */ }
  keepKnown(id);
  subs.forEach((f) => f());
};
const EMPTY_KNOWN: Known = { agronomo: [], funzionario: [] };
/** Every profile of that kind registered before on this device (or brought by the account), newest first. */
export function useKnownProIds(kind: ProKind | null): ProId[] {
  const all = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, knownSnap, () => EMPTY_KNOWN);
  return kind ? all[kind] : [];
}
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

/**
 * The kinds of profile the account itself registered (user data pro_own): a profile counts as the account's only when it
 * was identified, or picked again, while signed in to it. A profile that reached the account any other way — an older
 * sign-in uploaded the one this device had, a guest's try, someone else's — is not its own and never comes back by itself.
 */
type Meta = { pro_id?: unknown; pro_last?: Record<string, unknown>; pro_left?: unknown; pro_own?: unknown } | null;
const KINDS = ["agronomo", "funzionario"] as const;
const ownOf = (meta: unknown): ProKind[] | null => {
  const v = (meta as Meta)?.pro_own;
  return Array.isArray(v) ? KINDS.filter((k) => v.includes(k)) : null;
};

/** The account's own registered profiles, plus the one now in use: never the other profiles this device knows. */
const accountLast = (meta: unknown, id: ProId | null, own: ProKind[]): Record<string, ProId> => {
  const prev = (meta as Meta)?.pro_last ?? {};
  const out: Record<string, ProId> = {};
  for (const k of own) { const p = prev[k]; if (isProId(p) && p.kind === k) out[k] = p; }
  if (id) out[id.kind] = id;
  return out;
};
const withKind = (own: ProKind[], id: ProId | null) => (id && !own.includes(id.kind) ? [...own, id.kind] : own);

/** Saves the profile (null removes it) on this device and, signed in, in the account, as the account's own. */
/** When a profile was last chosen on this device (identified, picked again or left): a sign-in being read meanwhile does not override it. */
let pickedAt = 0;
export async function saveProId(id: ProId | null): Promise<void> {
  pickedAt = Date.now();
  set(id);
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const meta = data.session.user.user_metadata, own = withKind(ownOf(meta) ?? [], id);
  // pro_left: the profile was left on purpose ("Esci dal profilo"), so the next sign-in does not bring it back by itself.
  await supabase.auth.updateUser({ data: { pro_id: id, pro_last: accountLast(meta, id, own), pro_own: own, pro_left: id === null } }).catch(() => undefined);
}

/** Before signing out: the profile in use (identified while signed in, so the account's own) is kept in the account. */
export async function keepProIdInAccount(): Promise<void> {
  const id = snapshot();
  const { data } = await supabase.auth.getSession();
  if (!id || !data.session) return;
  const meta = data.session.user.user_metadata, own = withKind(ownOf(meta) ?? [], id);
  await supabase.auth.updateUser({ data: { pro_id: id, pro_last: accountLast(meta, id, own), pro_own: own } }).catch(() => undefined);
}

/**
 * Accounts saved before pro_own: their own kinds are read once from what they did — the kinds whose project has
 * interventions in the account's history. An account with no history owns none, and is asked to identify again.
 */
async function legacyOwn(): Promise<ProKind[] | null> {
  const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { limit: (n: number) => Promise<{ data: Array<{ flow: string }> | null; error: unknown }> } } })
    .from("intervention_history").select("flow").limit(1000);
  if (error || !data) return null;
  const out: ProKind[] = [];
  if (data.some((r) => r.flow === "vigneto")) out.push("agronomo");
  if (data.some((r) => r.flow === "piazza")) out.push("funzionario");
  return out;
}

/**
 * Mounted once: on sign-in the account's profile comes to this device, or this device's goes to an account without one;
 * on sign-out the profile leaves this device (kept in the account for the next sign-in).
 */
export function useSyncProId() {
  useEffect(() => {
    let adopted = "";
    const adopt = async (userId: string, meta: unknown) => {
      if (adopted === userId) return;
      adopted = userId;
      const startedAt = Date.now();
      const legacy = ownOf(meta) === null;
      const own = ownOf(meta) ?? (await legacyOwn());
      if (own === null) { adopted = ""; return; } // history not readable now: decide at the next sign-in or opening
      const prev = (meta as Meta)?.pro_last ?? {};
      // The account's own registered profiles come to this device too ("Continua come …" on its form).
      for (const k of own) { const p = prev[k]; if (isProId(p) && p.kind === k) { if (!lastSnap()[k]) keepLast(p); else keepKnown(p); } }
      const saved = (meta as Meta)?.pro_id;
      const mine = (p: unknown): p is ProId => isProId(p) && own.includes(p.kind);
      const left = (meta as Meta)?.pro_left === true;
      const back = mine(saved) ? saved : left ? null : own.map((k) => prev[k]).filter(mine).sort((x, y) => (y.at > x.at ? 1 : -1))[0] ?? null;
      // A profile chosen on this device while the account was being read (the history check takes a moment) wins: the
      // account's older one would replace it — a farmer just picked on the vineyard's page turned back into an officer.
      if (pickedAt >= startedAt) return;
      const clean = { pro_id: back, pro_last: accountLast(meta, back, own), pro_own: own };
      const dirty = legacy || (saved != null && !mine(saved)) || KINDS.some((k) => prev[k] != null && !own.includes(k));
      if (back) {
        set(back);
        if (dirty || !mine(saved)) void supabase.auth.updateUser({ data: clean }).catch(() => undefined);
        if (!mine(saved)) toast(`Bentornato, ${back.name}`, { description: "Sei entrato con il tuo profilo professionale." });
        return;
      }
      // The account never registered a profile of its own: none is given to it (not even this device's); the sector
      // page asks to choose the sector and identify, or to enter as a guest.
      set(null);
      if (dirty) void supabase.auth.updateUser({ data: clean }).catch(() => undefined);
      if (!left && !guestSnap()) openSectorGate(null);
      if (saved != null && !mine(saved)) toast("Questo account non ha ancora un profilo professionale", { description: "Scegli il settore e identificati, oppure entra come ospite." });
    };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) void adopt(data.session.user.id, data.session.user.user_metadata); });
    // Signing out of the personal account signs out of the professional profile too (it stays saved in the account
    // and comes back with the next sign-in).
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && s) void adopt(s.user.id, s.user.user_metadata);
      if (event === "SIGNED_OUT") adopted = "";
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

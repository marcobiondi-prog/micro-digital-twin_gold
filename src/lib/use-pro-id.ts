import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isProId, type ProId, type ProKind } from "@/models/professional-id";
import { getAccountAvatar } from "@/lib/account-avatar";

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
/** The personal account a profile was registered with: its email and a small copy of its picture (a data URL, so a
 * signed link that expires never leaves the list without a face). */
export type KnownAccount = { email?: string; pic?: string; provider?: string };
export type KnownProId = ProId & { acct?: KnownAccount };
const saveKnown = () => { try { window.localStorage.setItem(KNOWN_KEY, JSON.stringify(known)); } catch { /* memory only */ } };
const keepKnown = (id: ProId, acct?: KnownAccount) => {
  const k = knownSnap();
  const old = k[id.kind].find((p) => sameProfile(p, id)) as KnownProId | undefined;
  const keep = acct ?? old?.acct;
  const entry: KnownProId = keep ? { ...id, acct: keep } : { ...id };
  known = { ...k, [id.kind]: [entry, ...k[id.kind].filter((p) => !sameProfile(p, id))].slice(0, KNOWN_MAX) };
  saveKnown();
  if (!acct) void attachAccount(id);
};
/** A 96 px JPEG of the account picture, or the picture's own link when it cannot be read (another site's picture). */
async function smallPicture(src: string | null): Promise<string | undefined> {
  if (!src) return undefined;
  if (src.startsWith("data:")) return src;
  try {
    const blob = await (await fetch(src)).blob();
    const bmp = await createImageBitmap(blob);
    const side = 96, s = Math.min(bmp.width, bmp.height);
    const c = document.createElement("canvas"); c.width = side; c.height = side;
    c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, side, side);
    return c.toDataURL("image/jpeg", 0.8);
  } catch { return /supabase\.co\/storage/.test(src) ? undefined : src; }
}
/** Ties a profile just registered (or brought back) to the personal account signed in now: its email and picture. */
async function attachAccount(id: ProId) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  const acct: KnownAccount = { ...(user.email ? { email: user.email } : {}), ...(user.app_metadata?.provider ? { provider: String(user.app_metadata.provider) } : {}) };
  const pic = await smallPicture(getAccountAvatar());
  if (pic) acct.pic = pic;
  const k = knownSnap();
  const entry = (k[id.kind] as KnownProId[]).find((p) => sameProfile(p, id));
  // A profile already tied to another personal account stays that account's.
  if (!entry || (entry.acct?.email && entry.acct.email.toLowerCase() !== acct.email?.toLowerCase())) return;
  known = { ...k, [id.kind]: k[id.kind].map((p) => (sameProfile(p, id) ? { ...p, acct } : p)) };
  saveKnown();
  subs.forEach((f) => f());
}
/**
 * Brings the signed-in account's email and picture to the profiles on this phone that are its own: those already tied
 * to its email, its registered profiles (pro_last) and the one in use — so profiles registered before the list kept
 * accounts get their picture and email too. Run by the account control whenever the account's picture is known.
 */
export async function syncKnownAccounts(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return;
  const email = user.email;
  const lastOf = (user.user_metadata as { pro_last?: Record<string, unknown> } | null)?.pro_last ?? {};
  const pic = await smallPicture(getAccountAvatar());
  const k = knownSnap();
  const inUse = current ?? null;
  let changed = false;
  const next: Known = { agronomo: [], funzionario: [] };
  for (const kind of KNOWN_KINDS) {
    next[kind] = (k[kind] as KnownProId[]).map((p) => {
      const saved = lastOf[kind];
      const mine = p.acct?.email?.toLowerCase() === email.toLowerCase() || (isProId(saved) && sameProfile(p, saved)) || (!p.acct && inUse != null && sameProfile(p, inUse));
      if (!mine) return p;
      const provider = user.app_metadata?.provider ? String(user.app_metadata.provider) : p.acct?.provider;
      const acct: KnownAccount = { email, ...((pic ?? p.acct?.pic) ? { pic: pic ?? p.acct!.pic! } : {}), ...(provider ? { provider } : {}) };
      if (p.acct?.email === acct.email && p.acct?.pic === acct.pic && p.acct?.provider === acct.provider) return p;
      changed = true;
      return { ...p, acct };
    });
  }
  if (!changed) return;
  known = next;
  saveKnown();
  subs.forEach((f) => f());
}
/** Takes a profile off this device's list of profiles registered before (it stays in the account it was saved to). */
export function forgetKnownProId(id: ProId) {
  const k = knownSnap();
  known = { ...k, [id.kind]: k[id.kind].filter((p) => !sameProfile(p, id)) };
  saveKnown();
  const l = lastSnap();
  if (l[id.kind] && sameProfile(l[id.kind]!, id)) {
    const rest = { ...l }; const next = known[id.kind][0];
    if (next) rest[id.kind] = next; else delete rest[id.kind];
    last = rest;
    try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* memory only */ }
  }
  subs.forEach((f) => f());
}
/**
 * Gives a profile kept on this phone the name the person chooses (accounts often carry the same Google name): the
 * known list and the last profile of its kind are rewritten, and when it is the profile in use it is saved again
 * (in the account too, when signed in). Returns the renamed profile.
 */
export async function renameKnownProId(id: ProId, name: string): Promise<KnownProId | null> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return null;
  const k = knownSnap();
  let renamed: KnownProId | null = null;
  known = { ...k, [id.kind]: (k[id.kind] as KnownProId[]).map((p) => (sameProfile(p, id) ? (renamed = { ...p, name: clean }) : p)) };
  saveKnown();
  const l = lastSnap();
  if (l[id.kind] && sameProfile(l[id.kind]!, id)) {
    last = { ...l, [id.kind]: { ...l[id.kind]!, name: clean } };
    try { window.localStorage.setItem(LAST_KEY, JSON.stringify(last)); } catch { /* memory only */ }
  }
  const cur = snapshot();
  if (cur && sameProfile(cur, id)) await saveProId({ ...cur, name: clean });
  subs.forEach((f) => f());
  return renamed;
}
/** Ties a profile kept on this phone to the account it really belongs to (its email), replacing a wrong tie. */
function retieKnown(id: ProId, email: string) {
  const k = knownSnap();
  let changed = false;
  const list = (k[id.kind] as KnownProId[]).map((p) => {
    if (!sameProfile(p, id) || p.acct?.email?.toLowerCase() === email.toLowerCase()) return p;
    changed = true;
    return { ...p, acct: { email, ...(p.acct?.email === email ? { pic: p.acct?.pic } : {}) } };
  });
  if (!changed) return;
  known = { ...k, [id.kind]: list };
  saveKnown();
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
/** Every profile kept on this phone, both kinds. */
export function getKnownProIds(): KnownProId[] { const k = knownSnap(); return [...k.agronomo, ...k.funzionario] as KnownProId[]; }
export function useKnownProIds(kind: ProKind | null): KnownProId[] {
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

/** Drops the profile in use from this device only (the account keeps it), when leaving the account for another. */
export function dropProIdOnDevice() { set(null); }
/** Puts a profile in use on this device only (no account write), before leaving the account for it. */
export function setProIdOnDevice(id: ProId) { pickedAt = Date.now(); set(id); }
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

/**
 * One personal account, one sector: an account belongs to the sector of its first professional profile (user data
 * pro_sector — set when the account first identifies; for accounts saved before it, the kind it owns, or with both the
 * one in use, else the most recent). Signed in to it, the other sector's profiles cannot be identified nor picked: the
 * other sector needs another personal account (IdentifyForm shows AccountSectorLock instead).
 */
export function sectorOf(meta: unknown): ProKind | null {
  const m = meta as (Meta & { pro_sector?: unknown }) | null;
  if (m?.pro_sector === "agronomo" || m?.pro_sector === "funzionario") return m.pro_sector;
  const own = ownOf(meta) ?? [];
  if (own.length === 1) return own[0]!;
  if (own.length > 1) {
    if (isProId(m?.pro_id) && own.includes(m.pro_id.kind)) return m.pro_id.kind;
    const prev = m?.pro_last ?? {};
    const latest = own.map((k) => prev[k]).filter((p): p is ProId => isProId(p)).sort((x, y) => (y.at > x.at ? 1 : -1))[0];
    if (latest) return latest.kind;
  }
  return null;
}
export type AccountSector = { kind: ProKind | null; email: string | null; name?: string | null };
let accountSector: AccountSector | null = null;
const sectorSubs = new Set<() => void>();
/** The account's own name, as the sign-in gave it (Google's full name), else none. */
const nameOf = (meta: unknown): string | null => {
  const m = meta as { full_name?: unknown; name?: unknown } | null;
  const n = typeof m?.full_name === "string" ? m.full_name : typeof m?.name === "string" ? m.name : "";
  return n.trim() || null;
};
const setAccountSector = (next: AccountSector | null) => {
  if (next?.kind === accountSector?.kind && next?.email === accountSector?.email && next?.name === accountSector?.name && !next === !accountSector) return;
  accountSector = next;
  sectorSubs.forEach((f) => f());
};
/** The signed-in personal account's sector and email (null signed out, or while not read yet). */
export function useAccountSector(): AccountSector | null {
  // Read again from the session on mount, so a form opened before the root published it (or after a change that sent
  // no event) never shows a sector's form the account cannot use.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      setAccountSector(user ? { kind: sectorOf(user.user_metadata), email: user.email ?? null, name: nameOf(user.user_metadata) } : null);
    });
  }, []);
  return useSyncExternalStore((f) => { sectorSubs.add(f); return () => { sectorSubs.delete(f); }; }, () => accountSector, () => null);
}
/**
 * Moves the signed-in account to the other sector ("Usa questo account per il settore …" on the lock): the account's
 * sector becomes that kind; its profile of that kind, if it registered one, comes back in use, else the form asks for
 * it. The other sector's profile stays saved in the account, unused while the account is of this sector.
 */
export async function switchAccountSector(kind: ProKind): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return false;
  const meta = user.user_metadata as Meta;
  const back = meta?.pro_last?.[kind];
  const id = isProId(back) && back.kind === kind && (ownOf(meta) ?? []).includes(kind) ? back : null;
  pickedAt = Date.now();
  set(id);
  setAccountSector({ kind, email: user.email ?? null, name: nameOf(user.user_metadata) });
  const { error } = await supabase.auth.updateUser({ data: { pro_sector: kind, pro_id: id, pro_left: false } });
  return !error;
}
/** Whether the signed-in account may use a profile of this kind (always, signed out or with no sector yet). */
export const accountAllows = (kind: ProKind): boolean => !accountSector?.kind || accountSector.kind === kind;

/** Saves the profile (null removes it) on this device and, signed in, in the account, as the account's own. */
/** When a profile was last chosen on this device (identified, picked again or left): a sign-in being read meanwhile does not override it. */
let pickedAt = 0;
export async function saveProId(id: ProId | null): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const meta = data.session?.user.user_metadata;
  const sector = data.session ? sectorOf(meta) : null;
  // Another personal account's profile (tied on this phone to another email) cannot be taken by this account.
  const email = data.session?.user.email;
  if (id && email && (knownSnap()[id.kind] as KnownProId[]).some((q) => sameProfile(q, id) && !!q.acct?.email && q.acct.email.toLowerCase() !== email.toLowerCase())) {
    toast.error("Questo profilo è di un altro account", { description: "Identificati con i tuoi dati, oppure accedi con l’account di quel profilo." });
    return false;
  }
  // Signed in to an account of the other sector: refused (the form shows why and how to use another account).
  if (id && sector && sector !== id.kind) {
    toast.error(`Questo account è del settore ${sector === "funzionario" ? "urbano" : "agricolo"}`, { description: "Per l’altro settore accedi con un altro account personale." });
    return false;
  }
  pickedAt = Date.now();
  set(id);
  if (!data.session) return true;
  // Every kind the account registered stays owned (a sector switched back finds its profile again).
  const own = withKind(ownOf(meta) ?? [], id);
  const proSector = sector ?? id?.kind ?? null;
  if (proSector) setAccountSector({ kind: proSector, email: data.session.user.email ?? null, name: nameOf(meta) });
  // pro_left: the profile was left on purpose ("Esci dal profilo"), so the next sign-in does not bring it back by itself.
  await supabase.auth.updateUser({ data: { pro_id: id, pro_last: accountLast(meta, id, own), pro_own: own, pro_left: id === null, ...(proSector ? { pro_sector: proSector } : {}) } }).catch(() => undefined);
  return true;
}

/** Before signing out: the profile in use (identified while signed in, so the account's own) is kept in the account. */
export async function keepProIdInAccount(): Promise<void> {
  const id = snapshot();
  const { data } = await supabase.auth.getSession();
  if (!id || !data.session) return;
  const meta = data.session.user.user_metadata;
  const sector = sectorOf(meta);
  if (sector && sector !== id.kind) return;
  // Every kind the account registered stays owned (a sector switched back finds its profile again).
  const own = withKind(ownOf(meta) ?? [], id);
  await supabase.auth.updateUser({ data: { pro_id: id, pro_last: accountLast(meta, id, own), pro_own: own, pro_left: false } }).catch(() => undefined);
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

async function accountEmail(userId: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === userId ? data.session.user.email ?? null : null;
}

/**
 * The sector whose form is open (the sector page), kept for 15 minutes in sessionStorage so a sign-in with Google — which
 * leaves the page and comes back — still knows which sector the person was entering.
 */
const WANTED_KEY = "mdt-sector-wanted";
const ADDING_KEY = "mdt-adding-account";
/** "Aggiungi account" from a sector's form: the account signed in next is added to that sector (10 minutes at most). */
export function rememberAddingSector(kind: ProKind) {
  try { localStorage.setItem(ADDING_KEY, JSON.stringify({ kind, at: Date.now() })); } catch { /* none */ }
}
function takeAddingSector(): ProKind | null {
  try {
    const v = JSON.parse(localStorage.getItem(ADDING_KEY) ?? "null") as { kind?: unknown; at?: number } | null;
    localStorage.removeItem(ADDING_KEY);
    return v && (v.kind === "agronomo" || v.kind === "funzionario") && Date.now() - (v.at ?? 0) < 10 * 60_000 ? v.kind : null;
  } catch { return null; }
}
export function rememberWantedSector(kind: ProKind | null) {
  try { if (kind) localStorage.setItem(WANTED_KEY, JSON.stringify({ kind, at: Date.now() })); else localStorage.removeItem(WANTED_KEY); } catch { /* none */ }
}
function wantedSector(): ProKind | null {
  try {
    const v = JSON.parse(localStorage.getItem(WANTED_KEY) ?? "null") as { kind?: unknown; at?: number } | null;
    return v && (v.kind === "agronomo" || v.kind === "funzionario") && Date.now() - (v.at ?? 0) < 15 * 60_000 ? v.kind : null;
  } catch { return null; }
}

/**
 * Mounted once: on sign-in the account's profile comes to this device, or this device's goes to an account without one;
 * on sign-out the profile leaves this device (kept in the account for the next sign-in).
 */
/** Settles once the opening's session read (and, signed in, the account's profile) is done: the preloader waits for it. */
let settleOpening: () => void = () => {};
export const openingSettled: Promise<void> = typeof window === "undefined" ? Promise.resolve() : new Promise((r) => { settleOpening = r; });
export function useSyncProId() {
  useEffect(() => {
    let adopted = "";
    const adopt = async (userId: string, meta: unknown) => {
      if (adopted === userId) return;
      adopted = userId;
      const startedAt = Date.now();
      const legacy = ownOf(meta) === null;
      // What the account really worked on (its own history, owner-only): the projects with interventions in it.
      const worked = await legacyOwn();
      // History not readable now (and no saved kinds): the profiles this phone tied to the account still count, so a
      // sign-in never ends on the sector choice because a read failed.
      const owned0 = ownOf(meta) ?? worked ?? [];
      // A kind the account worked on is its own, whatever its saved data say.
      const owned1 = [...new Set([...owned0, ...(worked ?? [])])];
      const prev0 = (meta as Meta)?.pro_last ?? {};
      const saved = (meta as Meta)?.pro_id;
      const email = await accountEmail(userId);
      // The other way round too: profiles this phone tied to this account (recognised with its email, or picked
      // with "Continua come …" before signing in) are its own, so signing in enters them by itself.
      const tied: Partial<Record<ProKind, ProId>> = {};
      if (email) for (const k of KNOWN_KINDS) {
        const p = (knownSnap()[k] as KnownProId[]).find((q) => q.acct?.email?.toLowerCase() === email.toLowerCase());
        if (p) { const { acct: _a, ...id } = p; void _a; tied[k] = id as ProId; }
      }
      const prev: Partial<Record<ProKind, ProId>> = { ...prev0 };
      for (const k of KNOWN_KINDS) if (tied[k] && !isProId(prev[k])) prev[k] = tied[k];
      const owned = [...new Set([...owned1, ...KNOWN_KINDS.filter((k) => !!tied[k])])];
      // A profile this phone knows as another personal account's (tied to another email: picked here while signed in
      // to this account by mistake) is not this account's own, even if it reached its data: dropped from it, with the
      // sector it gave, before the account's sector is read.
      // A profile of a kind the account has interventions of is the account's own even if this phone tied it to
      // another email (a tie made by mistake): the account's history wins, and the phone's tie is put right.
      const foreign = (p: unknown) => isProId(p) && !!email && !(worked ?? []).includes(p.kind) && KNOWN_KINDS.some((k) => (knownSnap()[k] as KnownProId[]).some((q) => sameProfile(q, p) && !!q.acct?.email && q.acct.email.toLowerCase() !== email.toLowerCase()));
      const ownedClean = owned.filter((k) => !foreign(prev[k]) && !(isProId(saved) && saved.kind === k && foreign(saved)));
      const rawSector = (meta as { pro_sector?: unknown } | null)?.pro_sector;
      // One account, one sector: only the account's own sector counts (an older account owning both keeps the one in
      // use, else its most recent), written once as pro_sector.
      const savedSector = sectorOf({
        ...(meta as object), pro_own: ownedClean,
        pro_sector: typeof rawSector === "string" && ownedClean.includes(rawSector as ProKind) ? rawSector : null,
        pro_id: foreign(saved) ? null : saved,
        pro_last: Object.fromEntries(Object.entries(prev).filter(([, p]) => !foreign(p))),
      });
      // Signing in from one sector's form (the sector page asked for it, or the piazza / vineyard page is open) with an
      // account that registered that sector's profile: the account goes to that sector — the person asked for it — even
      // if its saved sector was the other one.
      const path = typeof window === "undefined" ? "" : window.location.pathname;
      // The sector page's form (or the profile card picked) says it first; then the profile this phone tied to the
      // account's email (signing in with Google from the panel enters that account's own profile, whatever page is
      // open); only then the page open.
      const tiedKinds = KNOWN_KINDS.filter((k) => !!tied[k]);
      const usable = (k: ProKind | null | undefined): k is ProKind => !!k && ownedClean.includes(k) && isProId(prev[k]) && !foreign(prev[k]);
      const wanted: ProKind | null = [gateAsk.kind, wantedSector(), tiedKinds.length === 1 ? tiedKinds[0] : null, path.startsWith("/urbano") ? "funzionario" as const : path.startsWith("/vigneto") ? "agronomo" as const : null].find(usable) ?? null;
      // An account that only ever worked on one project is of that project's sector (a saved sector of the other one,
      // written by mistake, is put right), unless the person is entering the other sector with its own profile.
      const onlyWorked: ProKind | null = worked && worked.length === 1 ? worked[0]! : null;
      // Added on purpose with "Aggiungi account" from a sector's form: the account goes to that sector, whatever it
      // was before (its other profile stays saved in it), so any account can be added to either sector.
      const adding = fromSignIn ? takeAddingSector() : null;
      const sector: ProKind | null = adding ?? wanted ?? onlyWorked ?? savedSector;
      if (email) for (const k of worked ?? []) { const p = prev[k]; if (isProId(p)) retieKnown(p, email); }
      const own = sector ? ownedClean.filter((k) => k === sector) : ownedClean;
      const entering = gateAsk.kind ?? wantedSector();
      rememberWantedSector(null);
      // The account's own registered profiles come to this device too ("Continua come …" on its form).
      for (const k of own) { const p = prev[k]; if (isProId(p) && p.kind === k) { if (!lastSnap()[k]) keepLast(p); else keepKnown(p); } }
      const mine = (p: unknown): p is ProId => isProId(p) && own.includes(p.kind) && !foreign(p);
      // "Esci dal profilo" now leaves the personal account too, so a sign-in always means "enter my profile": an older
      // pro_left (written when leaving a profile kept the account signed in) no longer holds the profile back — it
      // kept both accounts from being recognised — and is cleared.
      const staleLeft = (meta as Meta)?.pro_left === true;
      const left = false;
      const back = mine(saved) ? saved : left ? null : own.map((k) => prev[k]).filter(mine).sort((x, y) => (y.at > x.at ? 1 : -1))[0] ?? null;
      setAccountSector({ kind: sector, email, name: nameOf(meta) });
      // A profile chosen on this device while the account was being read (the history check takes a moment) wins: the
      // account's older one would replace it — a farmer just picked on the vineyard's page turned back into an officer.
      if (pickedAt >= startedAt) return;
      // The other sector's registered profile stays saved in the account (pro_own and pro_last keep every kind owned),
      // only unused while the account is of this sector.
      const clean = { pro_id: back, pro_last: accountLast({ ...(meta as object), pro_last: prev }, back, ownedClean), pro_own: ownedClean, pro_sector: sector, pro_left: false };
      const dirty = ownedClean.length !== owned.length || legacy || KNOWN_KINDS.some((k) => !!tied[k] && !isProId(prev0[k])) || (saved != null && !mine(saved)) || KINDS.some((k) => prev[k] != null && !owned.includes(k)) || rawSector !== sector || staleLeft;
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
      // The sector the person was entering opens on its form (a new account adds its profile there), not the choice.
      if (!left && !guestSnap()) openSectorGate(entering ?? null);
      // An account just added from a sector's form: it is in, its profile of that sector is the next step.
      if (entering && email) toast.success(`Sei entrato con ${email}`, { description: `Registra qui il suo profilo ${entering === "funzionario" ? "della piazza" : "del vigneto"}: da ora lo trovi tra i profili riconosciuti.` });
      if (saved != null && !mine(saved)) toast("Questo account non ha ancora un profilo professionale", { description: "Scegli il settore e identificati, oppure entra come ospite." });
    };
    // Back from Google's sign-in (?code=): the session comes a moment later, through SIGNED_IN — the account signed in
    // before (when one was added with "Aggiungi account") is not read meanwhile, it is about to be replaced.
    const fromSignIn = /[?&]code=/.test(window.location.search);
    const publish = (user: { email?: string | null; user_metadata?: unknown } | null | undefined) =>
      setAccountSector(user ? { kind: sectorOf(user.user_metadata), email: user.email ?? null, name: nameOf(user.user_metadata) } : null);
    void supabase.auth.getSession().then(({ data }) => { publish(data.session?.user); if (data.session && !fromSignIn) void adopt(data.session.user.id, data.session.user.user_metadata).finally(() => settleOpening()); else if (!fromSignIn) settleOpening(); }).catch(() => settleOpening());
    // Signing out of the personal account signs out of the professional profile too (it stays saved in the account
    // and comes back with the next sign-in).
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event !== "SIGNED_OUT" && s) publish(s.user);
      if (event === "SIGNED_OUT") publish(null);
      if (event === "SIGNED_IN" && s) void adopt(s.user.id, s.user.user_metadata).finally(() => settleOpening());
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

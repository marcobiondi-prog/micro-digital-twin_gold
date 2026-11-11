import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSignedIn } from "@/lib/use-signed-in";
import {
  addLocalHistory, clearLocalHistory, removeLocalHistory, isHistoryEntry, localHistory, mergeHistory, newEntry, serverLocalHistory, subscribeLocalHistory,
  byOf, ofOffice, type HistoryBy, type HistoryEntry, type HistoryFlow, type SourcedEntry, type HistoryMix, type HistoryWhen,
} from "@/models/intervention-history";
import { requestSimWhen } from "@/models/sim-when";
import { setUrban, setVineyard } from "@/models/lab-store";
import { getProId, isGuest, useProId } from "@/lib/use-pro-id";

// The table comes from supabase/migrations (not in the generated types), like the other late tables.
const table = () => (supabase as any).from("intervention_history");

/**
 * Records an intervention: in the account when there is a real session, on this device otherwise
 * (and on this device too if the account save fails, so nothing is lost).
 */
export async function addHistory(flow: HistoryFlow, text: string, place: string, mix: HistoryMix | null = null, when: HistoryWhen | null = null): Promise<void> {
  if (!text.trim()) return;
  // A guest (no professional profile) simulates but saves nothing.
  if (isGuest() && !getProId()) return;
  // A piazza entry keeps who recorded it: the municipal officer's town, office and role.
  const pro = getProId();
  const by: HistoryBy | null = flow === "piazza" && pro?.kind === "funzionario" ? { comune: pro.comune, office: pro.office, role: pro.role } : null;
  const entry = newEntry(flow, text, place, new Date(), mix, when, by);
  const { data } = await supabase.auth.getSession();
  if (!data.session) { addLocalHistory(entry); return; }
  // Signed in without a connection: kept on the phone, and sent to the account as soon as the connection is back.
  if (typeof navigator !== "undefined" && navigator.onLine === false) { addLocalHistory(entry); saidOffline(); return; }
  const error = await saveRows([entry]);
  if (error) {
    addLocalHistory(entry);
    if (typeof navigator !== "undefined" && navigator.onLine === false) saidOffline();
    else toast.error("Cronologia non salvata nel tuo account, la tengo su questo dispositivo");
  }
}

/** Saves entries in the account (an existing id is left as it is), with what the table can hold. */
async function saveRows(entries: HistoryEntry[]): Promise<unknown> {
  const rows = entries.map((e) => ({ id: e.id, at: e.at, flow: e.flow, place: e.place, text: e.text }));
  const full = entries.map((e, i) => ({ ...rows[i], mix: e.mix ?? null, season: e.season ?? null, hour: e.hour ?? null }));
  const opts = { onConflict: "id", ignoreDuplicates: true };
  let { error } = await table().upsert(entries.map((e, i) => ({ ...full[i], by: e.by ?? null })), opts);
  if (error) ({ error } = await table().upsert(full, opts));
  // An account table without the newer columns yet (their migrations not applied): save what it can hold.
  if (error) ({ error } = await table().upsert(entries.map((e, i) => ({ ...rows[i], mix: e.mix ?? null })), opts));
  if (error) ({ error } = await table().upsert(rows, opts));
  return error;
}

// Said once per time offline, not at every recorded change.
let offlineSaid = false;
function saidOffline() {
  if (offlineSaid) return;
  offlineSaid = true;
  toast("Senza rete: la cronologia resta sul telefono", { description: "La porto nel tuo account appena torna la connessione." });
}

/** Tells the history lists to read the account again. */
export const HISTORY_SYNCED = "mdt-history-synced";

/**
 * Signed in and online, the interventions kept on this device (recorded offline or before signing in) go up to the
 * account and leave the device once saved. Returns how many went up.
 */
export async function syncDeviceHistory(): Promise<number> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return 0;
  offlineSaid = false;
  const pending = localHistory();
  if (!pending.length) return 0;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 0;
  const error = await saveRows(pending);
  if (error) return 0;
  removeLocalHistory(pending.map((e) => e.id));
  window.dispatchEvent(new Event(HISTORY_SYNCED));
  return pending.length;
}

/**
 * Empties the history, or only one place's entries: this device's, and the account's too when signed in.
 * False when the account could not be emptied.
 */
export async function clearHistory(flow?: HistoryFlow): Promise<boolean> {
  clearLocalHistory(flow);
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return true;
  const query = table().delete().eq("user_id", uid);
  const { error } = await (flow ? query.eq("flow", flow) : query);
  return !error;
}

/**
 * Deletes these entries for good: from this device and, signed in, from the account; their archive marks go too.
 * Every open history reads the account again.
 */
export async function removeHistory(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  removeLocalHistory(ids);
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  let ok = true;
  if (uid) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await table().delete().eq("user_id", uid).in("id", ids.slice(i, i + 200));
      if (error) { ok = false; break; }
    }
  }
  if (ok) { const { restoreHistory } = await import("@/models/history-archive"); restoreHistory(ids); }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HISTORY_SYNCED));
  return ok;
}

/**
 * Puts an entry's interventions back in its simulation (the place stays the one chosen now), and asks it to open on the
 * entry's season and hour when it has them.
 */
export function reopenHistory(mix: HistoryMix, when: HistoryWhen | null = null) {
  if (when) requestSimWhen(mix.kind === "piazza" ? "urban" : "vineyard", when);
  if (mix.kind === "piazza") {
    setUrban({ trees: mix.trees, permeable: mix.permeable, shade: mix.shade, misters: mix.misters ?? 0, treeCells: null, permeableCells: null, shadeCells: null });
    return;
  }
  setVineyard((v) => ({
    allZones: mix.allZones,
    selected: Math.min(Math.max(0, mix.selected), v.zones.length - 1),
    zones: v.zones.map((z, i) => ({ ...z, ...(mix.zones[i] ?? mix.zones[mix.zones.length - 1]) })),
  }));
}

/**
 * Which piazza interventions the municipal officer sees: only those of the office in use ("mine", the default; entries
 * recorded before the office was kept count as its own) or every office's ("all"). Kept on this device (mdt-history-office-v1).
 */
/** "mine", "all", or the name of one office ("office:<name>"), to see only that office's interventions. */
export type OfficeScope = "mine" | "all" | `office:${string}`;
const SCOPE_KEY = "mdt-history-office-v1";
let scope: OfficeScope | undefined;
const scopeSubs = new Set<() => void>();
const scopeSnap = (): OfficeScope => {
  if (scope === undefined) { try { const v = localStorage.getItem(SCOPE_KEY) ?? ""; scope = v === "all" || v.startsWith("office:") ? (v as OfficeScope) : "mine"; } catch { scope = "mine"; } }
  return scope;
};
export function setOfficeScope(next: OfficeScope) {
  scope = next;
  try { localStorage.setItem(SCOPE_KEY, next); } catch { /* this visit only */ }
  scopeSubs.forEach((f) => f());
}
export function useOfficeScope(): OfficeScope {
  return useSyncExternalStore((f) => { scopeSubs.add(f); return () => { scopeSubs.delete(f); }; }, scopeSnap, () => "mine");
}

/** The history to show: the account's for signed-in users (plus what a failed save left here), this device's for the others. */
export function useHistory(opts: { allOffices?: boolean } = {}): { entries: SourcedEntry[]; otherOffices: number; offices: Record<string, number>; where: "account" | "device"; loading: boolean; failed: boolean; reload: () => void } {
  const officeScope = useOfficeScope();
  const pro = useProId();
  const { signedIn, demo } = useSignedIn();
  const account = signedIn && !demo;
  const device = useSyncExternalStore(subscribeLocalHistory, localHistory, serverLocalHistory);
  const [cloud, setCloud] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const { data: authData } = await supabase.auth.getSession();
    if (!authData?.session) {
      setLoading(false);
      setFailed(false);
      return;
    }
    setLoading(true);
    // Without the newer columns yet the entries still show, only without season and hour, or without "Riapri".
    let data: unknown, error: unknown;
    for (const columns of ["id, at, flow, place, text, mix, season, hour, by", "id, at, flow, place, text, mix, season, hour", "id, at, flow, place, text, mix", "id, at, flow, place, text"]) {
      ({ data, error } = await table().select(columns).order("at", { ascending: false }).limit(500));
      if (!error) break;
    }
    setFailed(!!error);
    if (!error && Array.isArray(data)) setCloud(data.filter(isHistoryEntry));
    setLoading(false);
  }, []);
  useEffect(() => {
    if (!account) { setCloud([]); setFailed(false); return; }
    void load();
    window.addEventListener("focus", load);
    window.addEventListener("online", load);
    window.addEventListener(HISTORY_SYNCED, load);
    return () => { window.removeEventListener("focus", load); window.removeEventListener("online", load); window.removeEventListener(HISTORY_SYNCED, load); };
  }, [account, load]);
  // Each entry says where it is kept: signed in, the account's come first and this device's (recorded without signing in) follow.
  const entries = useMemo<SourcedEntry[]>(() => {
    const fromAccount = new Set(cloud.map((e) => e.id));
    return (account ? mergeHistory(cloud, device) : device).map((e) => ({ ...e, source: (fromAccount.has(e.id) || account) ? "account" : "device" }));
  }, [account, cloud, device]);
  // A municipal officer sees the piazza interventions of the office in use, unless every office is asked for.
  const office = pro?.kind === "funzionario" ? { comune: pro.comune, office: pro.office } : null;
  const otherOffices = office ? entries.filter((e) => e.flow === "piazza" && !ofOffice(e, office)).length : 0;
  // How many piazza interventions each office recorded (by its name; entries recorded before the office was kept count as the office in use).
  const offices = useMemo(() => {
    const out: Record<string, number> = {};
    if (!office) return out;
    for (const e of entries) if (e.flow === "piazza") { const name = byOf(e)?.office ?? office.office; out[name] = (out[name] ?? 0) + 1; }
    return out;
  }, [entries, office?.office]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    if (!office || opts.allOffices || officeScope === "all") return entries;
    const only = officeScope === "mine" ? office.office : officeScope.slice("office:".length);
    const same = (a: string) => a.trim().toLocaleLowerCase("it") === only.trim().toLocaleLowerCase("it");
    return entries.filter((e) => e.flow !== "piazza" || (officeScope === "mine" ? ofOffice(e, office) : same(byOf(e)?.office ?? office.office)));
  }, [entries, office?.comune, office?.office, officeScope, opts.allOffices]); // eslint-disable-line react-hooks/exhaustive-deps
  return account
    ? { entries: shown, otherOffices, offices, where: "account", loading, failed, reload: () => void load() }
    : { entries: shown, otherOffices, offices, where: "device", loading: false, failed: false, reload: () => undefined };
}

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSignedIn } from "@/lib/use-signed-in";
import {
  addLocalHistory, clearLocalHistory, removeLocalHistory, isHistoryEntry, localHistory, mergeHistory, newEntry, serverLocalHistory, subscribeLocalHistory,
  type HistoryEntry, type HistoryFlow, type SourcedEntry, type HistoryMix, type HistoryWhen,
} from "@/models/intervention-history";
import { requestSimWhen } from "@/models/sim-when";
import { setUrban, setVineyard } from "@/models/lab-store";

// The table comes from supabase/migrations (not in the generated types), like the other late tables.
const table = () => (supabase as any).from("intervention_history");

/**
 * Records an intervention: in the account when there is a real session, on this device otherwise
 * (and on this device too if the account save fails, so nothing is lost).
 */
export async function addHistory(flow: HistoryFlow, text: string, place: string, mix: HistoryMix | null = null, when: HistoryWhen | null = null): Promise<void> {
  if (!text.trim()) return;
  const entry = newEntry(flow, text, place, new Date(), mix, when);
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
  let { error } = await table().upsert(full, opts);
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
 * Puts an entry's interventions back in its simulation (the place stays the one chosen now), and asks it to open on the
 * entry's season and hour when it has them.
 */
export function reopenHistory(mix: HistoryMix, when: HistoryWhen | null = null) {
  if (when) requestSimWhen(mix.kind === "piazza" ? "urban" : "vineyard", when);
  if (mix.kind === "piazza") {
    setUrban({ trees: mix.trees, permeable: mix.permeable, shade: mix.shade, treeCells: null, permeableCells: null, shadeCells: null });
    return;
  }
  setVineyard((v) => ({
    allZones: mix.allZones,
    selected: Math.min(Math.max(0, mix.selected), v.zones.length - 1),
    zones: v.zones.map((z, i) => ({ ...z, ...(mix.zones[i] ?? mix.zones[mix.zones.length - 1]) })),
  }));
}

/** The history to show: the account's for signed-in users (plus what a failed save left here), this device's for the others. */
export function useHistory(): { entries: SourcedEntry[]; where: "account" | "device"; loading: boolean; failed: boolean; reload: () => void } {
  const { signedIn, demo } = useSignedIn();
  const account = signedIn && !demo;
  const device = useSyncExternalStore(subscribeLocalHistory, localHistory, serverLocalHistory);
  const [cloud, setCloud] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    // Without the newer columns yet the entries still show, only without season and hour, or without "Riapri".
    let data: unknown, error: unknown;
    for (const columns of ["id, at, flow, place, text, mix, season, hour", "id, at, flow, place, text, mix", "id, at, flow, place, text"]) {
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
    return (account ? mergeHistory(cloud, device) : device).map((e) => ({ ...e, source: fromAccount.has(e.id) ? "account" : "device" }));
  }, [account, cloud, device]);
  return account
    ? { entries, where: "account", loading, failed, reload: () => void load() }
    : { entries, where: "device", loading: false, failed: false, reload: () => undefined };
}

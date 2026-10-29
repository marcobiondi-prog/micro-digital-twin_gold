import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSignedIn } from "@/lib/use-signed-in";
import {
  addLocalHistory, clearLocalHistory, isHistoryEntry, localHistory, mergeHistory, newEntry, serverLocalHistory, subscribeLocalHistory,
  type HistoryEntry, type HistoryFlow, type HistoryMix,
} from "@/models/intervention-history";
import { setUrban, setVineyard } from "@/models/lab-store";

// The table comes from supabase/migrations (not in the generated types), like the other late tables.
const table = () => (supabase as any).from("intervention_history");

/**
 * Records an intervention: in the account when there is a real session, on this device otherwise
 * (and on this device too if the account save fails, so nothing is lost).
 */
export async function addHistory(flow: HistoryFlow, text: string, place: string, mix: HistoryMix | null = null): Promise<void> {
  if (!text.trim()) return;
  const entry = newEntry(flow, text, place, new Date(), mix);
  const { data } = await supabase.auth.getSession();
  if (!data.session) { addLocalHistory(entry); return; }
  const row = { id: entry.id, at: entry.at, flow: entry.flow, place: entry.place, text: entry.text };
  let { error } = await table().insert({ ...row, mix: entry.mix ?? null });
  // An account table without the mix column yet (its migration not applied): save the entry without it.
  if (error && entry.mix) ({ error } = await table().insert(row));
  if (error) { addLocalHistory(entry); toast.error("Cronologia non salvata nel tuo account, la tengo su questo dispositivo"); }
}

/** Empties the history: this device's, and the account's too when signed in. False when the account could not be emptied. */
export async function clearHistory(): Promise<boolean> {
  clearLocalHistory();
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return true;
  const { error } = await table().delete().eq("user_id", uid);
  return !error;
}

/** Puts an entry's interventions back in its simulation (the place stays the one chosen now). */
export function reopenHistory(mix: HistoryMix) {
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
export function useHistory(): { entries: HistoryEntry[]; where: "account" | "device"; loading: boolean; failed: boolean; reload: () => void } {
  const { signedIn, demo } = useSignedIn();
  const account = signedIn && !demo;
  const device = useSyncExternalStore(subscribeLocalHistory, localHistory, serverLocalHistory);
  const [cloud, setCloud] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    let { data, error } = await table().select("id, at, flow, place, text, mix").order("at", { ascending: false }).limit(500);
    // Without the mix column yet the entries still show, only without "Riapri".
    if (error) ({ data, error } = await table().select("id, at, flow, place, text").order("at", { ascending: false }).limit(500));
    setFailed(!!error);
    if (!error && Array.isArray(data)) setCloud(data.filter(isHistoryEntry));
    setLoading(false);
  }, []);
  useEffect(() => {
    if (!account) { setCloud([]); setFailed(false); return; }
    void load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [account, load]);
  return account
    ? { entries: mergeHistory(cloud, device), where: "account", loading, failed, reload: () => void load() }
    : { entries: device, where: "device", loading: false, failed: false, reload: () => undefined };
}

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSignedIn } from "@/lib/use-signed-in";
import {
  addLocalHistory, isHistoryEntry, localHistory, mergeHistory, newEntry, serverLocalHistory, subscribeLocalHistory,
  type HistoryEntry, type HistoryFlow,
} from "@/models/intervention-history";

// The table comes from supabase/migrations (not in the generated types), like the other late tables.
const table = () => (supabase as any).from("intervention_history");

/**
 * Records an intervention: in the account when there is a real session, on this device otherwise
 * (and on this device too if the account save fails, so nothing is lost).
 */
export async function addHistory(flow: HistoryFlow, text: string, place: string): Promise<void> {
  if (!text.trim()) return;
  const entry = newEntry(flow, text, place);
  const { data } = await supabase.auth.getSession();
  if (!data.session) { addLocalHistory(entry); return; }
  const { error } = await table().insert({ id: entry.id, at: entry.at, flow: entry.flow, place: entry.place, text: entry.text });
  if (error) { addLocalHistory(entry); toast.error("Cronologia non salvata nel tuo account, la tengo su questo dispositivo"); }
}

/** The history to show: the account's for signed-in users (plus what a failed save left here), this device's for the others. */
export function useHistory(): { entries: HistoryEntry[]; where: "account" | "device"; loading: boolean; failed: boolean } {
  const { signedIn, demo } = useSignedIn();
  const account = signedIn && !demo;
  const device = useSyncExternalStore(subscribeLocalHistory, localHistory, serverLocalHistory);
  const [cloud, setCloud] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await table().select("id, at, flow, place, text").order("at", { ascending: false }).limit(500);
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
    ? { entries: mergeHistory(cloud, device), where: "account", loading, failed }
    : { entries: device, where: "device", loading: false, failed: false };
}

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { deviceLabel } from "@/models/device-label";

/**
 * The devices signed in to the account (table account_devices, owner-only, from
 * supabase/migrations/20261107010000_account_devices.sql): this device registers itself — an id of its own kept in
 * localStorage mdt-device-id-v1, a plain label, the time it was last used — on sign-in, on opening and on return to the
 * app (at most every 10 minutes). Without the table nothing breaks: the list says it is not ready.
 */
const ID_KEY = "mdt-device-id-v1";
const table = () => (supabase as unknown as { from: (t: string) => any }).from("account_devices"); // eslint-disable-line @typescript-eslint/no-explicit-any
export type AccountDevice = { id: string; device_id: string; label: string; first_seen: string; last_seen: string };

export function thisDeviceId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(ID_KEY, id); }
    return id;
  } catch { return "unknown-device"; }
}

async function label(): Promise<string> {
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  let model: string | undefined;
  try {
    const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ model?: string }> } }).userAgentData;
    model = (await data?.getHighEntropyValues(["model"]))?.model || undefined;
  } catch { /* not given */ }
  return deviceLabel(navigator.userAgent, { standalone, ...(model ? { model } : {}) });
}

let lastSeen = 0;
/** Registers this device in the account (or says it is still in use); at most every 10 minutes unless forced. */
export async function registerDevice(force = false): Promise<void> {
  if (!force && Date.now() - lastSeen < 10 * 60_000) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  lastSeen = Date.now();
  const now = new Date().toISOString();
  await table().upsert({ device_id: thisDeviceId(), label: await label(), last_seen: now }, { onConflict: "user_id,device_id" }).then(() => undefined, () => undefined);
}

/** Mounted once by the root: registers the device on opening, on sign-in and on return to the app. */
export function useRegisterDevice() {
  useEffect(() => {
    void registerDevice(true);
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") void registerDevice(true); });
    const back = () => { if (document.visibilityState === "visible") void registerDevice(); };
    document.addEventListener("visibilitychange", back);
    return () => { data.subscription.unsubscribe(); document.removeEventListener("visibilitychange", back); };
  }, []);
}

/** The account's devices, most recently used first; ready false while the table is missing. */
export function useAccountDevices(): { devices: AccountDevice[]; ready: boolean; loading: boolean; reload: () => void; remove: (id: string) => Promise<boolean> } {
  const [devices, setDevices] = useState<AccountDevice[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    await registerDevice();
    const { data, error } = await table().select("id, device_id, label, first_seen, last_seen").order("last_seen", { ascending: false }).limit(50);
    setReady(!error);
    setDevices(error || !Array.isArray(data) ? [] : (data as AccountDevice[]));
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const remove = useCallback(async (id: string) => {
    const { error } = await table().delete().eq("id", id);
    if (!error) setDevices((d) => d.filter((x) => x.id !== id));
    return !error;
  }, []);
  return { devices, ready, loading, reload: () => void load(), remove };
}

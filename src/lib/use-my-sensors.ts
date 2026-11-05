import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSyncExternalStore } from "react";
import { listMySensors } from "@/controllers/sensors.functions";
import { useSignedIn } from "@/lib/use-signed-in";
import type { SensorFlow } from "@/models/sensor-devices";

/**
 * The signed-in user's own sensors of one project with their latest readings, read again every minute; shared by the
 * Sensori AI tab and the simulations (which use only fresh readings). Guests and the simulated sign-in have none.
 */
export function useMySensors(flow: SensorFlow) {
  const { signedIn, demo } = useSignedIn();
  const list = useServerFn(listMySensors);
  const real = signedIn && !demo;
  const q = useQuery({ queryKey: ["my-sensors", flow], queryFn: () => list({ data: { flow } }), enabled: real, staleTime: 30_000, refetchInterval: 60_000, retry: 1 });
  const client = useQueryClient();
  return { ...q, real, sensors: q.data?.sensors ?? [], ready: q.data?.ready ?? true, refresh: () => client.invalidateQueries({ queryKey: ["my-sensors", flow] }) };
}

/** A suggested spot handed from the AI suggestions to the "Aggiungi sensore" form. */
type Prefill = { flow: SensorFlow; name: string; lat: number; lng: number } | null;
let prefill: Prefill = null;
const subs = new Set<() => void>();
export function setSensorPrefill(p: Prefill) { prefill = p; subs.forEach((f) => f()); }
export function useSensorPrefill(): Prefill {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => prefill, () => null);
}

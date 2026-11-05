import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { KIND_LIST, SENSOR_KINDS, latestByKind, newSensorToken, tokenHash, type SensorKind, type SensorRow } from "@/models/sensor-devices";

/** The user's own sensors: listed with their latest readings, added (the device key shown once), removed, read by hand. */
const Flow = z.enum(["piazza", "vigneto"]);
const Kind = z.enum(KIND_LIST as [SensorKind, ...SensorKind[]]);
const missing = (e: { message?: string; code?: string } | null) => !!e && (e.code === "42P01" || /relation .* does not exist|could not find the table/i.test(e.message ?? ""));
const NOT_READY = "I sensori non sono ancora attivi sul server: va applicata la migrazione 20261105000000_sensors.sql.";

export const listMySensors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ flow: Flow }).parse(d))
  .handler(async ({ data, context }): Promise<{ sensors: SensorRow[]; ready: boolean }> => {
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.from("sensors").select("id, flow, name, kind, lat, lng, zone, last_seen_at").eq("flow", data.flow).order("created_at");
    if (missing(error)) return { sensors: [], ready: false };
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    let latest = new Map<string, SensorRow["latest"]>();
    if (ids.length) {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data: rs, error: e2 } = await sb.from("sensor_readings").select("sensor_id, kind, value, at").in("sensor_id", ids).gte("at", since).order("at", { ascending: false }).limit(1000);
      if (e2) throw new Error(e2.message);
      latest = latestByKind(rs ?? []);
    }
    return { ready: true, sensors: (rows ?? []).map((r: Omit<SensorRow, "latest">) => ({ ...r, latest: latest.get(r.id) ?? {} })) };
  });

export const addMySensor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    flow: Flow, kind: Kind, name: z.string().trim().min(1).max(80),
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), zone: z.number().int().min(0).max(9).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const token = newSensorToken();
    const { data: row, error } = await (context.supabase as any).from("sensors")
      .insert({ ...data, user_id: context.userId, token_hash: await tokenHash(token) }).select("id").single();
    if (missing(error)) throw new Error(NOT_READY);
    if (error) throw new Error(error.message);
    return { id: row.id as string, token };
  });

/** A new key for a sensor (the old one stops working). */
export const renewSensorKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const token = newSensorToken();
    const { error } = await (context.supabase as any).from("sensors").update({ token_hash: await tokenHash(token) }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { token };
  });

export const removeMySensor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("sensors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** A reading written by hand (a portable thermometer, a thermal camera read on the spot). */
export const addManualReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), kind: Kind, value: z.number() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = SENSOR_KINDS[data.kind];
    if (data.value < r.min || data.value > r.max) throw new Error(`Valore fuori scala (${r.min}–${r.max} ${r.unit})`);
    const sb = context.supabase as any;
    const at = new Date().toISOString();
    const { error } = await sb.from("sensor_readings").insert({ sensor_id: data.id, user_id: context.userId, kind: data.kind, value: data.value, at });
    if (error) throw new Error(error.message);
    await sb.from("sensors").update({ last_seen_at: at }).eq("id", data.id);
    return { ok: true };
  });

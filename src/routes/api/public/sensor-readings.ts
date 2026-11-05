import { createFileRoute } from "@tanstack/react-router";
import { MAX_READINGS_PER_CALL, parseReadings, tokenHash, type SensorKind } from "@/models/sensor-devices";

/**
 * Where a user's sensors send their readings. The device key (shown once when the sensor is added in the app) goes in
 * the header "Authorization: Bearer mdt_…" (or "X-Sensor-Key", or ?key= for devices that can only build a URL), the
 * body is JSON in any of the shapes parseReadings reads. GET with a key answers which sensor it is (to test a device).
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });

function keyOf(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const k = auth?.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-sensor-key") ?? new URL(request.url).searchParams.get("key");
  return k && /^mdt_[0-9a-f]{40}$/.test(k.trim()) ? k.trim() : null;
}

async function sensorOf(request: Request) {
  const key = keyOf(request);
  if (!key) return { error: json({ ok: false, error: "Chiave del sensore mancante o non valida" }, 401) } as const;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).from("sensors").select("id, user_id, name, kind, flow").eq("token_hash", await tokenHash(key)).maybeSingle();
  if (error) return { error: json({ ok: false, error: "Servizio non disponibile" }, 503) } as const;
  if (!data) return { error: json({ ok: false, error: "Sensore non trovato: la chiave è stata rinnovata o il sensore eliminato" }, 401) } as const;
  return { supabaseAdmin, sensor: data as { id: string; user_id: string; name: string; kind: SensorKind; flow: string } } as const;
}

export const Route = createFileRoute("/api/public/sensor-readings")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Sensor-Key" } }),
      GET: async ({ request }) => {
        const s = await sensorOf(request);
        if ("error" in s) return s.error;
        return json({ ok: true, sensor: { name: s.sensor.name, kind: s.sensor.kind, project: s.sensor.flow }, max_readings_per_call: MAX_READINGS_PER_CALL });
      },
      POST: async ({ request }) => {
        const s = await sensorOf(request);
        if ("error" in s) return s.error;
        const text = await request.text();
        if (text.length > 64_000) return json({ ok: false, error: "Messaggio troppo grande" }, 413);
        let body: unknown;
        try { body = JSON.parse(text); } catch { return json({ ok: false, error: "Il corpo deve essere JSON" }, 400); }
        const { readings, dropped } = parseReadings(body, s.sensor.kind);
        if (!readings.length) return json({ ok: false, saved: 0, dropped, error: "Nessuna lettura valida" }, 422);
        const { error } = await (s.supabaseAdmin as any).from("sensor_readings").insert(readings.map((r) => ({ ...r, sensor_id: s.sensor.id, user_id: s.sensor.user_id })));
        if (error) return json({ ok: false, error: "Salvataggio non riuscito" }, 500);
        const last = readings.reduce((m, r) => (r.at > m ? r.at : m), readings[0]!.at);
        await (s.supabaseAdmin as any).from("sensors").update({ last_seen_at: last }).eq("id", s.sensor.id);
        return json({ ok: true, saved: readings.length, dropped });
      },
    },
  },
});

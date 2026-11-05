import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiConfigured, aiResponses } from "@/lib/ai-responses";
import { OVERPASS_URLS } from "@/models/place-area";
import { cleanPicks, fallbackPicks, metres, readModelJson, type Poi, type Sensor } from "@/models/sensor-picks";

export type SensorPick = { nome: string; luogo: string; lat: number; lng: number; priorita: "alta" | "media" | "bassa"; motivi: string[] };
export type NetworkSummary = { sensoriEsistenti: number; temperaturaMedia: number | null; puntiSensibili: number; fermate: number };


/** fetch with a time limit: a slow source never holds the whole suggestion. */
async function timed(url: string, init: RequestInit = {}, ms = 9000): Promise<Response | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } catch { return null; } finally { clearTimeout(t); }
}

async function fetchExistingSensors(lat: number, lng: number): Promise<Sensor[]> {
  const r = await timed(`https://data.sensor.community/airrohr/v1/filter/area=${lat.toFixed(3)},${lng.toFixed(3)},1.5`, { headers: { Accept: "application/json" } }, 8000);
  if (!r?.ok) return [];
  try {
    const rows = (await r.json()) as { location: { latitude: string; longitude: string; id: number }; sensordatavalues: { value: string; value_type: string }[] }[];
    const seen = new Map<number, Sensor>();
    for (const row of rows) {
      const t = row.sensordatavalues.find((v) => v.value_type === "temperature");
      const prev = seen.get(row.location.id);
      const temp = t ? Number(t.value) : prev?.temp ?? null;
      seen.set(row.location.id, { lat: Number(row.location.latitude), lng: Number(row.location.longitude), temp: temp !== null && Number.isFinite(temp) && temp > -40 && temp < 60 ? temp : null });
    }
    return [...seen.values()].filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)).slice(0, 40);
  } catch { return []; }
}

/** The sensitive places around: the map servers asked in turn (the main one and two mirrors), 12 s each. */
async function fetchPois(lat: number, lng: number): Promise<Poi[]> {
  const q = `[out:json][timeout:20];(node(around:1500,${lat},${lng})[amenity~"school|kindergarten|hospital|clinic|nursing_home|marketplace"];way(around:1500,${lat},${lng})[amenity~"school|kindergarten|hospital|nursing_home|parking"];way(around:1500,${lat},${lng})[leisure~"park|playground"];node(around:1500,${lat},${lng})[leisure=playground];);out center 120;node(around:1500,${lat},${lng})[highway=bus_stop];out 60;`;
  for (const url of OVERPASS_URLS) {
    const r = await timed(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "MicroDigitalTwin/1.0" },
      body: new URLSearchParams({ data: q }),
    }, 12000);
    if (!r?.ok) continue;
    try {
      const j = (await r.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
      return j.elements.map((e) => {
        const t = e.tags ?? {};
        return { kind: t["amenity"] ?? t["leisure"] ?? t["highway"] ?? "altro", name: t["name"] ?? "", lat: e.lat ?? e.center?.lat ?? 0, lng: e.lon ?? e.center?.lon ?? 0 };
      }).filter((p) => p.lat);
    } catch { /* next mirror */ }
  }
  return [];
}

const SYSTEM = `Sei un esperto di monitoraggio microclimatico urbano e agricolo. Devi proporre dove installare nuovi sensori di temperatura.
Usa i dati reali forniti: sensori già attivi della rete Sensor.Community e luoghi sensibili da OpenStreetMap (scuole, ospedali, RSA, parchi, parcheggi, fermate).
Privilegia lacune di copertura, popolazioni vulnerabili, superfici impermeabili e, per i vigneti, versanti ed esposizioni diverse. Evita punti vicini a sensori esistenti.
Rispondi SOLO con JSON valido: {"sintesi":"...","sensori":[{"nome":"...","luogo":"...","lat":0,"lng":0,"priorita":"alta|media|bassa","motivi":["...","..."]}]}
Da 3 a 5 sensori: colloca li vicino ai luoghi sensibili entro 1,5 km dal centro della zona cercata, tenendo conto che anche i sensori esistenti sono stati analizzati entro 1,5 km; distribuisi in settori diversi, coordinate reali, 2-3 motivi brevi in italiano che citano i dati.
Il campo "luogo" deve descrivere il punto in modo riconoscibile: nome della via o della piazza e tipo di luogo (es. "Via Mazzini, vicino alla scuola elementare", "Parcheggio del terminal bus", "Versante sud del vigneto").`;

export const suggestHeatSensors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["urban", "vineyard"]), label: z.string().max(300), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(d))
  .handler(async ({ data }) => {
    const [sensors, pois] = await Promise.all([fetchExistingSensors(data.lat, data.lng), fetchPois(data.lat, data.lng)]);
    const temps = sensors.map((s) => s.temp).filter((t): t is number => t != null && Number.isFinite(t));
    const network: NetworkSummary = {
      sensoriEsistenti: sensors.length,
      temperaturaMedia: temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
      puntiSensibili: pois.filter((p) => p.kind !== "bus_stop").length,
      fermate: pois.filter((p) => p.kind === "bus_stop").length,
    };
    // The app's own picks from the same data: what is shown when the AI is not there or does not answer in time.
    const own = (why: string) => ({
      sintesi: `${why} Ecco i punti scelti dall'app con gli stessi dati: i luoghi sensibili più lontani dai sensori attivi, ${data.kind === "urban" ? "a partire da chi soffre di più il caldo" : "sui versanti e i bordi del vigneto"}.`,
      sensori: fallbackPicks(data.kind, data.lat, data.lng, sensors, pois, 4), network, fonte: "app" as const,
    });
    if (!aiConfigured()) return own("L'AI non è disponibile.");
    const input = [
      `Tipo area: ${data.kind === "urban" ? "urbana" : "vitivinicola"}`,
      `Centro: ${data.label} (${data.lat.toFixed(5)}, ${data.lng.toFixed(5)})`,
      `Sensori esistenti entro 1,5 km (${sensors.length}): ${sensors.map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}${s.temp != null ? ` ${s.temp}°C` : ""}`).join("; ") || "nessuno"}`,
      `Luoghi entro 1,5 km (${pois.length}): ${pois.slice(0, 120).map((p) => `${p.kind}${p.name ? ` "${p.name}"` : ""} ${p.lat.toFixed(4)},${p.lng.toFixed(4)} (${Math.round(metres(p, data))} m)`).join("; ") || "nessuno"}`,
      "Usa solo coordinate di luoghi elencati o punti tra essi; non ripetere punti a meno di 150 m da un sensore esistente o da un altro suggerimento.",
    ].join("\n");

    // The AI's answer, read as it streams, within 40 s; any failure falls back to the app's own picks.
    const ask = async (): Promise<string | null> => {
      const res = await aiResponses({ instructions: SYSTEM, input, stream: true, store: false, reasoning: { effort: "low" } });
      if (!res.ok || !res.body) { console.error("AI gateway", res.status, await res.text().catch(() => "")); return null; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.startsWith("data:")) continue;
          const p = l.slice(5).trim();
          if (!p || p === "[DONE]") continue;
          try { const ev = JSON.parse(p); if (ev.type === "response.output_text.delta") text += ev.delta; } catch { /* ignore */ }
        }
      }
      return text;
    };
    const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
    let text: string | null = null;
    // One more try when the first answer is empty or unreadable.
    for (let attempt = 0; attempt < 2 && !(text && readModelJson(text)); attempt++) text = await within(ask().catch(() => null), 40000);
    const j = text ? readModelJson(text) : null;
    if (!j) return own("L'AI non ha risposto in tempo.");
    const { picks, filled } = cleanPicks(j.sensori, data.kind, data.lat, data.lng, sensors, pois);
    if (!picks.length) return own("I punti dell'AI non andavano bene con i dati della zona.");
    const sintesi = String(j.sintesi ?? "").trim();
    return { sintesi: filled ? `${sintesi}${sintesi ? " " : ""}Alcuni punti dell'AI erano troppo vicini a sensori esistenti o fuori zona: li ho sostituiti con punti scelti dall'app.` : sintesi, sensori: picks, network, fonte: filled ? "misto" as const : "ai" as const };
  });

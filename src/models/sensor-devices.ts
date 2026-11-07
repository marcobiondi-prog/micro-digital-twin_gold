/**
 * The user's own sensors (thermal and others) and their readings: the kinds the app understands with their units and
 * plausible ranges, how a device's message is read (several shapes accepted, values out of range dropped), and what
 * the latest fresh readings say for the simulations. Pure: the server functions and the public route call these.
 */
export type SensorKind = "temperatura" | "superficie" | "umidita_aria" | "umidita_suolo" | "vento" | "pioggia";
export type SensorFlow = "piazza" | "vigneto";

export const SENSOR_KINDS: Record<SensorKind, { label: string; unit: string; min: number; max: number; aliases: string[] }> = {
  temperatura: { label: "Temperatura dell’aria", unit: "°C", min: -40, max: 70, aliases: ["temperature", "temp", "t", "air_temperature"] },
  superficie: { label: "Temperatura delle superfici (termico)", unit: "°C", min: -40, max: 90, aliases: ["surface", "surface_temperature", "ir", "thermal", "termico"] },
  umidita_aria: { label: "Umidità dell’aria", unit: "%", min: 0, max: 100, aliases: ["humidity", "rh", "umidita"] },
  umidita_suolo: { label: "Umidità del terreno", unit: "%", min: 0, max: 100, aliases: ["soil_moisture", "soil", "moisture", "suolo"] },
  vento: { label: "Vento", unit: "km/h", min: 0, max: 200, aliases: ["wind", "wind_speed", "wind_kmh"] },
  pioggia: { label: "Pioggia", unit: "mm", min: 0, max: 500, aliases: ["rain", "rain_mm", "precipitation"] },
};
export const KIND_LIST = Object.keys(SENSOR_KINDS) as SensorKind[];
/** A reading is "now" for this long; older ones are shown with their age but never used by the simulations. */
export const FRESH_MS = 2 * 60 * 60 * 1000;
export const MAX_READINGS_PER_CALL = 50;

export type Reading = { kind: SensorKind; value: number; at: string };

export function kindOf(name: unknown): SensorKind | null {
  if (typeof name !== "string") return null;
  const k = name.trim().toLowerCase();
  for (const kind of KIND_LIST) if (kind === k || SENSOR_KINDS[kind].aliases.includes(k)) return kind;
  return null;
}

const timeOf = (at: unknown, now: number): string | null => {
  if (at == null || at === "") return new Date(now).toISOString();
  const t = typeof at === "number" ? (at < 1e12 ? at * 1000 : at) : Date.parse(String(at));
  if (!Number.isFinite(t)) return null;
  // Not from the future (a few minutes of clock drift allowed), not older than 30 days.
  if (t > now + 5 * 60_000 || t < now - 30 * 86_400_000) return null;
  return new Date(t).toISOString();
};

/**
 * A device's message, in any of these shapes:
 *   { "value": 31.2 }                                   — the sensor's own kind, now
 *   { "kind": "temperatura", "value": 31.2, "at": "…" }
 *   { "temperature": 31.2, "humidity": 40 }             — several kinds at once, by name
 *   { "readings": [ { "kind": "…", "value": …, "at": … }, … ] }
 * Values out of each kind's range, unknown kinds and bad times are dropped and counted.
 */
export function parseReadings(body: unknown, sensorKind: SensorKind, now = Date.now()): { readings: Reading[]; dropped: number } {
  const out: Reading[] = [];
  let dropped = 0;
  const take = (kind: SensorKind | null, value: unknown, at: unknown) => {
    const v = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
    const r = kind ? SENSOR_KINDS[kind] : null;
    const t = timeOf(at, now);
    if (!kind || !r || value === null || value === "" || !Number.isFinite(v) || v < r.min || v > r.max || !t) { dropped++; return; }
    out.push({ kind, value: Math.round(v * 100) / 100, at: t });
  };
  if (!body || typeof body !== "object") return { readings: [], dropped: 1 };
  const b = body as { readings?: unknown; kind?: unknown; value?: unknown; at?: unknown } & Record<string, unknown>;
  if (Array.isArray(b.readings)) {
    for (const r of b.readings.slice(0, MAX_READINGS_PER_CALL)) {
      const o = (r && typeof r === "object" ? r : {}) as { kind?: unknown; value?: unknown; at?: unknown };
      take(o.kind == null ? sensorKind : kindOf(o.kind), o.value, o.at);
    }
    dropped += Math.max(0, b.readings.length - MAX_READINGS_PER_CALL);
  } else if ("value" in b) {
    take(b.kind == null ? sensorKind : kindOf(b.kind), b.value, b.at);
  } else {
    for (const [k, v] of Object.entries(b)) { if (k === "at") continue; const kind = kindOf(k); if (kind) take(kind, v, b.at); else dropped++; }
  }
  return { readings: out, dropped };
}

export type SensorRow = { id: string; flow: SensorFlow; name: string; kind: SensorKind; lat: number; lng: number; zone: number | null; last_seen_at: string | null; latest: Partial<Record<SensorKind, { value: number; at: string }>> };

export const isFresh = (at: string | null | undefined, now = Date.now()) => !!at && now - Date.parse(at) <= FRESH_MS;

/** The latest value of each kind per sensor from readings newest first. */
export function latestByKind(readings: Array<{ sensor_id: string; kind: string; value: number; at: string }>): Map<string, Partial<Record<SensorKind, { value: number; at: string }>>> {
  const m = new Map<string, Partial<Record<SensorKind, { value: number; at: string }>>>();
  for (const r of readings) {
    const kind = kindOf(r.kind); if (!kind) continue;
    const cur = m.get(r.sensor_id) ?? {};
    if (!cur[kind] || Date.parse(cur[kind]!.at) < Date.parse(r.at)) cur[kind] = { value: r.value, at: r.at };
    m.set(r.sensor_id, cur);
  }
  return m;
}

/** The average of the fresh values of one kind, over the given sensors (null when none is fresh). */
export function freshAverage(sensors: SensorRow[], kind: SensorKind, now = Date.now(), zone?: number): { value: number; count: number } | null {
  const vals = sensors.filter((s) => zone === undefined || s.zone === zone || s.zone === null)
    .map((s) => s.latest[kind]).filter((r): r is { value: number; at: string } => !!r && isFresh(r.at, now)).map((r) => r.value);
  if (!vals.length) return null;
  return { value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, count: vals.length };
}

export function ageText(at: string | null | undefined, now = Date.now()): string {
  if (!at) return "mai";
  const min = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h fa`;
  return `${Math.round(h / 24)} giorni fa`;
}

export function valueText(kind: SensorKind, value: number): string {
  return `${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })}${SENSOR_KINDS[kind].unit === "%" ? " %" : SENSOR_KINDS[kind].unit === "°C" ? "°" : ` ${SENSOR_KINDS[kind].unit}`}`;
}

/** A device key: 40 random hex characters, prefixed so it reads as the app's. */
export function newSensorToken(): string {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return `mdt_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}
export async function tokenHash(token: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * The heat-sensor suggestions, made sure: whatever the AI answers is checked against the real data (inside the 1,5 km
 * looked at, not on top of a sensor already there nor of another suggestion), its JSON read even when wrapped in code
 * fences or with trailing commas, and — when the AI does not answer, answers nothing usable or too few points — the
 * list is filled by the app itself from the same data: the sensitive places farthest from the sensors already there,
 * by how vulnerable the people there are, spread in different directions; for a vineyard, without places, the slopes
 * and edges around the plot. Pure: the server function fetches the data and calls these.
 */
export type Priority = "alta" | "media" | "bassa";
export type Pick = { nome: string; luogo: string; lat: number; lng: number; priorita: Priority; motivi: string[] };
export type Poi = { kind: string; name: string; lat: number; lng: number };
export type Sensor = { lat: number; lng: number; temp: number | null };

export const RADIUS_M = 1500;
/** A suggestion closer than this to a sensor already there, or to another suggestion, is dropped. */
export const MIN_GAP_M = 150;

export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.hypot(x, y) * 6_371_000;
}
const offset = (lat: number, lng: number, northM: number, eastM: number) => ({
  lat: +(lat + northM / 111_320).toFixed(5), lng: +(lng + eastM / (111_320 * Math.cos((lat * Math.PI) / 180))).toFixed(5),
});

/** The model's JSON, even inside ```json fences, with text around it or trailing commas; null when nothing can be read. */
export function readModelJson(text: string): { sintesi?: unknown; sensori?: unknown } | null {
  const body = text.replace(/```(?:json)?/gi, "");
  const start = body.indexOf("{"), end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const raw = body.slice(start, end + 1);
  for (const candidate of [raw, raw.replace(/,\s*([}\]])/g, "$1")]) {
    try { return JSON.parse(candidate) as { sintesi?: unknown; sensori?: unknown }; } catch { /* next */ }
  }
  return null;
}

/** What each kind of place means for the heat, in plain words, and how urgent a sensor there is. */
const PLACE: Record<string, { word: string; priority: Priority; why: string }> = {
  kindergarten: { word: "Asilo", priority: "alta", why: "Bambini piccoli all’aperto nelle ore calde" },
  school: { word: "Scuola", priority: "alta", why: "Bambini e ragazzi all’aperto, anche a fine primavera e inizio estate" },
  hospital: { word: "Ospedale", priority: "alta", why: "Persone fragili e chi le accompagna, spesso in attesa fuori" },
  clinic: { word: "Ambulatorio", priority: "alta", why: "Persone fragili in attesa all’aperto" },
  nursing_home: { word: "Residenza per anziani", priority: "alta", why: "Anziani, i più esposti al caldo" },
  playground: { word: "Parco giochi", priority: "media", why: "Bambini al sole, spesso su superfici scure" },
  marketplace: { word: "Mercato", priority: "media", why: "Molte persone ferme all’aperto nelle ore centrali" },
  park: { word: "Parco", priority: "bassa", why: "Punto di confronto con un’area verde più fresca" },
  parking: { word: "Parcheggio", priority: "media", why: "Grande superficie di asfalto che si scalda e trattiene il calore" },
  bus_stop: { word: "Fermata dell’autobus", priority: "media", why: "Persone in attesa sotto il sole" },
};
const RANK: Record<Priority, number> = { alta: 0, media: 1, bassa: 2 };
const SECTORS = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ovest", "ovest", "nord-ovest"];
const sectorOf = (c: { lat: number; lng: number }, p: { lat: number; lng: number }) => {
  const a = (Math.atan2(p.lng - c.lng, p.lat - c.lat) * 180) / Math.PI;
  return SECTORS[Math.round(((a + 360) % 360) / 45) % 8]!;
};
const nearestSensorM = (p: { lat: number; lng: number }, sensors: Sensor[]) => (sensors.length ? Math.min(...sensors.map((s) => metres(p, s))) : Infinity);

/** The app's own picks from the data: sensitive places far from the sensors already there, by vulnerability, spread out. */
export function fallbackPicks(kind: "urban" | "vineyard", lat: number, lng: number, sensors: Sensor[], pois: Poi[], want = 4): Pick[] {
  const centre = { lat, lng };
  const out: Pick[] = [];
  const free = (p: { lat: number; lng: number }) => metres(p, centre) <= RADIUS_M && nearestSensorM(p, sensors) >= MIN_GAP_M && out.every((q) => metres(p, q) >= MIN_GAP_M);
  const gapText = (p: { lat: number; lng: number }) => { const d = nearestSensorM(p, sensors); return Number.isFinite(d) ? `Il sensore attivo più vicino è a ${Math.round(d / 10) * 10} m` : "Nessun sensore attivo entro 1,5 km"; };
  // The place itself first: where the simulation is, measured on the spot.
  if (free(centre)) out.push({ nome: kind === "urban" ? "Centro della piazza" : "Centro del vigneto", luogo: kind === "urban" ? "Il punto della simulazione, al sole" : "Il punto della simulazione, tra i filari", lat: +lat.toFixed(5), lng: +lng.toFixed(5), priorita: "alta", motivi: [kind === "urban" ? "Misura il caldo proprio dove simuli gli interventi" : "Misura il caldo proprio dove simuli gli interventi sulle viti", gapText(centre)] });
  if (kind === "urban") {
    const ranked = pois.filter((p) => PLACE[p.kind])
      .map((p) => ({ p, info: PLACE[p.kind]!, gap: nearestSensorM(p, sensors), dist: metres(p, centre) }))
      .sort((a, b) => RANK[a.info.priority] - RANK[b.info.priority] || Math.min(b.gap, 2000) - Math.min(a.gap, 2000) || a.dist - b.dist);
    const usedSectors = new Set<string>();
    for (const pass of [true, false]) {
      for (const { p, info } of ranked) {
        if (out.length >= want) break;
        const sector = sectorOf(centre, p);
        if (pass && usedSectors.has(sector)) continue;
        if (!free(p)) continue;
        usedSectors.add(sector);
        out.push({ nome: p.name ? `${info.word} · ${p.name}` : info.word, luogo: `${p.name || info.word}, a ${Math.round(metres(p, centre) / 10) * 10} m verso ${sector}`,
          lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), priorita: info.priority, motivi: [info.why, gapText(p)] });
      }
    }
  }
  // A vineyard, or a town with too few places: points around, on the slopes and edges, in four directions.
  const ring = kind === "urban"
    ? [[350, 0, "nord"], [0, 350, "est"], [-350, 0, "sud"], [0, -350, "ovest"]] as const
    : [[-250, 0, "sud"], [250, 0, "nord"], [0, 300, "est"], [0, -300, "ovest"]] as const;
  for (const [n, e, side] of ring) {
    if (out.length >= want) break;
    const p = offset(lat, lng, n, e);
    if (!free(p)) continue;
    out.push(kind === "urban"
      ? { nome: `Strada a ${side}`, luogo: `Circa 350 m a ${side} della piazza`, ...p, priorita: "bassa", motivi: ["Copre una parte della zona ancora senza misure", gapText(p)] }
      : { nome: side === "sud" ? "Versante sud" : side === "nord" ? "Versante nord" : `Bordo ${side}`, luogo: side === "sud" ? "Versante sud, il più esposto al sole" : side === "nord" ? "Versante nord, più fresco: punto di confronto" : `Bordo ${side} del vigneto, esposto al vento`, ...p, priorita: side === "sud" ? "alta" : side === "nord" ? "bassa" : "media", motivi: [side === "sud" ? "Le viti qui soffrono di più il caldo del pomeriggio" : side === "nord" ? "Mostra quanto cambia il caldo tra un versante e l’altro" : "Il vento cambia la temperatura sulle foglie", gapText(p)] });
  }
  return out.slice(0, Math.max(3, want));
}

/**
 * The AI's picks kept only when they make sense with the data (a number inside the area looked at, away from the sensors
 * already there and from each other), with a place line always there; filled from the app's own picks up to three.
 */
export function cleanPicks(raw: unknown, kind: "urban" | "vineyard", lat: number, lng: number, sensors: Sensor[], pois: Poi[]): { picks: Pick[]; filled: number } {
  const centre = { lat, lng };
  const kept: Pick[] = [];
  for (const s of (Array.isArray(raw) ? raw : []).slice(0, 6) as Array<Partial<Pick> & Record<string, unknown>>) {
    const p = { lat: Number(s.lat), lng: Number(s.lng) };
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || (p.lat === 0 && p.lng === 0)) continue;
    if (metres(p, centre) > RADIUS_M * 1.1) continue;
    if (nearestSensorM(p, sensors) < MIN_GAP_M || kept.some((q) => metres(p, q) < MIN_GAP_M)) continue;
    const near = pois.length ? pois.reduce((b, q) => (metres(p, q) < metres(p, b) ? q : b), pois[0]!) : null;
    const nome = String(s.nome ?? "").trim() || (near && PLACE[near.kind] ? PLACE[near.kind]!.word : "Punto suggerito");
    const luogo = String(s.luogo ?? "").trim() || (near && metres(p, near) < 200 ? `${near.name || PLACE[near.kind]?.word || "Luogo"} · ${sectorOf(centre, p)}` : `A ${Math.round(metres(p, centre) / 10) * 10} m verso ${sectorOf(centre, p)}`);
    const motivi = (Array.isArray(s.motivi) ? s.motivi : []).map(String).map((m) => m.trim()).filter(Boolean).slice(0, 3);
    kept.push({ nome, luogo, lat: +p.lat.toFixed(5), lng: +p.lng.toFixed(5), priorita: s.priorita === "alta" || s.priorita === "bassa" ? s.priorita : "media", motivi: motivi.length ? motivi : ["Zona ancora senza misure di temperatura"] });
    if (kept.length >= 5) break;
  }
  let filled = 0;
  if (kept.length < 3) {
    for (const f of fallbackPicks(kind, lat, lng, sensors, pois, 5)) {
      if (kept.length >= 4) break;
      if (kept.some((q) => metres(f, q) < MIN_GAP_M)) continue;
      kept.push(f); filled++;
    }
  }
  kept.sort((a, b) => RANK[a.priorita] - RANK[b.priorita]);
  return { picks: kept, filled };
}

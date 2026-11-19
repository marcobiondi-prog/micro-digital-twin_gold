import { SEASON_LABEL, type Season } from "./season-climate";
import { drawnAreaFor, type DrawnArea } from "./drawn-area";
import { ringCentroid, ringContains, type Ring } from "./place-area";

/**
 * What is around the chosen place, read from the open map data by the phone (one query): what draws people (bars,
 * shops, schools, stops, churches, museums, hotels, markets, homes) and what can put the place under protection (goods
 * of cultural interest, rivers, coast, lakes, woods, parks). From it two indicative readings: how many people are in
 * the place at the simulation's season and hour (crowdEstimate) and which constraints probably apply (siteConstraints).
 * Neither is a count nor a legal opinion, and the screens say so.
 */

export const DRAW_M = 300; // radius for what draws people
type LL = { lat: number; lon: number };
export type SiteEl = { type: string; id?: number; lat?: number; lon?: number; center?: LL; geometry?: Array<LL | null>; members?: Array<{ lat?: number; lon?: number; geometry?: Array<LL | null> }>; tags?: Record<string, string> };

/** At most 40 points of the drawn outline (enough for the map servers' filters, short enough for the query). */
export function outline(ring?: Ring | null): Ring | null {
  if (!ring || ring.length < 3) return null;
  const open = ring.length > 3 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring;
  const step = Math.max(1, Math.ceil(open.length / 40));
  return open.filter((_, i) => i % step === 0);
}
/** The area's half-size in metres (its farthest corner from its middle). */
export function areaRadius(ring?: Ring | null): number {
  const o = outline(ring); if (!o) return 0;
  const c = ringCentroid(o);
  return Math.max(...o.map((p) => distM(p, c)));
}
/**
 * The map servers' filters for "within r metres of the place": around the drawn outline (its edge, closed) plus what
 * lies inside it — so a large area is read all over and every distance counts from its edge, as the law measures it —,
 * else around the point.
 */
export function zoneFilters(lat: number, lng: number, r: number, ring?: Ring | null): string[] {
  const o = outline(ring);
  if (!o) return [`(around:${r},${lat.toFixed(6)},${lng.toFixed(6)})`];
  const pts = [...o, o[0]!];
  return [`(around:${r},${pts.map(([a, b]) => `${a.toFixed(6)},${b.toFixed(6)}`).join(",")})`, `(poly:"${o.map(([a, b]) => `${a.toFixed(6)} ${b.toFixed(6)}`).join(" ")}")`];
}
/** The box round the place (the drawn area, else the point) grown by r metres: "S,W,N,E" for the map servers' bbox, their fastest filter. */
export function placeBox(lat: number, lng: number, r: number, ring?: Ring | null): string {
  const o = outline(ring) ?? [[lat, lng]];
  const la = o.map((p) => p[0]), ln = o.map((p) => p[1]);
  const dLat = r / 111_320, dLng = r / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [Math.min(...la) - dLat, Math.min(...ln) - dLng, Math.max(...la) + dLat, Math.max(...ln) + dLng].map((v) => v.toFixed(6)).join(",");
}
const union = (sels: string[], zs: string[]) => `(${sels.flatMap((s) => zs.map((z) => `${s}${z};`)).join("")})`;

/**
 * Two light queries (asked together), both on one box — the map servers' fastest filter, so even a busy server answers
 * in a few seconds (the round-the-outline filters tried before made the first reading time out). What draws people in
 * the box 300 m round the place (a drawn area's box grown by max(150, 300 − its half-size)), counts only…
 */
export function siteDrawsQuery(lat: number, lng: number, ring?: Ring | null): string {
  const box = placeBox(lat, lng, ring && outline(ring) ? Math.max(150, Math.round(DRAW_M - areaRadius(ring))) : DRAW_M, ring);
  // Only counts come back (one per kind, in DRAW_ORDER): a few hundred bytes, however busy the place.
  return `[out:json][timeout:20][bbox:${box}];`
    + `nwr["amenity"~"^(cafe|restaurant|bar|pub|fast_food|ice_cream)$"];out count;`
    + `nwr["shop"];out count;`
    + `nwr["amenity"~"^(school|kindergarten|college|university)$"];out count;`
    + `nwr["amenity"="place_of_worship"];out count;`
    + `(nwr["amenity"="bus_station"];node["highway"="bus_stop"];node["railway"~"^(station|halt)$"];);out count;`
    + `nwr["tourism"~"^(attraction|museum|gallery|viewpoint)$"];out count;`
    + `nwr["tourism"~"^(hotel|guest_house|hostel|apartment)$"];out count;`
    + `nwr["amenity"="marketplace"];out count;`
    + `nwr["amenity"~"^(townhall|library|theatre|cinema|pharmacy|hospital|clinic)$"];out count;`
    + `way["building"];out count;`
    + `nwr["office"];out count;`
    + `nwr["leisure"~"^(park|playground|garden|pitch|sports_centre)$"];out count;`;
}
/** The kinds counted by siteDrawsQuery, in its order. */
export const DRAW_ORDER = ["food", "shops", "schools", "worship", "transport", "attractions", "hotels", "markets", "services", "buildings", "offices", "leisure"] as const;
/** The counts of siteDrawsQuery's answer. */
export function drawsFromCounts(els: SiteEl[]): Draws {
  const d = Object.fromEntries(DRAW_ORDER.map((k) => [k, 0])) as Draws;
  els.filter((e) => e.type === "count").forEach((e, i) => { const k = DRAW_ORDER[i]; if (k) d[k] = Number(e.tags?.["total"] ?? 0) || 0; });
  return d;
}
/**
 * …and what can bring a constraint, in the box 330 m round the place, with its shape cut to that box (geom(box): long
 * rivers and coasts come back as the few metres that matter): cultural goods, rivers, coast, lakes and woods. Their
 * distance from the area's edge is measured on the phone (elDist) against the law's distances (CONSTRAINT_M).
 */
export function siteConstraintsQuery(lat: number, lng: number, ring?: Ring | null): string {
  const box = placeBox(lat, lng, 330, ring);
  return `[out:json][timeout:20][bbox:${box}];(nwr["heritage"];nwr["historic"];way["waterway"~"^(river|stream|canal)$"];way["natural"="coastline"];`
    + `way["natural"="water"]["water"~"^(lake|reservoir)$"];way["landuse"="forest"];way["natural"="wood"];);out tags geom(${box}) 400;`;
}
/** How near each kind must be (m from the area's edge, 0 inside) to count. */
export const CONSTRAINT_M = { heritage: 250, historic: 300, river: 160, coast: 320, lake: 320, wood: 60 } as const;
/** Points where the place is read for is_in: its middle and, with a drawn area, four of its corners spread round it. */
export function probePoints(lat: number, lng: number, ring?: Ring | null): Ring {
  const o = outline(ring);
  if (!o) return [[lat, lng]];
  const n = o.length, picks = n <= 4 ? o : [0, 1, 2, 3].map((k) => o[Math.floor((k * n) / 4)]!);
  return [ringCentroid(o), ...picks];
}
/** The parks, reserves and woods the place lies in or touches (is_in at its points): asked apart, as not every map server answers it. */
export function siteParksQuery(lat: number, lng: number, ring?: Ring | null): string {
  const pts = probePoints(lat, lng, ring);
  const sets = pts.map((_, i) => `.p${i}`);
  return `[out:json][timeout:15];${pts.map(([a, b], i) => `is_in(${a.toFixed(6)},${b.toFixed(6)})->.p${i};`).join("")}(${sets.map((x) => `${x};`).join("")})->.a;`
    + `(area.a["boundary"="protected_area"];area.a["leisure"="nature_reserve"];area.a["landuse"="forest"];area.a["natural"="wood"];);out tags;`;
}
/** Both queries (kept for the tests and for reading them together). */
export const siteContextQuery = (lat: number, lng: number, ring?: Ring | null) => `${siteDrawsQuery(lat, lng, ring)}\n${siteConstraintsQuery(lat, lng, ring)}\n${siteParksQuery(lat, lng, ring)}`;

export type Draws = { food: number; shops: number; schools: number; worship: number; transport: number; attractions: number; hotels: number; markets: number; services: number; buildings: number; offices?: number; leisure?: number };
export type SiteContext = { draws: Draws; els: SiteEl[]; lat: number; lng: number; ring?: Ring | undefined; elevation: number | null; drawsOk?: boolean; constraintsOk?: boolean; why?: string };

const posOf = (e: SiteEl): [number, number] | null => (e.lat != null && e.lon != null ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null);
export const distM = (a: [number, number], b: [number, number]) => {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * k);
};

/** How far a point is from the place: 0 inside the drawn area, else from its edge; from the point without an area. */
export function distToPlace(p: [number, number], lat: number, lng: number, ring?: Ring | null): number {
  const o = outline(ring);
  if (!o) return distM(p, [lat, lng]);
  if (ringContains(o, p[0], p[1])) return 0;
  const k = Math.cos((p[0] * Math.PI) / 180), xy = (q: [number, number]) => [(q[1] - p[1]) * 111_320 * k, (q[0] - p[0]) * 111_320] as const;
  let best = Infinity;
  for (let i = 0; i < o.length; i++) {
    const [ax, ay] = xy(o[i]!), [bx, by] = xy(o[(i + 1) % o.length]!);
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** How far an element is from the place: its nearest point (shape, members, centre or position); null when it has none (an is_in area: it contains the place). */
export function elDist(e: SiteEl, lat: number, lng: number, ring?: Ring | null): number | null {
  const pts: LL[] = [];
  if (e.lat != null && e.lon != null) pts.push({ lat: e.lat, lon: e.lon });
  if (e.center) pts.push(e.center);
  for (const g of e.geometry ?? []) if (g) pts.push(g);
  for (const m of e.members ?? []) { if (m.lat != null && m.lon != null) pts.push({ lat: m.lat, lon: m.lon }); for (const g of m.geometry ?? []) if (g) pts.push(g); }
  if (!pts.length) return null;
  const step = Math.max(1, Math.floor(pts.length / 400));
  let best = Infinity;
  for (let i = 0; i < pts.length; i += step) best = Math.min(best, distToPlace([pts[i]!.lat, pts[i]!.lon], lat, lng, ring));
  return best;
}

/** Counts of what draws people, from the query's answer (each place once). */
export function drawsFrom(els: SiteEl[], lat: number, lng: number): Draws {
  const d: Draws = { food: 0, shops: 0, schools: 0, worship: 0, transport: 0, attractions: 0, hotels: 0, markets: 0, services: 0, buildings: 0 };
  const seen = new Set<string>();
  for (const e of els) {
    if (e.type === "count") { d.buildings = Number(e.tags?.["ways"] ?? e.tags?.["total"] ?? 0) || 0; continue; }
    const key = `${e.type}${e.id ?? ""}`;
    if (e.id != null && seen.has(key)) continue;
    seen.add(key);
    const t = e.tags ?? {}, pos = posOf(e);
    if (pos && distM(pos, [lat, lng]) > DRAW_M + 30) continue;
    const a = t["amenity"], tour = t["tourism"];
    if (a && /^(cafe|restaurant|bar|pub|fast_food|ice_cream)$/.test(a)) d.food++;
    else if (a && /^(school|kindergarten|college|university)$/.test(a)) d.schools++;
    else if (a === "place_of_worship") d.worship++;
    else if (a === "marketplace") d.markets++;
    else if (a === "bus_station" || t["highway"] === "bus_stop" || /^(station|halt)$/.test(t["railway"] ?? "")) d.transport++;
    else if (a && /^(townhall|library|theatre|cinema|pharmacy|hospital|clinic)$/.test(a)) d.services++;
    else if (t["shop"]) d.shops++;
    else if (tour && /^(hotel|guest_house|hostel|apartment)$/.test(tour)) d.hotels++;
    else if (tour && /^(attraction|museum|gallery|viewpoint)$/.test(tour)) d.attractions++;
  }
  return d;
}

/* ---------------- People in the place ---------------- */

/** Share of the day's peak present at each hour (0–23), by season: the Italian evening stroll, the summer heat dip. */
export function hourShare(season: Season, hour: number): number {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const summer = season === "estate";
  if (h < 6) return 0.03;
  if (h < 8) return 0.15;
  if (h < 10) return 0.4;
  if (h < 12) return 0.6;
  if (h < 14) return 0.55;
  if (h < 17) return summer ? 0.4 : 0.6; // the hottest hours empty a summer piazza
  if (h < 19) return summer ? 0.8 : 0.9;
  if (h < 22) return summer ? 1 : h < 21 ? 0.7 : 0.4;
  return summer ? 0.55 : 0.15;
}
/** How busy the season is compared with summer, before tourism. */
export const SEASON_SHARE: Record<Season, number> = { estate: 1, primavera: 0.85, autunno: 0.75, inverno: 0.55 };

export type Crowd = { people: number; low: number; high: number; peak: number; per100: number; tourist: boolean; capped: boolean; byHour: number[] };

/**
 * People in the place at once, at that season and hour: the day's peak from what draws them within 300 m (homes, bars
 * and restaurants, shops, schools, churches, stops, museums, hotels, markets) — tourism weighing more in summer and
 * schools nothing in summer —, times the hour's share; never more than one person every 1,5 m² of the area. A range of
 * ±40 % around it. Indicative.
 */
export function crowdEstimate(d: Draws, m2: number, season: Season, hour: number): Crowd {
  const tourist = d.hotels + d.attractions >= 4;
  const tourism = season === "estate" ? 1.6 : season === "primavera" ? 1.15 : season === "autunno" ? 0.9 : 0.6;
  const peakOf = (h: number) => {
    const residents = d.buildings * 8 * 0.02; // about 8 people a building, 2 % of them out in the place at the peak
    const school = season === "estate" ? 0 : d.schools * ((h >= 7 && h < 9) || (h >= 12 && h < 14) ? 12 : 2);
    const market = d.markets * (h >= 7 && h < 13 ? 25 : 2);
    const visitors = (d.attractions * 12 + d.hotels * 3) * tourism;
    const work = (d.offices ?? 0) * (h >= 9 && h < 18 ? 1.5 : 0.2); // offices: people passing at work hours
    const play = (d.leisure ?? 0) * (h >= 16 && h < 21 ? 4 : h >= 9 && h < 16 ? 2 : 0.3); // parks, playgrounds, pitches
    return residents + d.food * 4 + d.shops * 1.2 + d.worship * 3 + d.transport * 2.5 + d.services * 2 + school + market + visitors + work + play;
  };
  // The surroundings' people spread over a usual piazza of about 3.000 m²: a smaller area holds fewer, a larger one more.
  const size = Math.min(2, Math.max(0.15, Math.pow(Math.max(1, m2) / 3000, 0.7)));
  const cap = Math.max(4, m2 / 1.5);
  const byHour = Array.from({ length: 24 }, (_, h) => Math.min(cap, Math.max(1, peakOf(h) * size * SEASON_SHARE[season] * hourShare(season, h))));
  const raw = peakOf(hour) * size * SEASON_SHARE[season] * hourShare(season, hour);
  const people = Math.round(Math.min(cap, Math.max(1, raw)));
  const peak = Math.round(Math.max(...byHour));
  return { people, low: Math.max(0, Math.round(people * 0.6)), high: Math.round(Math.min(cap, people * 1.4)), peak, per100: m2 > 0 ? (people / m2) * 100 : 0, tourist, capped: raw > cap, byHour: byHour.map((v) => Math.round(v)) };
}

/* ---------------- Constraints ---------------- */

export type Constraint = {
  id: "culturali" | "spazio-storico" | "archeologia" | "fiumi" | "costa" | "laghi" | "boschi" | "parchi" | "montagna";
  level: "probabile" | "possibile";
  title: string;
  law: string;
  why: string;
  means: string;
};

const HISTORIC_GOOD = /^(church|castle|palace|manor|building|monument|city_gate|citywalls|fort|tower|monastery|bridge|fountain|archaeological_site|ruins|aqueduct|theatre|chapel|house)$/;
const nameOf = (e: SiteEl) => e.tags?.["name"] ?? null;

/**
 * The constraints the open map data point to, from the Codice dei beni culturali e del paesaggio (D.Lgs. 42/2004):
 * goods of cultural interest close by (art. 10, authorisation art. 21), a historic public square or street (art. 10
 * c. 4 lett. g), archaeology, and the landscape areas protected by law (art. 142: coast 300 m, lakes 300 m, rivers
 * 150 m, mountains above 1.200 / 1.600 m, parks and reserves, woods; authorisation art. 146). A declaration of public
 * interest (art. 136) or a regional plan cannot be read here and is always left to check.
 */
export function siteConstraints(ctx: SiteContext, placeName: string): Constraint[] {
  const out: Constraint[] = [];
  const near = (f: (t: Record<string, string>) => boolean) => ctx.els.filter((e) => e.type !== "count" && f(e.tags ?? {}))
    .map((e) => ({ e, d: (() => { return elDist(e, ctx.lat, ctx.lng, ctx.ring); })() }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  const listed = (xs: Array<{ e: SiteEl; d: number | null }>) => xs.slice(0, 3).map(({ e, d }) => `${nameOf(e) ?? "bene storico"}${d != null ? ` (${Math.round(d / 10) * 10} m)` : ""}`).join(", ");

  const heritage = near((t) => !!t["heritage"] || HISTORIC_GOOD.test(t["historic"] ?? "")).filter((x) => x.d == null || x.d <= 150);
  if (heritage.length) {
    out.push({ id: "culturali", level: heritage.some((x) => x.e.tags?.["heritage"]) || heritage.length >= 2 ? "probabile" : "possibile",
      title: "Beni culturali vicini", law: "D.Lgs. 42/2004, artt. 10 e 21",
      why: `Vicino all’area: ${listed(heritage)}.`,
      means: "Gli interventi a ridosso di un bene tutelato o che ne cambiano l’aspetto richiedono l’autorizzazione della Soprintendenza." });
  }
  const square = /^(piazza|piazzale|largo|corso|via|vicolo|campo|piazzetta)\b/i.test(placeName.trim());
  const historicAround = near((t) => !!t["historic"] || !!t["heritage"]).filter((x) => x.d == null || x.d <= 300).length;
  if (square && historicAround >= 2) {
    out.push({ id: "spazio-storico", level: historicAround >= 4 ? "probabile" : "possibile",
      title: "Spazio pubblico storico", law: "D.Lgs. 42/2004, art. 10 c. 4 lett. g",
      why: `È uno spazio pubblico urbano con ${historicAround} beni storici nel raggio di 300 m: piazze e strade pubbliche di interesse storico, di proprietà pubblica e con più di 70 anni, sono tutelate per legge finché non se ne verifica l’interesse.`,
      means: "Pavimentazioni, arredi, vele ombreggianti e alberature nuove vanno sottoposti alla Soprintendenza." });
  }
  const arch = near((t) => t["historic"] === "archaeological_site").filter((x) => x.d == null || x.d <= 300);
  if (arch.length) out.push({ id: "archeologia", level: "possibile", title: "Area archeologica vicina", law: "D.Lgs. 42/2004, art. 10; D.Lgs. 36/2023, art. 41",
    why: `Nel raggio di 300 m: ${listed(arch)}.`, means: "Scavi per alberi, aiuole o tubazioni possono richiedere la verifica preventiva dell’interesse archeologico." });

  const has = (f: (t: Record<string, string>) => boolean, m: number) => near(f).some((x) => x.d == null || x.d <= m);
  const lscape = "D.Lgs. 42/2004, art. 142 (autorizzazione art. 146)";
  const lsMeans = "Serve l’autorizzazione paesaggistica (Comune o Regione, con il parere della Soprintendenza). Nei centri abitati il vincolo può non valere (art. 142 c. 2): lo dice l’Ufficio tecnico.";
  if (has((t) => t["natural"] === "coastline", CONSTRAINT_M.coast)) out.push({ id: "costa", level: "probabile", title: "Fascia costiera", law: `${lscape}, lett. a`, why: "La costa è entro 300 m.", means: lsMeans });
  if (has((t) => t["natural"] === "water" && /^(lake|reservoir)$/.test(t["water"] ?? ""), CONSTRAINT_M.lake)) out.push({ id: "laghi", level: "probabile", title: "Sponda di lago", law: `${lscape}, lett. b`, why: "Un lago o un invaso è entro 300 m.", means: lsMeans });
  const river = near((t) => /^(river|stream|canal)$/.test(t["waterway"] ?? "")).filter((x) => x.d == null || x.d <= CONSTRAINT_M.river);
  if (river.length) out.push({ id: "fiumi", level: river.some((x) => x.e.tags?.["waterway"] === "river") ? "probabile" : "possibile", title: "Fascia di fiume o torrente", law: `${lscape}, lett. c`,
    why: `${river[0] && nameOf(river[0].e) ? `${nameOf(river[0].e)}: ` : ""}il corso d’acqua è entro 150 m (vale per quelli iscritti negli elenchi delle acque pubbliche).`, means: lsMeans });
  const alps = ctx.lat > 45.5;
  if (ctx.elevation != null && ctx.elevation > (alps ? 1600 : 1200)) out.push({ id: "montagna", level: "probabile", title: "Montagna oltre i " + (alps ? "1.600" : "1.200") + " m", law: `${lscape}, lett. d`, why: `Il luogo è a circa ${Math.round(ctx.elevation)} m di quota.`, means: lsMeans });
  const park = near((t) => t["boundary"] === "protected_area" || t["leisure"] === "nature_reserve");
  if (park.length) out.push({ id: "parchi", level: "probabile", title: "Parco o riserva", law: `${lscape}, lett. f`, why: `${nameOf(park[0]!.e) ?? "Un’area protetta"} comprende o lambisce il luogo.`, means: `${lsMeans} Nel parco valgono anche le regole del suo ente.` });
  if (has((t) => t["landuse"] === "forest" || t["natural"] === "wood", CONSTRAINT_M.wood)) out.push({ id: "boschi", level: "possibile", title: "Bosco vicino", law: `${lscape}, lett. g`, why: "Un bosco è entro 60 m.", means: lsMeans });
  return out;
}

/** In plain words, how the interventions fare with the constraints found. */
export function interventionAdvice(cs: Constraint[], kind: "piazza" | "vigneto"): string[] {
  const cultural = cs.some((c) => c.id === "culturali" || c.id === "spazio-storico");
  const landscape = cs.some((c) => !["culturali", "spazio-storico", "archeologia"].includes(c.id));
  const tips: string[] = [];
  if (kind === "piazza") {
    if (cultural) tips.push("Vele, coperture e nebulizzatori fissi cambiano l’aspetto della piazza: servono progetto e parere della Soprintendenza. Meglio vele leggere e smontabili.");
    if (cultural || landscape) tips.push("Alberi di specie del luogo e aiuole sono di solito i più facili da far approvare; alcune piantumazioni sono escluse dall’autorizzazione paesaggistica (DPR 31/2017, allegato A).");
    if (cs.some((c) => c.id === "archeologia")) tips.push("Prima di scavare per alberi o tubazioni, chiedi se serve la verifica archeologica.");
  } else {
    if (landscape) tips.push("Teli d’ombra e frangivento con strutture alte cambiano il paesaggio: di solito serve l’autorizzazione paesaggistica, a volte semplificata (DPR 31/2017, allegato B).");
    if (landscape || cultural) tips.push("Le siepi di specie del luogo come frangivento e l’irrigazione a goccia interrata sono gli interventi più leggeri.");
  }
  return tips;
}

/* ---------------- Shared by the simulation, the dashboard and the report ---------------- */

/** Where the place is read: the drawn area's middle (about 10 m) when there is one, else the place's point — the same spot as the simulation's. */
export function siteCenter(location: { lat: number; lng: number }, area: DrawnArea | null | undefined): [number, number] {
  const a = drawnAreaFor(area, location);
  return a ? ringCentroid(a.ring).map((v) => Math.round(v * 1e4) / 1e4) as [number, number] : [location.lat, location.lng];
}
/** The query key of a place's surroundings (kept for the session, so the dashboard and the report reuse it). */
export const siteKey = (lat: number, lng: number, ring?: Ring | null) => ["site-context", lat.toFixed(4), lng.toFixed(4), ringTag(ring)] as const;
/** A short tag of the drawn outline (corners to about 1 m), so a redrawn area is read again. */
export function ringTag(ring?: Ring | null): string {
  const o = outline(ring); if (!o) return "";
  let h = 0;
  for (const [a, b] of o) for (const v of [Math.round(a * 1e5), Math.round(b * 1e5)]) h = (Math.imul(h, 31) + v) | 0;
  return `${o.length}:${(h >>> 0).toString(36)}`;
}

const it = (n: number) => Math.round(n).toLocaleString("it-IT");

/** The people's estimate as label · value rows (report and copied text). */
export function crowdRows(c: Crowd, season: Season, hour: number, shadePlaces: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Quando", `${SEASON_LABEL[season]}, ore ${String(Math.floor(hour)).padStart(2, "0")}:00`],
    ["Persone presenti", `circa ${it(c.low)}-${it(c.high)} (stima)`],
    ["Densità", `circa ${c.per100 < 1 ? c.per100.toFixed(1).replace(".", ",") : it(c.per100)} ogni 100 m²`],
    ["Momento più affollato", `circa ${it(c.peak)} persone`],
  ];
  if (shadePlaces > 0) rows.push(["Ombra degli interventi", `${it(shadePlaces)} posti: ${c.people > 0 && shadePlaces >= c.people ? "basta per tutti a quell’ora" : `circa il ${Math.round((shadePlaces / Math.max(1, c.people)) * 100)} % dei presenti`}`]);
  if (c.tourist) rows.push(["Zona", "turistica (più persone in estate)"]);
  return rows;
}
/** The constraints as label · value rows, then the advice (report and copied text). */
export function constraintRows(cs: Constraint[], kind: "piazza" | "vigneto"): Array<[string, string]> {
  // Nothing found: no rows (the report leaves the card out).
  if (!cs.length) return [];
  const rows: Array<[string, string]> = cs.map((c) => [`${c.title} (${c.level})`, `${c.law}. ${c.why} ${c.means}`]);
  interventionAdvice(cs, kind).forEach((t, i) => rows.push([i ? "" : "Per gli interventi", t]));
  rows.push(["Verifica", "Indicazione dalle mappe aperte, non un parere: il vincolo certo lo dicono l’Ufficio tecnico del Comune e la Soprintendenza."]);
  return rows;
}

/* ---------------- Interventions possible with the constraints found ---------------- */

export type Feasible = "libero" | "autorizzazione" | "sconsigliato";
export type InterventionHint = { id: string; label: string; status: Feasible; why: string };
export type PiazzaSuggestion = { trees: number; permeable: number; shade: number; misters: number; sprinklers: number };
export type VineSuggestion = { irrigation: number; shade: number; windbreak: number };

const worst = (a: Feasible, b: Feasible): Feasible => (a === "sconsigliato" || b === "sconsigliato" ? "sconsigliato" : a === "autorizzazione" || b === "autorizzazione" ? "autorizzazione" : "libero");

/**
 * After the surroundings are read: each intervention with how easy it is under the constraints found (libero: the
 * Comune's ordinary permits; autorizzazione: Soprintendenza or landscape authorisation; sconsigliato: fixed works that
 * change the look of a protected space) and why, plus a starting mix sized to the area that leaves out what is
 * sconsigliato and keeps light what needs an authorisation. Indicative, as the cards say.
 */
export function feasibleInterventions(cs: Constraint[], kind: "piazza" | "vigneto", m2: number):
  { hints: InterventionHint[]; piazza?: PiazzaSuggestion; vine?: VineSuggestion } {
  const cultural = cs.some((c) => c.id === "culturali" || c.id === "spazio-storico");
  const landscape = cs.some((c) => !["culturali", "spazio-storico", "archeologia"].includes(c.id));
  const arch = cs.some((c) => c.id === "archeologia");
  const dig = (s: Feasible): Feasible => (arch ? worst(s, "autorizzazione") : s);
  const digWhy = arch ? " Prima di scavare serve la verifica archeologica." : "";
  const area = Math.max(50, m2);
  if (kind === "piazza") {
    const trees: Feasible = dig(cultural ? "autorizzazione" : "libero");
    const beds: Feasible = dig("libero");
    // Shade sails: fabric on steel posts, taken down at the end of the season — lighter than any fixed structure, yet
    // near protected goods or in a landscape area they still need the authorisation.
    const pergola: Feasible = cultural || landscape ? "autorizzazione" : "libero";
    const misters: Feasible = cultural || landscape ? "autorizzazione" : "libero";
    const sprink: Feasible = dig("libero");
    const hints: InterventionHint[] = [
      { id: "alberi", label: "Alberi", status: trees, why: (cultural ? "Specie del luogo, con il parere della Soprintendenza: cambiano poco l’aspetto della piazza." : "Specie del luogo: tra gli interventi più facili da far approvare (DPR 31/2017, all. A).") + digWhy },
      { id: "aiuole", label: "Aiuole e ciottoli", status: beds, why: "Superfici verdi a raso: intervento leggero, di solito senza autorizzazione paesaggistica." + digWhy },
      { id: "vele", label: "Vele ombreggianti", status: pergola, why: cultural ? "Ali di tessuto su un palo laterale, che si richiudono: cambiano poco l’aspetto della piazza, ma vicino a beni tutelati serve il parere della Soprintendenza." : landscape ? "Vele su palo in area di paesaggio tutelato: serve l’autorizzazione paesaggistica, spesso semplificata se le vele sono stagionali." : "Nessun vincolo trovato: bastano i permessi ordinari del Comune." },
      { id: "nebulizzatori", label: "Nebulizzatori", status: misters, why: cultural || landscape ? "Pali fissi: vanno autorizzati; quelli mobili o stagionali sono più semplici." : "Nessun vincolo trovato: permessi ordinari." },
      { id: "innaffiatoi", label: "Innaffiatoi", status: sprink, why: "Impianto interrato sotto le aiuole: non si vede." + digWhy },
    ];
    const n = (per: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(area / per)));
    const piazza: PiazzaSuggestion = {
      trees: trees === "libero" ? n(120, 1, 20) : n(250, 1, 10),
      permeable: beds === "libero" ? 30 : 20,
      shade: pergola === "libero" ? 30 : pergola === "autorizzazione" ? 10 : 0,
      misters: misters === "libero" ? n(400, 1, 6) : 0,
      sprinklers: n(500, 1, 4),
    };
    return { hints, piazza };
  }
  const cloth: Feasible = landscape || cultural ? "autorizzazione" : "libero";
  const hints: InterventionHint[] = [
    { id: "irrigazione", label: "Irrigazione a goccia", status: dig("libero"), why: "Ali gocciolanti lungo i filari, anche interrate: non cambiano il paesaggio." + digWhy },
    { id: "teli", label: "Teli d’ombra", status: cloth, why: cloth === "libero" ? "Nessun vincolo trovato: permessi ordinari." : "Strutture alte sopra i filari: di solito serve l’autorizzazione paesaggistica, a volte semplificata (DPR 31/2017, all. B)." },
    { id: "frangivento", label: "Frangivento", status: "libero", why: landscape || cultural ? "Siepe di specie del luogo: la scelta più leggera; una rete alta andrebbe autorizzata." : "Siepe o rete: nessun vincolo trovato." },
  ];
  return { hints, vine: { irrigation: 8, shade: cloth === "libero" ? 30 : 0, windbreak: 40 } };
}

import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { Ring } from "@/models/place-area";
import { ZONE_LABEL, type SubArea, type ZoneKind } from "@/models/drawn-area";
import { bedParts, crownRing, trapParts, PERGOLA_COLORS, pergolaParts, pergolaRingParts, TREE_RADIUS_M, treeParts, type PiazzaLayout, type VineLayout } from "@/models/area-layout";

/** The drawn area on a maplibre map: a turquoise fill and a white outline, from a ring of [lat, lng] pins. */
export const AREA_SOURCE = "drawn-area";

export function areaGeoJson(ring: Ring, closed = true) {
  const coords = ring.map(([lat, lng]) => [lng, lat]);
  const features: Array<Record<string, unknown>> = [];
  if (closed && ring.length >= 3) features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] } });
  if (ring.length >= 2) features.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: closed && ring.length >= 3 ? [...coords, coords[0]] : coords } });
  return { type: "FeatureCollection", features } as unknown as Parameters<GeoJSONSource["setData"]>[0];
}

/** Adds the area's source and layers once the style is loaded (fill under a crisp white line). */
export function addAreaLayers(map: MlMap) {
  if (map.getSource(AREA_SOURCE)) return;
  map.addSource(AREA_SOURCE, { type: "geojson", data: areaGeoJson([]) });
  map.addLayer({ id: "drawn-area-fill", type: "fill", source: AREA_SOURCE, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#38d6c4", "fill-opacity": 0.12 } });
  // A dark casing under the white line, so the edge reads on bright fields and on dark roofs alike.
  map.addLayer({ id: "drawn-area-casing", type: "line", source: AREA_SOURCE, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#0b0f15", "line-width": 5.5, "line-opacity": 0.45, "line-blur": 0.5 }, layout: { "line-join": "round", "line-cap": "round" } });
  map.addLayer({ id: "drawn-area-line", type: "line", source: AREA_SOURCE, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ffffff", "line-width": 2.5 }, layout: { "line-join": "round", "line-cap": "round" } });
}

/** While drawing a zone inside it: the big area's outline, white and still, around the zone being drawn. */
export const OUTLINE_SOURCE = "drawn-outline";
export function setOutlineData(map: MlMap, ring: Ring | null) {
  if (!map.getSource(OUTLINE_SOURCE)) {
    map.addSource(OUTLINE_SOURCE, { type: "geojson", data: areaGeoJson([]) });
    map.addLayer({ id: "drawn-outline-line", type: "line", source: OUTLINE_SOURCE, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.7 } });
  }
  (map.getSource(OUTLINE_SOURCE) as GeoJSONSource | undefined)?.setData(areaGeoJson(ring ?? []));
}

export function setAreaData(map: MlMap, ring: Ring, closed = true) {
  (map.getSource(AREA_SOURCE) as GeoJSONSource | undefined)?.setData(areaGeoJson(ring, closed));
}

/** A pin of the area: a white dot with a dark ring and its number, big enough to grab with a finger. */
/**
 * The place's pin for the 2D maps: a red teardrop (darker edge and eye) whose tip is the element's very bottom edge, anchored "bottom", with a
 * small white dot on the exact point under it — the library's default pin was placed by an offset guess and read a
 * little off the spot.
 */
export function placePinElement(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:relative;width:26px;height:36px;pointer-events:auto;cursor:pointer";
  el.innerHTML = `<svg width="26" height="36" viewBox="0 0 26 36" style="display:block;overflow:visible;filter:drop-shadow(0 2px 3px rgb(0 0 0/.45))"><path d="M13 36C13 36 1 22.6 1 13a12 12 0 0 1 24 0c0 9.6-12 23-12 23z" fill="#ea4335" stroke="#a52714" stroke-width="1.5"/><circle cx="13" cy="13" r="4.5" fill="#7a1c10"/></svg><span style="position:absolute;left:50%;bottom:-3px;width:6px;height:6px;margin-left:-3px;border-radius:9999px;background:#ea4335;box-shadow:0 0 0 1.5px #fff"></span>`;
  return el;
}

export function pinElement(n: number, drawing: boolean): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.textContent = String(n);
  el.style.cssText = `display:grid;place-items:center;width:${drawing ? 28 : 18}px;height:${drawing ? 28 : 18}px;border-radius:9999px;background:#fff;color:#0b0f15;font:600 ${drawing ? 12 : 0}px/1 system-ui,sans-serif;box-shadow:0 0 0 2px #0b0f15,0 2px 8px rgb(0 0 0/.45);touch-action:none;cursor:${drawing ? "grab" : "default"}`;
  return el;
}

// ——— The simulation drawn inside the area (models/area-layout) ———

/** `inner`: the smaller areas drawn inside the big one (free zones, zones for one intervention, lots). */
/** `shadows`: the piazza's shadows at the simulation's season and hour (models/area-layout piazzaShadows); none at night. */
export type SimLayout = ({ kind: "piazza"; data: PiazzaLayout; shadows?: Ring[] } | { kind: "vigneto"; data: VineLayout; thirst: number[] }) & { inner?: SubArea[] };
/** The outline colour of each kind of inner zone. */
export const ZONE_COLORS: Record<ZoneKind, string> = { libera: "#cbd5e1", alberi: "#4ade80", prato: "#86efac", ombra: PERGOLA_COLORS.slat, lotto: "#fbbf24" };
/** A zone's short name on the map. */
export const zoneTag = (z: SubArea) => (z.kind === "lotto" ? z.name ?? "Lotto" : z.kind === "libera" ? "Libera" : ZONE_LABEL[z.kind]);
export const SIM_SOURCE = "sim-layout";
/** How far a mister's mist reaches (m): about 40 m² round each pole. */
export const MIST_RADIUS_M = 3.5;
export const SIM_TREES_3D = "sim-trees-3d";

/** The vines' thirst as the zone's colour: green, amber, red (the same steps as the arc's verdict). */
export const thirstColor = (s: number) => (s >= 65 ? "#ef4444" : s >= 35 ? "#eab308" : "#22c55e");
export const SIM_COLORS = { lawn: "#62ac42", shade: PERGOLA_COLORS.slat, treat: "#5eead4", drip: "#38bdf8", main: "#0369a1", trap: "#facc15", tree: "#2e7d32" } as const;
/** The 2D pattern of a pergola seen from above: wooden slats with light between them. */
export const SLATS_IMAGE = "pergola-slats";
/** The 2D pattern of a lawn: mowing stripes in two greens with blades of grass, so it reads as grass, not a flat green. */
export const LAWN_IMAGE = "lawn-beds-pebbles";

const poly = (ring: Ring, props: Record<string, unknown>) => ({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!].map(([la, ln]) => [ln, la])] } });
const lineF = (ring: Ring, props: Record<string, unknown>) => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: ring.map(([la, ln]) => [ln, la]) } });
const fc = (features: unknown[]) => ({ type: "FeatureCollection", features }) as unknown as Parameters<GeoJSONSource["setData"]>[0];

/** The flat parts (lawn, shade, zones, cloth, drip lines, windbreak) and, in 2D, the trees as points. */
export function simFeatures(sim: SimLayout | null, withTreePoints: boolean) {
  if (!sim) return fc([]);
  const out: unknown[] = [];
  if (sim.kind === "piazza") {
    // Shade: in 2D the slatted pergola pattern (in 3D the pergola stands over its ground); then the shadows the pergolas
    // and the trees cast with the sun of the simulation's season and hour.
    for (const p of sim.data.patches) if (p.kind === "lawn" || withTreePoints) out.push(poly(p.ring, p.kind === "lawn"
      ? { kind: "lawn", color: SIM_COLORS.lawn, opacity: 0.55 }
      : { kind: "shade", color: SIM_COLORS.shade, opacity: 0.9 }));
    for (const r of sim.shadows ?? []) out.push(poly(r, { kind: "shadow", color: "#0b0f15", opacity: 0.32 }));
    // Misters: the mist they spread (a light blue veil about 3,5 m round) and, in 2D, the pole seen from above.
    for (const m of sim.data.misters) {
      out.push(poly(crownRing(m, MIST_RADIUS_M, 20), { kind: "mist", color: "#7dd3fc", opacity: 0.3 }));
      if (withTreePoints) out.push(poly(crownRing(m, 0.45, 10), { kind: "mistpole", color: "#e0f2fe", opacity: 1 }));
    }
    if (withTreePoints) for (const t of sim.data.trees) out.push({ type: "Feature", properties: { kind: "tree" }, geometry: { type: "Point", coordinates: [t[1], t[0]] } });
  } else {
    // Zones: rows of vines on soil tinted by their stress; treated rows (plant pests): a fine spray over them.
    for (const p of sim.data.patches) out.push(poly(p.ring, p.kind === "zone"
      ? { kind: "zone", pattern: VINE_IMAGES[thirstStepOf(sim.thirst[p.zone ?? 0] ?? 0)], color: thirstColor(sim.thirst[p.zone ?? 0] ?? 0), opacity: 0.9 }
      : { kind: "treat", color: SIM_COLORS.treat, opacity: 0.85 }));
    // Each zone also gets a see-through veil of its thirst colour on top, so the three zones stand apart at a glance.
    for (const p of sim.data.patches) if (p.kind === "zone") out.push(poly(p.ring, { kind: "tint", color: thirstColor(sim.thirst[p.zone ?? 0] ?? 0), opacity: 0.3 }));
    for (const l of sim.data.lines) out.push(lineF(l.line, l.kind === "drip"
      ? { kind: "drip", color: SIM_COLORS.drip, width: 2 }
      : l.kind === "main" ? { kind: "main", color: SIM_COLORS.main, width: 4 }
      : { kind: "seam", color: "#ffffff", width: 2.5 }));
    // Traps against animal pests: a yellow sticky box seen from above (2D); in 3D they stand on a post.
    if (withTreePoints) for (const t of sim.data.traps) out.push({ type: "Feature", properties: { kind: "trap" }, geometry: { type: "Point", coordinates: [t[1], t[0]] } });
  }
  // The inner zones: a free zone greyed, every zone outlined with a dashed line of its colour.
  for (const z of sim.inner ?? []) {
    if (z.ring.length < 3) continue;
    // A free zone greyed; the others a see-through veil of their colour.
    out.push(z.kind === "libera" ? poly(z.ring, { kind: "free", color: "#475569", opacity: 0.55 }) : poly(z.ring, { kind: "tint", color: ZONE_COLORS[z.kind], opacity: 0.22 }));
    out.push(lineF([...z.ring, z.ring[0]!], { kind: "zoneline", color: ZONE_COLORS[z.kind], width: 2.5 }));
  }
  return fc(out);
}

/** The centre of a ring (mean of its pins), for a zone's tag. */
export const ringCentre = (ring: Ring): [number, number] => [ring.reduce((a, p) => a + p[0], 0) / ring.length, ring.reduce((a, p) => a + p[1], 0) / ring.length];

/** What stands up in 3D: each tree and a wooden pergola over each shade strip; in the vineyard the traps on their posts. */
export const treeCrowns = (sim: SimLayout | null) => fc(!sim ? [] : (sim.kind === "piazza"
  ? [...bedParts(sim.data.patches.filter((p) => p.kind === "lawn").map((p) => p.ring)).parts.map((p) => ({ ...p, base: p.base - 0.45, height: p.height - 0.45 })), ...sim.data.misters.map((m) => ({ ring: crownRing(m, 0.12, 6), base: 0, height: 3, color: "#cbd5e1" })), ...sim.data.trees.flatMap((t) => treeParts(t)), ...sim.data.patches.filter((p) => p.kind === "shade").flatMap((p) => (p.exact ? pergolaRingParts(p.ring) : pergolaParts(p.ring)))]
  : sim.data.traps.flatMap((t) => trapParts(t))
).map((p) => poly(p.ring, { kind: "raised", base: p.base, height: p.height, color: p.color })));

/** The vineyard's 2D images: rows of vines on soil tinted by stress (three steps), the spray over treated rows. */
export const VINE_IMAGES = ["vine-ok", "vine-watch", "vine-thirst"] as const;
export const SPRAY_IMAGE = "treated-rows";
const thirstStepOf = (s: number) => (s >= 65 ? 2 : s >= 35 ? 1 : 0);
type Img = { width: number; height: number; data: Uint8Array };
const blank = (w: number, h: number): Img => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });
const put = (img: Img, x: number, y: number, rgb: readonly number[], a = 255) => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4; img.data[o] = rgb[0]!; img.data[o + 1] = rgb[1]!; img.data[o + 2] = rgb[2]!; img.data[o + 3] = a;
};
/** Rows of vines (dark green leaves in clumps along a row every 8 px) on soil of the given tint. */
function vineImage(soil: readonly number[]): Img {
  const img = blank(24, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 24; x++) put(img, x, y, soil, 235);
  for (const row of [3, 11]) for (let x = 0; x < 24; x++) {
    const bump = (x % 6 < 4 ? 1 : 0);
    for (let dy = -1 - bump; dy <= 1 + bump; dy++) put(img, x, row + dy, dy === -1 - bump ? [0x5f, 0xa8, 0x45] : [0x2f, 0x6e, 0x2a]);
  }
  return img;
}
/** Treated rows from above: fine light droplets in a diagonal scatter, see-through between them. */
function sprayImage(): Img {
  const img = blank(12, 12);
  for (const [x, y] of [[1, 1], [7, 2], [4, 5], [10, 6], [2, 9], [8, 10]] as const) {
    put(img, x, y, [0xcc, 0xfb, 0xf1], 235); put(img, x + 1, y, [0x5e, 0xea, 0xd4], 200); put(img, x, y + 1, [0x5e, 0xea, 0xd4], 200);
  }
  return img;
}

/** The slats image for the 2D pergolas: light wood strips with darker gaps, repeated over the shade. */
/**
 * The lawn image: two bands of green (a mown lawn's stripes) with short blades scattered lighter and darker,
 * picked by a fixed pseudo-random sequence so it is the same on every device.
 */
/**
 * Aiuole e ciottoli seen from above: beds of short grass with small flowers (pink, yellow, white), separated by a path
 * of round pebbles in greys and sand tones on a darker gravel bed — a 48 px tile, so the pattern repeats as beds and paths.
 */
function lawnImage(): { width: number; height: number; data: Uint8Array } {
  const w = 48, h = 48, data = new Uint8Array(w * h * 4);
  const light = [0x6c, 0xb8, 0x4a], dark = [0x5c, 0xa4, 0x3e], gravel = [0x8a, 0x80, 0x72];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const put = (x: number, y: number, c: readonly number[]) => { const o = (((y + h) % h) * w + ((x + w) % w)) * 4; data[o] = c[0]!; data[o + 1] = c[1]!; data[o + 2] = c[2]!; data[o + 3] = 255; };
  // The pebble path: the last 16 px of the tile, across.
  const path = (x: number) => x >= 32;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, path(x) ? gravel : (Math.floor(y / 8) % 2 ? dark : light));
  // Grass blades on the beds.
  for (let i = 0; i < 140; i++) {
    const x = Math.floor(rnd() * 32), y0 = Math.floor(rnd() * h), len = 2 + Math.floor(rnd() * 3), k = rnd() < 0.5 ? 1.18 : 0.82;
    for (let d = 0; d < len; d++) {
      const o = (((y0 + d) % h) * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.max(0, Math.min(255, Math.round(data[o + ch]! * k)));
    }
  }
  // Small flowers in the beds.
  const petals = [[0xf4, 0x8f, 0xb1], [0xfa, 0xd2, 0x4b], [0xf5, 0xf5, 0xf0], [0xc0, 0x84, 0xfc]];
  for (let i = 0; i < 14; i++) {
    const x = 2 + Math.floor(rnd() * 28), y = Math.floor(rnd() * h), c = petals[i % petals.length]!;
    put(x, y, c); put(x + 1, y, c); put(x, y + 1, c); put(x + 1, y + 1, [0xf0, 0xc0, 0x30]);
  }
  // Round pebbles on the path, a light top edge and a dark lower edge so they read as stones.
  const stones = [[0xd6, 0xd0, 0xc4], [0xb8, 0xb0, 0xa2], [0xe4, 0xd8, 0xbc], [0x9c, 0x96, 0x8c], [0xc8, 0xb8, 0x9a]];
  for (let i = 0; i < 26; i++) {
    const cx = 33 + Math.floor(rnd() * 14), cy = Math.floor(rnd() * h), r = 1.4 + rnd() * 1.6, c = stones[i % stones.length]!;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy * 1.2);
      if (d > r) continue;
      const k = dy < 0 ? 1.12 : dy > 0 && d > r - 1 ? 0.72 : 1;
      put(cx + dx < 32 ? 32 : Math.min(47, cx + dx), cy + dy, c.map((v) => Math.min(255, Math.round(v * k))));
    }
  }
  return { width: w, height: h, data };
}

function slatsImage(): { width: number; height: number; data: Uint8Array } {
  const w = 12, h = 12, data = new Uint8Array(w * h * 4);
  const wood = [0xc9, 0x9a, 0x63], gap = [0x5a, 0x3b, 0x1c];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = x % 6 < 4 ? wood : gap, o = (y * w + x) * 4;
    data[o] = c[0]!; data[o + 1] = c[1]!; data[o + 2] = c[2]!; data[o + 3] = x % 6 < 4 ? 235 : 150;
  }
  return { width: w, height: h, data };
}

/** Pixels for a length in metres at a zoom, around a latitude (so a crown keeps its real size while zooming). */
const metresToPx = (m: number, lat: number, zoom: number) => m / ((156_543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom);

/** Adds the simulation's source and layers under the area's white outline; `raised` adds the 3D trees and shade. */
export function addSimLayers(map: MlMap, lat: number, raised = false) {
  if (map.getSource(SIM_SOURCE)) return;
  const before = map.getLayer("drawn-area-line") ? "drawn-area-line" : undefined;
  map.addSource(SIM_SOURCE, { type: "geojson", data: fc([]) });
  map.addLayer({ id: "sim-fill", type: "fill", source: SIM_SOURCE, filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "kind"], "shade"], ["!=", ["get", "kind"], "lawn"], ["!=", ["get", "kind"], "zone"], ["!=", ["get", "kind"], "treat"], ["!=", ["get", "kind"], "tint"], ["!=", ["get", "kind"], "shadow"]], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } }, before);
  // The vineyard: rows of vines on soil tinted by each zone's thirst, a white seam around each zone, the shade nets.
  const thirstTints = [[0x6f, 0x8f, 0x4a], [0x9a, 0x85, 0x3c], [0x9c, 0x5a, 0x3a]] as const;
  VINE_IMAGES.forEach((id, i) => { if (!map.hasImage(id)) map.addImage(id, vineImage(thirstTints[i]!)); });
  if (!map.hasImage(SPRAY_IMAGE)) map.addImage(SPRAY_IMAGE, sprayImage());
  map.addLayer({ id: "sim-vine", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "zone"], paint: { "fill-pattern": ["get", "pattern"], "fill-opacity": 0.92, "fill-antialias": false } }, before);
  // The veils over the zones, without seams between their row strips.
  map.addLayer({ id: "sim-tint", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "tint"], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"], "fill-antialias": false } }, before);
  map.addLayer({ id: "sim-net", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "treat"], paint: { "fill-pattern": SPRAY_IMAGE, "fill-opacity": 0.9, "fill-antialias": false } }, before);
  // The lawn: mowing stripes and blades of grass, without the hairlines between its row strips.
  if (!map.hasImage(LAWN_IMAGE)) map.addImage(LAWN_IMAGE, lawnImage());
  // In 3D no ground plane for the lawn: the beds lie on the map's own ground (bedParts, raised); in 2D the beds-and-pebbles pattern.
  if (!raised) map.addLayer({ id: "sim-lawn", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "lawn"], paint: { "fill-pattern": LAWN_IMAGE, "fill-opacity": 0.95, "fill-antialias": false } }, before);
  // The shadows cast on the ground (over the lawn, under the pergolas and the trees), without seams where they overlap.
  map.addLayer({ id: "sim-shadow", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shadow"], paint: { "fill-color": "#0b0f15", "fill-opacity": 0.32, "fill-antialias": false } }, before);
  // The pergolas seen from above: slats with light between them, and a wooden frame.
  if (!map.hasImage(SLATS_IMAGE)) map.addImage(SLATS_IMAGE, slatsImage());
  map.addLayer({ id: "sim-pergola", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shade"], paint: { "fill-pattern": SLATS_IMAGE, "fill-opacity": 0.95 } }, before);
  map.addLayer({ id: "sim-pergola-frame", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shade"], paint: { "line-color": PERGOLA_COLORS.beam, "line-width": 1.5 } }, before);
  // Irrigation: the main pipe (a thick dark blue line with a light core) and the drip lines (a blue pipe with light
  // drippers along it, every ~1 m at street zoom, and a faint wet band on the soil under each).
  map.addLayer({ id: "sim-drip-wet", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "drip"], paint: { "line-color": "#1e3a5f", "line-opacity": 0.35, "line-blur": 1, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 12, metresToPx(0.9, lat, 12), 22, metresToPx(0.9, lat, 22)] } }, before);
  map.addLayer({ id: "sim-drip-pipe", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "drip"], paint: { "line-color": "#0369a1", "line-width": 1.6 } }, before);
  map.addLayer({ id: "sim-drip-dots", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "drip"], paint: { "line-color": "#bae6fd", "line-width": 3.5, "line-dasharray": [0, 2.6] }, layout: { "line-cap": "round" } }, before);
  map.addLayer({ id: "sim-main", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "main"], paint: { "line-color": "#0c4a6e", "line-width": 5 }, layout: { "line-cap": "round" } }, before);
  map.addLayer({ id: "sim-main-core", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "main"], paint: { "line-color": "#38bdf8", "line-width": 1.8 }, layout: { "line-cap": "round" } }, before);
  map.addLayer({ id: "sim-line", type: "line", source: SIM_SOURCE, filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "kind"], "drip"], ["!=", ["get", "kind"], "main"]], paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-dasharray": ["case", ["==", ["get", "kind"], "drip"], ["literal", [2, 1.5]], ["==", ["get", "kind"], "zoneline"], ["literal", [2.5, 1.5]], ["literal", [1, 0]]] }, layout: { "line-cap": "round" } }, before);
  if (raised) {
    map.addSource(SIM_TREES_3D, { type: "geojson", data: fc([]) });
    map.addLayer({ id: "sim-trees-3d", type: "fill-extrusion", source: SIM_TREES_3D, paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } });
  } else {
    map.addLayer({ id: "sim-traps", type: "circle", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "trap"], paint: { "circle-color": SIM_COLORS.trap, "circle-radius": 4, "circle-stroke-color": "#422006", "circle-stroke-width": 1.5 } }, before);
    map.addLayer({ id: "sim-trees", type: "circle", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "tree"], paint: {
      "circle-color": SIM_COLORS.tree, "circle-opacity": 0.9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2,
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 12, metresToPx(TREE_RADIUS_M, lat, 12), 22, metresToPx(TREE_RADIUS_M, lat, 22)],
    } }, before);
  }
}

/**
 * While the area or a zone is being drawn or edited the rest of the simulation stays in view, faded (about a third of
 * its strength), so the pins are placed knowing what is around them; back to full strength afterwards.
 */
export function setSimGhost(map: MlMap, ghost: boolean) {
  const k = ghost ? 0.35 : 1;
  const set = (layer: string, prop: string, value: unknown) => { if (map.getLayer(layer)) map.setPaintProperty(layer, prop as never, value as never); };
  set("sim-fill", "fill-opacity", ["*", ["get", "opacity"], k]);
  set("sim-lawn", "fill-opacity", 0.95 * k);
  set("sim-pergola", "fill-opacity", 0.95 * k);
  set("sim-shadow", "fill-opacity", 0.32 * k);
  set("sim-pergola-frame", "line-opacity", k);
  set("sim-line", "line-opacity", k);
  set("sim-vine", "fill-opacity", 0.92 * k);
  set("sim-tint", "fill-opacity", ["*", ["get", "opacity"], k]);
  set("sim-net", "fill-opacity", 0.9 * k);
  set("sim-drip-pipe", "line-opacity", k);
  set("sim-drip-dots", "line-opacity", k);
  set("sim-drip-wet", "line-opacity", 0.35 * k);
  set("sim-main", "line-opacity", k);
  set("sim-main-core", "line-opacity", k);
  set("sim-traps", "circle-opacity", k);
  set("sim-traps", "circle-stroke-opacity", k);
  set("sim-trees", "circle-opacity", 0.9 * k);
  set("sim-trees", "circle-stroke-opacity", k);
}

export function setSimData(map: MlMap, sim: SimLayout | null, raised = false) {
  (map.getSource(SIM_SOURCE) as GeoJSONSource | undefined)?.setData(simFeatures(sim, !raised));
  if (raised) (map.getSource(SIM_TREES_3D) as GeoJSONSource | undefined)?.setData(treeCrowns(sim));
}

/** A small fixed label on the map (the vineyard's zone names). */
export function tagElement(label: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.textContent = label;
  el.style.cssText = "padding:3px 8px;border-radius:9999px;background:rgb(11 15 21/.75);color:#fff;font:600 12px/1 system-ui,sans-serif;pointer-events:none;white-space:nowrap";
  return el;
}

/** A handle to move by hand: a tree (green dot) or a labelled pill (Aiuole, Ombra). */
export function handleElement(label: string | null): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  if (label) {
    el.textContent = label;
    el.style.cssText = "padding:6px 12px;border-radius:9999px;background:#fff;color:#0b0f15;font:600 13px/1 system-ui,sans-serif;box-shadow:0 0 0 2px #0b0f15,0 2px 8px rgb(0 0 0/.45);touch-action:none;cursor:grab;white-space:nowrap";
  } else {
    el.style.cssText = `width:24px;height:24px;border-radius:9999px;background:${SIM_COLORS.tree};box-shadow:0 0 0 2px #fff,0 2px 8px rgb(0 0 0/.45);touch-action:none;cursor:grab`;
  }
  return el;
}

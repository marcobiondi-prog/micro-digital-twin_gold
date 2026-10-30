import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { Ring } from "@/models/place-area";
import { ZONE_LABEL, type SubArea, type ZoneKind } from "@/models/drawn-area";
import { hedgeParts, netParts, PERGOLA_COLORS, pergolaParts, TREE_RADIUS_M, treeParts, type PiazzaLayout, type VineLayout } from "@/models/area-layout";

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
  map.addLayer({ id: "drawn-area-fill", type: "fill", source: AREA_SOURCE, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#38d6c4", "fill-opacity": 0.28 } });
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
export function pinElement(n: number, drawing: boolean): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.textContent = String(n);
  el.style.cssText = `display:grid;place-items:center;width:${drawing ? 28 : 18}px;height:${drawing ? 28 : 18}px;border-radius:9999px;background:#fff;color:#0b0f15;font:600 ${drawing ? 12 : 0}px/1 system-ui,sans-serif;box-shadow:0 0 0 2px #0b0f15,0 2px 8px rgb(0 0 0/.45);touch-action:none;cursor:${drawing ? "grab" : "default"}`;
  return el;
}

// ——— The simulation drawn inside the area (models/area-layout) ———

/** `inner`: the smaller areas drawn inside the big one (free zones, zones for one intervention, lots). */
export type SimLayout = ({ kind: "piazza"; data: PiazzaLayout } | { kind: "vigneto"; data: VineLayout; thirst: number[] }) & { inner?: SubArea[] };
/** The outline colour of each kind of inner zone. */
export const ZONE_COLORS: Record<ZoneKind, string> = { libera: "#cbd5e1", alberi: "#4ade80", prato: "#86efac", ombra: PERGOLA_COLORS.slat, lotto: "#fbbf24" };
/** A zone's short name on the map. */
export const zoneTag = (z: SubArea) => (z.kind === "lotto" ? z.name ?? "Lotto" : z.kind === "libera" ? "Libera" : ZONE_LABEL[z.kind]);
export const SIM_SOURCE = "sim-layout";
export const SIM_TREES_3D = "sim-trees-3d";

/** The vines' thirst as the zone's colour: green, amber, red (the same steps as the arc's verdict). */
export const thirstColor = (s: number) => (s >= 65 ? "#ef4444" : s >= 35 ? "#eab308" : "#22c55e");
export const SIM_COLORS = { lawn: "#62ac42", shade: PERGOLA_COLORS.slat, cloth: "#334155", drip: "#38bdf8", wind: "#15803d", tree: "#2e7d32" } as const;
/** The 2D pattern of a pergola seen from above: wooden slats with light between them. */
export const SLATS_IMAGE = "pergola-slats";
/** The 2D pattern of a lawn: mowing stripes in two greens with blades of grass, so it reads as grass, not a flat green. */
export const LAWN_IMAGE = "lawn-grass";

const poly = (ring: Ring, props: Record<string, unknown>) => ({ type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!].map(([la, ln]) => [ln, la])] } });
const lineF = (ring: Ring, props: Record<string, unknown>) => ({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: ring.map(([la, ln]) => [ln, la]) } });
const fc = (features: unknown[]) => ({ type: "FeatureCollection", features }) as unknown as Parameters<GeoJSONSource["setData"]>[0];

/** The flat parts (lawn, shade, zones, cloth, drip lines, windbreak) and, in 2D, the trees as points. */
export function simFeatures(sim: SimLayout | null, withTreePoints: boolean) {
  if (!sim) return fc([]);
  const out: unknown[] = [];
  if (sim.kind === "piazza") {
    // Shade: in 2D the slatted pergola pattern; in 3D only the shadow it casts on the ground (the pergola stands over it).
    for (const p of sim.data.patches) out.push(poly(p.ring, p.kind === "lawn"
      ? { kind: "lawn", color: SIM_COLORS.lawn, opacity: 0.55 }
      : withTreePoints ? { kind: "shade", color: SIM_COLORS.shade, opacity: 0.9 } : { kind: "shadow", color: "#0b0f15", opacity: 0.35 }));
    if (withTreePoints) for (const t of sim.data.trees) out.push({ type: "Feature", properties: { kind: "tree" }, geometry: { type: "Point", coordinates: [t[1], t[0]] } });
  } else {
    // Zones: rows of vines on soil tinted by their thirst; cloth: a dark shade net; drip lines and the hedge drawn below.
    for (const p of sim.data.patches) out.push(poly(p.ring, p.kind === "zone"
      ? { kind: "zone", pattern: VINE_IMAGES[thirstStepOf(sim.thirst[p.zone ?? 0] ?? 0)], color: thirstColor(sim.thirst[p.zone ?? 0] ?? 0), opacity: 0.9 }
      : { kind: "cloth", color: SIM_COLORS.cloth, opacity: 0.55 }));
    // Each zone also gets a see-through veil of its thirst colour on top, so the three zones stand apart at a glance.
    for (const p of sim.data.patches) if (p.kind === "zone") out.push(poly(p.ring, { kind: "tint", color: thirstColor(sim.thirst[p.zone ?? 0] ?? 0), opacity: 0.3 }));
    for (const l of sim.data.lines) out.push(lineF(l.line, l.kind === "drip"
      ? { kind: "drip", color: SIM_COLORS.drip, width: 2 }
      : l.kind === "seam" ? { kind: "seam", color: "#ffffff", width: 2.5 }
      : { kind: "wind", color: SIM_COLORS.wind, width: 6 + (l.strength ?? 0) / 10 }));
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

/** What stands up in 3D: each tree and a wooden pergola over each shade strip; in the vineyard the hedge and the shade nets. */
export const treeCrowns = (sim: SimLayout | null) => fc(!sim ? [] : (sim.kind === "piazza"
  ? [...sim.data.trees.flatMap((t) => treeParts(t)), ...sim.data.patches.filter((p) => p.kind === "shade").flatMap((p) => pergolaParts(p.ring))]
  : [...sim.data.lines.filter((l) => l.kind === "wind").flatMap((l) => hedgeParts(l.line, l.strength ?? 0)), ...sim.data.patches.filter((p) => p.kind === "cloth").flatMap((p) => netParts(p.ring))]
).map((p) => poly(p.ring, { kind: "raised", base: p.base, height: p.height, color: p.color })));

/** The vineyard's 2D images: rows of vines on soil tinted by thirst (three steps), the shade net, the hedge. */
export const VINE_IMAGES = ["vine-ok", "vine-watch", "vine-thirst"] as const;
export const NET_IMAGE = "shade-net", HEDGE_IMAGE = "windbreak-hedge";
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
/** A dark shade net: a fine square mesh, see-through between the threads. */
function netImage(): Img {
  const img = blank(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) put(img, x, y, [0x1f, 0x29, 0x33], x % 4 === 0 || y % 4 === 0 ? 235 : 120);
  return img;
}
/** A hedge seen from above: round bushes in two greens along the line, a darker edge. */
function hedgeImage(): Img {
  const w = 16, h = 16, img = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = x < 8 ? 4 : 12, d = Math.hypot(x - cx, y - 8);
    if (d < 6.5) put(img, x, y, d < 3 ? [0x4f, 0x9a, 0x3c] : [0x2f, 0x6b, 0x2a]);
    else if (y > 2 && y < 14) put(img, x, y, [0x24, 0x52, 0x20]);
  }
  return img;
}

/** The slats image for the 2D pergolas: light wood strips with darker gaps, repeated over the shade. */
/**
 * The lawn image: two bands of green (a mown lawn's stripes) with short blades scattered lighter and darker,
 * picked by a fixed pseudo-random sequence so it is the same on every device.
 */
function lawnImage(): { width: number; height: number; data: Uint8Array } {
  const w = 32, h = 32, data = new Uint8Array(w * h * 4);
  const light = [0x6c, 0xb8, 0x4a], dark = [0x58, 0xa0, 0x3a];
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = y < h / 2 ? light : dark, o = (y * w + x) * 4;
    data[o] = c[0]!; data[o + 1] = c[1]!; data[o + 2] = c[2]!; data[o + 3] = 255;
  }
  // Blades: short vertical strokes, a little lighter or darker than their band.
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * w), y0 = Math.floor(rnd() * h), len = 2 + Math.floor(rnd() * 3), k = rnd() < 0.5 ? 1.18 : 0.82;
    for (let d = 0; d < len; d++) {
      const y = (y0 + d) % h, o = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) data[o + ch] = Math.max(0, Math.min(255, Math.round(data[o + ch]! * k)));
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
  map.addLayer({ id: "sim-fill", type: "fill", source: SIM_SOURCE, filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "kind"], "shade"], ["!=", ["get", "kind"], "lawn"], ["!=", ["get", "kind"], "zone"], ["!=", ["get", "kind"], "cloth"], ["!=", ["get", "kind"], "tint"]], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } }, before);
  // The vineyard: rows of vines on soil tinted by each zone's thirst, a white seam around each zone, the shade nets.
  const thirstTints = [[0x6f, 0x8f, 0x4a], [0x9a, 0x85, 0x3c], [0x9c, 0x5a, 0x3a]] as const;
  VINE_IMAGES.forEach((id, i) => { if (!map.hasImage(id)) map.addImage(id, vineImage(thirstTints[i]!)); });
  if (!map.hasImage(NET_IMAGE)) map.addImage(NET_IMAGE, netImage());
  if (!map.hasImage(HEDGE_IMAGE)) map.addImage(HEDGE_IMAGE, hedgeImage());
  map.addLayer({ id: "sim-vine", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "zone"], paint: { "fill-pattern": ["get", "pattern"], "fill-opacity": 0.92, "fill-antialias": false } }, before);
  // The veils over the zones, without seams between their row strips.
  map.addLayer({ id: "sim-tint", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "tint"], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"], "fill-antialias": false } }, before);
  map.addLayer({ id: "sim-net", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "cloth"], paint: { "fill-pattern": NET_IMAGE, "fill-opacity": 0.9, "fill-antialias": false } }, before);
  // The lawn: mowing stripes and blades of grass, without the hairlines between its row strips.
  if (!map.hasImage(LAWN_IMAGE)) map.addImage(LAWN_IMAGE, lawnImage());
  map.addLayer({ id: "sim-lawn", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "lawn"], paint: { "fill-pattern": LAWN_IMAGE, "fill-opacity": 0.95, "fill-antialias": false } }, before);
  // The pergolas seen from above: slats with light between them, and a wooden frame.
  if (!map.hasImage(SLATS_IMAGE)) map.addImage(SLATS_IMAGE, slatsImage());
  map.addLayer({ id: "sim-pergola", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shade"], paint: { "fill-pattern": SLATS_IMAGE, "fill-opacity": 0.95 } }, before);
  map.addLayer({ id: "sim-pergola-frame", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shade"], paint: { "line-color": PERGOLA_COLORS.beam, "line-width": 1.5 } }, before);
  // Drip lines: a blue pipe with light drippers along it (round dots); the windbreak: a hedge of bushes.
  map.addLayer({ id: "sim-drip-pipe", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "drip"], paint: { "line-color": "#0369a1", "line-width": 1.6 } }, before);
  map.addLayer({ id: "sim-drip-dots", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "drip"], paint: { "line-color": "#bae6fd", "line-width": 4, "line-dasharray": [0, 2.4] }, layout: { "line-cap": "round" } }, before);
  map.addLayer({ id: "sim-hedge", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "wind"], paint: { "line-pattern": HEDGE_IMAGE, "line-width": ["get", "width"] }, layout: { "line-cap": "round", "line-join": "round" } }, before);
  map.addLayer({ id: "sim-line", type: "line", source: SIM_SOURCE, filter: ["all", ["==", ["geometry-type"], "LineString"], ["!=", ["get", "kind"], "drip"], ["!=", ["get", "kind"], "wind"]], paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-dasharray": ["case", ["==", ["get", "kind"], "drip"], ["literal", [2, 1.5]], ["==", ["get", "kind"], "zoneline"], ["literal", [2.5, 1.5]], ["literal", [1, 0]]] }, layout: { "line-cap": "round" } }, before);
  if (raised) {
    map.addSource(SIM_TREES_3D, { type: "geojson", data: fc([]) });
    map.addLayer({ id: "sim-trees-3d", type: "fill-extrusion", source: SIM_TREES_3D, paint: { "fill-extrusion-color": ["get", "color"], "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "height"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": true } });
  } else {
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
  set("sim-pergola-frame", "line-opacity", k);
  set("sim-line", "line-opacity", k);
  set("sim-vine", "fill-opacity", 0.92 * k);
  set("sim-tint", "fill-opacity", ["*", ["get", "opacity"], k]);
  set("sim-net", "fill-opacity", 0.9 * k);
  set("sim-drip-pipe", "line-opacity", k);
  set("sim-drip-dots", "line-opacity", k);
  set("sim-hedge", "line-opacity", k);
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

/** A handle to move by hand: a tree (green dot) or a labelled pill (Prato, Ombra, Frangivento). */
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

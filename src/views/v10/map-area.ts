import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { Ring } from "@/models/place-area";
import { PERGOLA_COLORS, pergolaParts, TREE_RADIUS_M, treeParts, type PiazzaLayout, type VineLayout } from "@/models/area-layout";

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

export type SimLayout = { kind: "piazza"; data: PiazzaLayout } | { kind: "vigneto"; data: VineLayout; thirst: number[] };
export const SIM_SOURCE = "sim-layout";
export const SIM_TREES_3D = "sim-trees-3d";

/** The vines' thirst as the zone's colour: green, amber, red (the same steps as the arc's verdict). */
export const thirstColor = (s: number) => (s >= 65 ? "#ef4444" : s >= 35 ? "#eab308" : "#22c55e");
export const SIM_COLORS = { lawn: "#4caf50", shade: PERGOLA_COLORS.slat, cloth: "#334155", drip: "#38bdf8", wind: "#15803d", tree: "#2e7d32" } as const;
/** The 2D pattern of a pergola seen from above: wooden slats with light between them. */
export const SLATS_IMAGE = "pergola-slats";

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
    for (const p of sim.data.patches) out.push(poly(p.ring, p.kind === "zone"
      ? { kind: "zone", color: thirstColor(sim.thirst[p.zone ?? 0] ?? 0), opacity: 0.22 }
      : { kind: "cloth", color: SIM_COLORS.cloth, opacity: 0.55 }));
    for (const l of sim.data.lines) out.push(lineF(l.line, l.kind === "drip"
      ? { kind: "drip", color: SIM_COLORS.drip, width: 2 }
      : { kind: "wind", color: SIM_COLORS.wind, width: 3 + (l.strength ?? 0) / 14 }));
  }
  return fc(out);
}

/** What stands up in 3D: each tree (trunk and pointed crown) and a wooden pergola over each shade strip. */
export const treeCrowns = (sim: SimLayout | null) => fc(sim?.kind === "piazza"
  ? [
      ...sim.data.trees.flatMap((t) => treeParts(t)),
      ...sim.data.patches.filter((p) => p.kind === "shade").flatMap((p) => pergolaParts(p.ring)),
    ].map((p) => poly(p.ring, { kind: "raised", base: p.base, height: p.height, color: p.color }))
  : []);

/** The slats image for the 2D pergolas: light wood strips with darker gaps, repeated over the shade. */
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
  map.addLayer({ id: "sim-fill", type: "fill", source: SIM_SOURCE, filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "kind"], "shade"]], paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } }, before);
  // The pergolas seen from above: slats with light between them, and a wooden frame.
  if (!map.hasImage(SLATS_IMAGE)) map.addImage(SLATS_IMAGE, slatsImage());
  map.addLayer({ id: "sim-pergola", type: "fill", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shade"], paint: { "fill-pattern": SLATS_IMAGE, "fill-opacity": 0.95 } }, before);
  map.addLayer({ id: "sim-pergola-frame", type: "line", source: SIM_SOURCE, filter: ["==", ["get", "kind"], "shade"], paint: { "line-color": PERGOLA_COLORS.beam, "line-width": 1.5 } }, before);
  map.addLayer({ id: "sim-line", type: "line", source: SIM_SOURCE, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-dasharray": ["case", ["==", ["get", "kind"], "drip"], ["literal", [2, 1.5]], ["literal", [1, 0]]] }, layout: { "line-cap": "round" } }, before);
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

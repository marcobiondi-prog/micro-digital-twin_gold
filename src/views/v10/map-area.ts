import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { Ring } from "@/models/place-area";

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

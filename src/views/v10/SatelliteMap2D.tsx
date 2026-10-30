import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import type { Ring } from "@/models/place-area";
import { MAX_PINS } from "@/models/drawn-area";
import { addAreaLayers, addSimLayers, handleElement, ringCentre, tagElement, zoneTag, pinElement, setAreaData, setOutlineData, setSimData, setSimGhost, type SimLayout } from "@/views/v10/map-area";
import { ringContains } from "@/models/place-area";
import type { LatLng } from "@/models/area-layout";

/** Something moved by hand on the map: a tree (its index) or the lawn's, the shade's or the windbreak's handle. */
export type MovedPart = { part: "tree"; index: number; at: LatLng } | { part: "lawn" | "shade" | "wind"; at: LatLng };
import { Crosshair, LoaderCircle } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

/**
 * 2D view: open satellite imagery with place names over it and a pin on the place, no key needed. One finger moves
 * it, two fingers zoom and turn it, with no "use two fingers" lock ([data-map-gestures] keeps its own gestures).
 * It shows the area drawn for the place and, while `drawing`, takes a tap as a new pin and lets each pin be dragged,
 * the rest of the simulation faded behind.
 */
const ARCGIS = "https://server.arcgisonline.com/ArcGIS/rest/services";
const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    imagery: { type: "raster", tiles: [`${ARCGIS}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: "Immagini © Esri, Maxar, Earthstar Geographics" },
    places: { type: "raster", tiles: [`${ARCGIS}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "places", type: "raster", source: "places" },
  ],
};

type Camera = { center: [number, number]; zoom: number; bearing: number };

export function SatelliteMap2D({ lat, lng, label, zoom, area = [], drawing = false, onAreaChange, sim = null, arranging = false, onMove, outline = null, onOutside }: {
  lat: number; lng: number; label: string; zoom: number; area?: Ring; drawing?: boolean; onAreaChange?: (ring: Ring) => void;
  /** Drawing a zone inside the big area: its outline, shown still, and taps outside it refused (onOutside). */
  outline?: Ring | null; onOutside?: () => void;
  /** The simulation drawn inside the area; while `arranging` its trees and handles can be dragged (onMove). */
  sim?: SimLayout | null; arranging?: boolean; onMove?: (moved: MovedPart) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const pins = useRef<Marker[]>([]);
  const handles = useRef<Marker[]>([]);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  // The latest pins, mode and callback for the map's own handlers.
  const live = useRef({ area, drawing, onAreaChange, outline, onOutside });
  live.current = { area, drawing, onAreaChange, outline, onOutside };
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const camera: Camera = { center: [lng, lat], zoom, bearing: 0 };
  useEffect(() => {
    let cancelled = false, remove: (() => void) | undefined;
    setState("loading");
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !host.current) return;
      const map = new maplibregl.Map({ container: host.current, style: STYLE, ...camera, maxZoom: 19, pitchWithRotate: false, cooperativeGestures: false, attributionControl: { compact: true } });
      map.touchPitch.disable();
      libRef.current = maplibregl;
      map.on("load", () => { addAreaLayers(map); addSimLayers(map, lat); if (!cancelled) setState("ready"); });
      // Drawing: a tap on the map is a new pin at that spot.
      map.on("click", (e) => {
        const { area: ring, drawing: on, onAreaChange: set, outline: big, onOutside: out } = live.current;
        if (!on || !set || ring.length >= MAX_PINS) return;
        // A zone stays inside the big area.
        if (big && big.length >= 3 && !ringContains(big, e.lngLat.lat, e.lngLat.lng)) { out?.(); return; }
        set([...ring, [e.lngLat.lat, e.lngLat.lng]]);
      });
      // A tile that does not arrive leaves a gap, not an error: the map stays usable.
      new maplibregl.Marker({ color: "#0b0f15" }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 24 }).setText(label)).addTo(map);
      mapRef.current = map;
      remove = () => map.remove();
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; mapRef.current = null; pins.current = []; handles.current = []; remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, zoom, label]);
  // The area and its pins follow the props: numbered pins that can be dragged while drawing, small dots otherwise.
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current;
    if (state !== "ready" || !map || !lib) return;
    setAreaData(map, area, !drawing || area.length >= 3);
    setOutlineData(map, drawing ? outline : null);
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    pins.current.forEach((m) => m.remove());
    pins.current = area.map(([pLat, pLng], i) => {
      const m = new lib.Marker({ element: pinElement(i + 1, drawing), draggable: drawing }).setLngLat([pLng, pLat]).addTo(map);
      m.on("drag", () => { const p = m.getLngLat(), next = live.current.area.map((q, j): [number, number] => (j === i ? [p.lat, p.lng] : q)); setAreaData(map, next, next.length >= 3); });
      m.on("dragend", () => { const p = m.getLngLat(); live.current.onAreaChange?.(live.current.area.map((q, j): [number, number] => (j === i ? [p.lat, p.lng] : q))); });
      return m;
    });
  }, [area, drawing, state, outline]);
  // The simulation inside the area (hidden while drawing), and while arranging a handle on each tree and on the lawn,
  // the shade or the windbreak, to drag them by hand.
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current;
    if (state !== "ready" || !map || !lib) return;
    // Drawing or editing: the rest stays visible, faded behind the pins.
    setSimData(map, sim);
    setSimGhost(map, drawing);
    handles.current.forEach((m) => m.remove());
    handles.current = [];
    // The vineyard's zone names on their zones, and every inner zone's name ("Libera", "Lotto A", "Alberi"…).
    if (sim?.kind === "vigneto" && !drawing) sim.data.zones.forEach((z, i) => handles.current.push(new lib.Marker({ element: tagElement(`Zona ${i + 1}`) }).setLngLat([z[1], z[0]]).addTo(map)));
    if (sim && !drawing) for (const z of sim.inner ?? []) { if (z.ring.length < 3) continue; const c = ringCentre(z.ring); handles.current.push(new lib.Marker({ element: tagElement(zoneTag(z)) }).setLngLat([c[1], c[0]]).addTo(map)); }
    if (!arranging || drawing || !sim) return;
    const add = (at: LatLng, label: string | null, done: (to: LatLng) => void) => {
      const m = new lib.Marker({ element: handleElement(label), draggable: true }).setLngLat([at[1], at[0]]).addTo(map);
      m.on("dragend", () => { const p = m.getLngLat(); done([p.lat, p.lng]); });
      handles.current.push(m);
    };
    if (sim.kind === "piazza") {
      sim.data.trees.forEach((t, index) => add(t, null, (to) => moveRef.current?.({ part: "tree", index, at: to })));
      if (sim.data.patches.some((p) => p.kind === "lawn")) add(sim.data.lawnAt, "Prato", (to) => moveRef.current?.({ part: "lawn", at: to }));
      if (sim.data.patches.some((p) => p.kind === "shade")) add(sim.data.shadeAt, "Ombra", (to) => moveRef.current?.({ part: "shade", at: to }));
    } else if (sim.data.lines.some((l) => l.kind === "wind")) {
      add(sim.data.windAt, "Frangivento", (to) => moveRef.current?.({ part: "wind", at: to }));
    }
  }, [sim, arranging, drawing, state]);
  const recenter = () => mapRef.current?.easeTo({ ...camera, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800 });
  return (
    <div data-map-gestures="" className="relative h-full w-full touch-none overflow-hidden bg-card">
      <div ref={host} className="h-full w-full" role="img" aria-label={`Mappa di ${label}`} />
      {state === "ready" && <button type="button" onClick={recenter} aria-label="Ricentra la mappa sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
      {state === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Caricamento mappa" /></div>}
      {state === "error" && <p role="status" className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">Mappa non disponibile in questo momento.</p>}
    </div>
  );
}

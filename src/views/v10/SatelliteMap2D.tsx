import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import type { Ring } from "@/models/place-area";
import { MAX_PINS } from "@/models/drawn-area";
import { addAreaLayers, addSimLayers, handleElement, misterElement, placePinElement, ringCentre, tagElement, zoneTag, pinElement, setAreaData, setOutlineData, setSimData, setBedData, setSimGhost, type SimLayout } from "@/views/v10/map-area";
import { ringContains } from "@/models/place-area";
import type { LatLng } from "@/models/area-layout";

/** Something moved by hand on the map: a tree (its index) or the lawn's, the shade's or the windbreak's handle. */
export type MovedPart = { part: "tree"; index: number; at: LatLng } | { part: "lawn" | "shade" | "wind"; at: LatLng } | { part: "zones"; ids: string[]; from: LatLng; at: LatLng };
import { Crosshair, LoaderCircle } from "lucide-react";
import { isKeyRejected, loadGoogleMaps, onKeyRejected } from "@/lib/google-maps-js";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

/**
 * 2D view: open satellite imagery with place names over it and a pin on the place, no key needed. One finger moves
 * it, two fingers zoom and turn it, with no "use two fingers" lock ([data-map-gestures] keeps its own gestures).
 * It shows the area drawn for the place and, while `drawing`, takes a tap as a new pin and lets each pin be dragged,
 * the rest of the simulation faded behind.
 */
const ARCGIS = "https://server.arcgisonline.com/ArcGIS/rest/services";
/** Google's satellite zoom the 2D map goes to at most (its imagery's closest level in most towns); closer, it is enlarged. */
const GOOGLE_MAX = 21;
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
type GMap = { moveCamera: (c: { center?: { lat: number; lng: number }; zoom?: number }) => void };
/** Google's service saying how close its satellite photos go at a spot (often 19–20 outside town centres). */
type MaxZoom = { getMaxZoomAtLatLng: (at: { lat: number; lng: number }) => Promise<{ zoom?: number }> };
/** Until the service answers: a closeness Google has nearly everywhere, so the map never opens on its grey "no imagery" tiles. */
const GOOGLE_SAFE = 19;

export function SatelliteMap2D({ apiKey, lat, lng, label, zoom, area = [], drawing = false, onAreaChange, sim = null, arranging = false, onMove, outline = null, onOutside, onPinMove, still = false }: {
  /** The browser key: with it the 2D map uses Google's satellite imagery, like the 3D view. */
  apiKey?: string | undefined;
  lat: number; lng: number; label: string; zoom: number; area?: Ring; drawing?: boolean; onAreaChange?: (ring: Ring) => void;
  /** The place's pin can be dragged to the right spot (not while drawing): where it was let go. */
  onPinMove?: ((lat: number, lng: number) => void) | undefined;
  /** Drawing a zone inside the big area: its outline, shown still, and taps outside it refused (onOutside). */
  outline?: Ring | null; onOutside?: () => void;
  /** The simulation drawn inside the area; while `arranging` its trees and handles can be dragged (onMove). */
  sim?: SimLayout | null; arranging?: boolean; onMove?: (moved: MovedPart) => void;
  /** A still preview: framed on the drawn area, without its corner pins nor the recenter button. */
  still?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const pins = useRef<Marker[]>([]);
  const handles = useRef<Marker[]>([]);
  const moveRef = useRef(onMove);
  // The simulation as last drawn, so a zoom can lay the aiuole again at a fixed width on screen.
  const simNow = useRef(sim);
  simNow.current = sim;
  moveRef.current = onMove;
  const pinMoveRef = useRef(onPinMove);
  pinMoveRef.current = onPinMove;
  const placePin = useRef<Marker | null>(null);
  // Set while the pin is let go by hand, so the map does not jump to it.
  const draggedTo = useRef<string | null>(null);
  // The latest pins, mode and callback for the map's own handlers.
  const live = useRef({ area, drawing, onAreaChange, outline, onOutside });
  live.current = { area, drawing, onAreaChange, outline, onOutside };
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [googleOn, setGoogleOn] = useState(false);
  const camera: Camera = { center: [lng, lat], zoom, bearing: 0 };
  useEffect(() => {
    let cancelled = false, remove: (() => void) | undefined, offKey: (() => void) | undefined;
    setState("loading");
    // With the browser key the base is Google's own map (satellite with names, the same imagery as the 3D view), drawn
    // under a see-through maplibre that keeps the area, the zones and the simulation and leads the camera; without
    // it, or with the key refused, the open imagery of the style.
    const google = apiKey && !isKeyRejected()
      ? loadGoogleMaps(apiKey).then((g) => g.maps.importLibrary("maps") as Promise<{ Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap; MaxZoomService?: new () => MaxZoom }>).catch(() => null)
      : Promise.resolve(null);
    void Promise.all([import("maplibre-gl"), google]).then(([{ default: maplibregl }, gmaps]) => {
      if (cancelled || !host.current) return;
      const base = gmaps && under.current ? new gmaps.Map(under.current, {
        center: { lat, lng }, zoom: Math.min(zoom + 1, GOOGLE_SAFE), mapTypeId: "hybrid", disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false,
        clickableIcons: false, isFractionalZoomEnabled: true, tilt: 0, backgroundColor: "#1d2129",
      }) : null;
      setGoogleOn(!!base);
      const map = new maplibregl.Map({ container: host.current, style: STYLE, ...camera, maxZoom: base ? 23 : 22, pitchWithRotate: false, cooperativeGestures: false, attributionControl: false });
      map.touchPitch.disable();
      if (base) {
        // Google's satellite map does not turn: the map moves and zooms only, and Google's camera follows every frame
        // (its zoom is one more: its tiles are 256 px, maplibre's 512).
        map.dragRotate.disable(); map.touchZoomRotate.disableRotation();
        // Past Google's own closest imagery (GOOGLE_MAX) its map stays there and is enlarged on screen around the centre,
        // so one can zoom in further and the drawing stays on the photo.
        // Where Google's photos stop sooner (outside town centres) its own grey "no imagery" tiles came up and the map
        // read empty: the closest zoom with photos at the place is asked once and Google never goes past it.
        const el = under.current!;
        let cap = GOOGLE_SAFE;
        const Svc = gmaps?.MaxZoomService;
        if (Svc) void new Svc().getMaxZoomAtLatLng({ lat, lng }).then((r) => { if (r.zoom && !cancelled) { cap = Math.min(GOOGLE_MAX, r.zoom); follow(); } }, () => undefined);
        const follow = () => {
          const c = map.getCenter(), z = map.getZoom() + 1, gz = Math.min(z, cap);
          base.moveCamera({ center: { lat: c.lat, lng: c.lng }, zoom: gz });
          const k = 2 ** (z - gz);
          el.style.transform = k > 1.001 ? `scale(${k})` : "";
        };
        map.on("move", follow);
        follow();
        const hideOpen = () => { for (const l of ["imagery", "places"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", "none"); };
        map.on("load", hideOpen);
        // A key refused for this address: back to the open imagery.
        offKey = onKeyRejected(() => { setGoogleOn(false); for (const l of ["imagery", "places"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", "visible"); });
      }
      libRef.current = maplibregl;
      map.on("load", () => { addAreaLayers(map); addSimLayers(map, lat); if (!cancelled) setState("ready"); });
      // The aiuole keep their stripes the same size on screen: laid again for the new zoom once it settles.
      // …and during the zoom too, so the grass never swells under the fingers.
      // Once per frame at most: only the aiuole's own light source is laid again.
      let frame = 0;
      const relay = () => { if (frame) return; frame = requestAnimationFrame(() => { frame = 0; try { setBedData(map, simNow.current); } catch { /* the map was removed */ } }); };
      map.on("zoom", relay);
      map.on("zoomend", relay);
      // Drawing: a tap on the map is a new pin at that spot.
      map.on("click", (e) => {
        const { area: ring, drawing: on, onAreaChange: set, outline: big, onOutside: out } = live.current;
        if (!on || !set || ring.length >= MAX_PINS) return;
        // A zone stays inside the big area.
        if (big && big.length >= 3 && !ringContains(big, e.lngLat.lat, e.lngLat.lng)) { out?.(); return; }
        set([...ring, [e.lngLat.lat, e.lngLat.lng]]);
      });
      // A tile that does not arrive leaves a gap, not an error: the map stays usable.
      const pinMarker = new maplibregl.Marker({ element: placePinElement(), anchor: "bottom", draggable: !!pinMoveRef.current && !live.current.drawing }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 38 }).setText(label)).addTo(map);
      pinMarker.on("dragend", () => { const p = pinMarker.getLngLat(); draggedTo.current = `${p.lat},${p.lng}`; pinMoveRef.current?.(p.lat, p.lng); });
      placePin.current = pinMarker;
      mapRef.current = map;
      remove = () => { offKey?.(); map.remove(); };
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; mapRef.current = null; placePin.current = null; pins.current = []; handles.current = []; remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, label]);
  // The pin follows its place (the square's centre arriving, a pin moved by hand) without rebuilding the map; the map
  // centres on it unless the hand just put it there.
  useEffect(() => {
    placePin.current?.setLngLat([lng, lat]);
    if (draggedTo.current === `${lat},${lng}`) { draggedTo.current = null; return; }
    mapRef.current?.jumpTo({ center: [lng, lat] });
  }, [lat, lng]);
  // The pin can be dragged only outside drawing.
  useEffect(() => { placePin.current?.setDraggable(!!onPinMove && !drawing); }, [drawing, onPinMove, state]);
  // The area and its pins follow the props: numbered pins that can be dragged while drawing, small dots otherwise.
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current;
    if (state !== "ready" || !map || !lib) return;
    setAreaData(map, area, !drawing || area.length >= 3);
    setOutlineData(map, drawing ? outline : null);
    map.getCanvas().style.cursor = drawing ? "crosshair" : "";
    pins.current.forEach((m) => m.remove());
    pins.current = (still ? [] : area).map(([pLat, pLng], i) => {
      const m = new lib.Marker({ element: pinElement(i + 1, drawing), draggable: drawing }).setLngLat([pLng, pLat]).addTo(map);
      m.on("drag", () => { const p = m.getLngLat(), next = live.current.area.map((q, j): [number, number] => (j === i ? [p.lat, p.lng] : q)); setAreaData(map, next, next.length >= 3); });
      m.on("dragend", () => { const p = m.getLngLat(); live.current.onAreaChange?.(live.current.area.map((q, j): [number, number] => (j === i ? [p.lat, p.lng] : q))); });
      return m;
    });
  }, [area, drawing, state, outline, still]);
  // The still preview frames the drawn area (or stays on the place without one).
  useEffect(() => {
    const map = mapRef.current;
    if (!still || state !== "ready" || !map || area.length < 3) return;
    const la = area.map((p) => p[0]), ln = area.map((p) => p[1]);
    map.fitBounds([[Math.min(...ln), Math.min(...la)], [Math.max(...ln), Math.max(...la)]], { padding: { top: 48, bottom: 44, left: 24, right: 24 }, maxZoom: 20, duration: 0 });
  }, [still, state, area]);
  // The full map opens framed on the drawn area with room around it (about half the box's width, a quarter of a side
  // left free all round), so the area and what lies beside it show together; the recenter button comes back to it.
  const frameArea = (duration: number) => {
    const map = mapRef.current, box = host.current;
    if (!map || !box || area.length < 3) return false;
    const la = area.map((p) => p[0]), ln = area.map((p) => p[1]);
    const w = box.clientWidth, h = box.clientHeight;
    map.fitBounds([[Math.min(...ln), Math.min(...la)], [Math.max(...ln), Math.max(...la)]], { padding: { top: Math.round(h * 0.24), bottom: Math.round(h * 0.2), left: Math.round(w * 0.26), right: Math.round(w * 0.26) }, maxZoom: 20, duration });
    return true;
  };
  const framed = useRef(false);
  useEffect(() => {
    if (still || drawing || state !== "ready" || framed.current) return;
    if (frameArea(0)) framed.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, drawing, state, area.length >= 3]);
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
    // Every misting pole numbered, in the zones drawn for them first (solid) then those the app placed (white).
    if (sim?.kind === "piazza" && !drawing) sim.data.misters.forEach((m, i) => handles.current.push(new lib.Marker({ element: misterElement(i + 1, i < sim.data.mistersInZones) }).setLngLat([m[1], m[0]]).addTo(map)));
    if (sim && !drawing && !arranging) for (const z of sim.inner ?? []) { if (z.ring.length < 3) continue; const c = ringCentre(z.ring); handles.current.push(new lib.Marker({ element: tagElement(zoneTag(z)) }).setLngLat([c[1], c[0]]).addTo(map)); }
    if (!arranging || drawing || !sim) return;
    const add = (at: LatLng, label: string | null, done: (to: LatLng) => void) => {
      const m = new lib.Marker({ element: handleElement(label), draggable: true }).setLngLat([at[1], at[0]]).addTo(map);
      m.on("dragend", () => { const p = m.getLngLat(); done([p.lat, p.lng]); });
      handles.current.push(m);
    };
    // The zones drawn by hand move as a group, with all they hold: a handle on each, and one for all of them together.
    const inner = (sim.inner ?? []).filter((z) => z.ring.length >= 3);
    for (const z of inner) { const c = ringCentre(z.ring); add(c, `✥ ${zoneTag(z)}`, (to) => moveRef.current?.({ part: "zones", ids: [z.id], from: c, at: to })); }
    if (inner.length >= 2) {
      const all = ringCentre(inner.flatMap((z) => z.ring));
      add(all, "✥ Tutte le zone", (to) => moveRef.current?.({ part: "zones", ids: inner.map((z) => z.id), from: all, at: to }));
    }
    if (sim.kind === "piazza") {
      sim.data.trees.forEach((t, index) => add(t, null, (to) => moveRef.current?.({ part: "tree", index, at: to })));
      if (sim.data.patches.some((p) => p.kind === "lawn")) add(sim.data.lawnAt, "Aiuole", (to) => moveRef.current?.({ part: "lawn", at: to }));
      if (sim.data.patches.some((p) => p.kind === "shade")) add(sim.data.shadeAt, "Ombra", (to) => moveRef.current?.({ part: "shade", at: to }));
    } else if (sim.data.lines.some((l) => l.kind === "wind")) {
      add(sim.data.windAt, "Frangivento", (to) => moveRef.current?.({ part: "wind", at: to }));
    }
  }, [sim, arranging, drawing, state]);
  const recenter = () => {
    const d = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800;
    if (!frameArea(d)) mapRef.current?.easeTo({ ...camera, duration: d });
  };
  return (
    <div data-map-gestures="" className="relative h-full w-full touch-none overflow-hidden bg-card">
      {/* Google's map under, maplibre (see-through) over it with everything drawn and the gestures. */}
      <div ref={under} className={`pointer-events-none absolute inset-0 ${googleOn ? "" : "invisible"}`} aria-hidden="true" />
      <div ref={host} className="relative h-full w-full" role="img" aria-label={`Mappa di ${label}`} />
      {state === "ready" && !still && <button type="button" onClick={recenter} aria-label="Ricentra la mappa sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
      {/* Google's tiles carry its name on the map, as in the 3D view. */}
      {state === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Caricamento mappa" /></div>}
      {state === "error" && <p role="status" className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-muted-foreground">Mappa non disponibile in questo momento.</p>}
    </div>
  );
}

import { exploringMap, FOCUS_AREA_EVENT } from "@/lib/gps-hold";
import { moveFind } from "@/models/field-finds";
import { useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import type { Ring } from "@/models/place-area";
import { MAX_PINS, initialRingAngle } from "@/models/drawn-area";
import { addAreaLayers, addSimLayers, addTrailLayers, animateSprinklers, setTrails, liftWhileDragged, findElement, handleElement, personElement, rotateHandleElement, misterElement, placePinElement, ringCentre, tagElement, zoneTag, pinElement, setAreaData, setOutlineData, setSimData, setBedData, setSimGhost, type SimLayout, MAP_LOCALE } from "@/views/v10/map-area";
import { ringContains } from "@/models/place-area";
import type { LatLng } from "@/models/area-layout";

/** Something moved by hand on the map: a tree (its index) or the lawn's, the shade's or the windbreak's handle. */
export type MovedPart = { part: "tree"; index: number; at: LatLng } | { part: "lawn" | "shade" | "wind"; at: LatLng } | { part: "zones"; ids: string[]; from: LatLng; at: LatLng }
  | { part: "lawnAngle" | "shadeAngle"; angle: number } | { part: "zoneAngle"; id: string; angle: number };
import { Crosshair, LoaderCircle, Navigation2 } from "lucide-react";
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
type GMap = { moveCamera: (c: { center?: { lat: number; lng: number }; zoom?: number }) => void; addListener?: (event: string, f: () => void) => unknown };
/** Google's service saying how close its satellite photos go at a spot (often 19–20 outside town centres). */
type MaxZoom = { getMaxZoomAtLatLng: (at: { lat: number; lng: number }) => Promise<{ zoom?: number }> };
/** Until the service answers: a closeness Google has nearly everywhere, so the map never opens on its grey "no imagery" tiles. */
const GOOGLE_SAFE = 19;

export function SatelliteMap2D({ apiKey, lat, lng, label, zoom, area = [], drawing = false, onAreaChange, sim = null, arranging = false, onMove, outline = null, onOutside, onPinMove, still = false, proposal = false, people = [], trails = [], follow = false }: {
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
  proposal?: boolean; still?: boolean;
  /** Progetti condivisi: colleagues connected now, shown where they stand (their GPS) as named dots. */
  people?: Array<{ id: string; name: string; avatar: string | null; lat: number; lng: number; note?: string; away?: boolean }>;
  /** The map follows the phone's GPS (the pin is the live fix): it opens on the pin, not framed on the area. */
  follow?: boolean;
  /** The colleagues' drags now (shared project), each a path of [lng, lat]: drawn as fading trails. */
  trails?: Array<Array<[number, number]>>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const pins = useRef<Marker[]>([]);
  const handles = useRef<Marker[]>([]);
  const peopleMarks = useRef(new Map<string, Marker>());
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
  // The trails: the one behind what is dragged here, and the colleagues' ones (trails prop), drawn together.
  const myTrail = useRef<Array<[number, number]> | null>(null);
  const otherTrails = useRef(trails); otherTrails.current = trails;
  const paintTrails = () => { const map = mapRef.current; if (map?.getSource("drag-trails")) setTrails(map, [...(myTrail.current ? [myTrail.current] : []), ...otherTrails.current]); };
  const trailOf = (path: Array<[number, number]> | null) => { myTrail.current = path ? [...path] : null; paintTrails(); };
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // Riprova on the error: the map built again.
  const [attempt, setAttempt] = useState(0);
  const [googleOn, setGoogleOn] = useState(false);
  // The map turned away from north (Google's own credits are then outside the box: said in a corner instead).
  const [turnedOn, setTurnedOn] = useState(false);
  const [bearingNow, setBearingNow] = useState(0);
  const camera: Camera = { center: [lng, lat], zoom, bearing: 0 };
  useEffect(() => {
    let cancelled = false, remove: (() => void) | undefined, offKey: (() => void) | undefined;
    setState("loading");
    setTurnedOn(false);
    // With the browser key the base is Google's own map (satellite with names, the same imagery as the 3D view), drawn
    // under a see-through maplibre that keeps the area, the zones and the simulation and leads the camera; without
    // it, or with the key refused, the open imagery of the style.
    const google = apiKey && !isKeyRejected()
      ? loadGoogleMaps(apiKey).then((g) => g.maps.importLibrary("maps") as Promise<{ Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap; MaxZoomService?: new () => MaxZoom }>).catch(() => null)
      : Promise.resolve(null);
    void Promise.all([import("maplibre-gl"), google]).then(([{ default: maplibregl }, gmaps]) => {
      if (cancelled || !host.current) return;
      // While the map is turned, Google's layer is a square as wide as the box's diagonal, centred on it, so it can be
      // turned with the map (Google's satellite map does not turn by itself) and still cover every corner; with the map
      // facing north it is the box itself, so Google's logo and credits stay in its corners.
      let turned = false;
      const sizeUnder = () => {
        const el = under.current, h0 = host.current;
        if (!el || !h0) return;
        const w = h0.clientWidth, h = h0.clientHeight, d = turned ? Math.ceil(Math.hypot(w, h)) : 0;
        Object.assign(el.style, turned
          ? { width: `${d}px`, height: `${d}px`, left: `${(w - d) / 2}px`, top: `${(h - d) / 2}px` }
          : { width: "100%", height: "100%", left: "0px", top: "0px" });
      };
      sizeUnder();
      // Google's base failing to build is no reason for no map: the open imagery stays under the drawing.
      let base: GMap | null = null;
      try {
        base = gmaps && under.current ? new gmaps.Map(under.current, {
          center: { lat, lng }, zoom: Math.min(zoom + 1, GOOGLE_SAFE), mapTypeId: "hybrid", disableDefaultUI: true, gestureHandling: "none", keyboardShortcuts: false,
          clickableIcons: false, isFractionalZoomEnabled: true, tilt: 0, backgroundColor: "#1d2129",
        }) : null;
      } catch (error) { console.warn("Google base map not built", error); base = null; }
      setGoogleOn(!!base);
      const map = new maplibregl.Map({ container: host.current, style: STYLE, locale: MAP_LOCALE, ...camera, maxZoom: base ? 23 : 22, pitchWithRotate: false, cooperativeGestures: false, attributionControl: false });
      map.touchPitch.disable();
      if (base) {
        // Google's camera follows every frame (its zoom is one more: its tiles are 256 px, maplibre's 512). Its satellite
        // map does not turn, so the map turns with two fingers (or right-drag) like the 3D and Google's layer is turned
        // on screen by the same angle round the box's centre, the very point both maps are centred on.
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
          const k = 2 ** (z - gz), b = map.getBearing();
          const t = Math.abs(b) > 0.01;
          if (t !== turned) { turned = t; sizeUnder(); setTurnedOn(t); }
          if (t) setBearingNow(Math.round(b));
          el.style.transform = `${Math.abs(b) > 0.01 ? `rotate(${-b}deg) ` : ""}${k > 1.001 ? `scale(${k})` : ""}`.trim();
        };
        map.on("move", follow);
        map.on("resize", () => { sizeUnder(); follow(); });
        follow();
        // The open imagery stays on until Google's own photos have actually arrived (its first "tilesloaded"): a Google map
        // that draws nothing (a refused service, a blocked request, a place without photos) no longer leaves the map empty.
        let googleTiles = false, styleLoaded = false;
        const hideOpen = () => { if (!googleTiles || !styleLoaded) return; for (const l of ["imagery", "places"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", "none"); };
        map.on("load", () => { styleLoaded = true; hideOpen(); });
        base.addListener?.("tilesloaded", () => { googleTiles = true; hideOpen(); });
        // A key refused for this address: back to the open imagery.
        offKey = onKeyRejected(() => { setGoogleOn(false); for (const l of ["imagery", "places"]) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", "visible"); });
      }
      libRef.current = maplibregl;
      // A drag, pinch, turn or wheel by hand (an originalEvent; not the map's own easing to the GPS) means exploring.
      map.on("movestart", (e: { originalEvent?: unknown }) => { if (e.originalEvent && !still) exploringMap(); });
      map.on("load", () => { addAreaLayers(map); addSimLayers(map, lat); addTrailLayers(map); const stopSpr = animateSprinklers(map); map.once("remove", stopSpr); if (!cancelled) setState("ready"); });
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
      liftWhileDragged(pinMarker, "il pin del luogo", trailOf);
      pinMarker.on("dragend", () => {
        const p = pinMarker.getLngLat();
        draggedTo.current = `${p.lat},${p.lng}`;
        pinMoveRef.current?.(p.lat, p.lng);
      });
      placePin.current = pinMarker;
      mapRef.current = map;
      // Dev-only registry so demo scripts can drive the map (wide shot, zoom to the area); never in production builds.
      if (import.meta.env.DEV) {
        const w = window as unknown as { __mdtMaps?: unknown[] };
        (w.__mdtMaps ??= []).push(map);
      }
      remove = () => { offKey?.(); map.remove(); };
    }).catch((error: unknown) => {
      console.error("2D map failed", error);
      // Files of an older version (the app was updated while open): the page reloads once with the new ones.
      if (/dynamically imported module|Importing a module script failed/i.test(String((error as Error)?.message ?? error))) {
        try { if (Date.now() - Number(sessionStorage.getItem("mdt-map-reload") ?? 0) > 30_000) { sessionStorage.setItem("mdt-map-reload", String(Date.now())); window.location.reload(); return; } } catch { /* no storage */ }
      }
      if (!cancelled) setState("error");
    });
    return () => { cancelled = true; mapRef.current = null; placePin.current = null; pins.current = []; handles.current = []; remove?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, label, attempt]);
  // The pin follows its place (the square's centre arriving, a pin moved by hand) without rebuilding the map; the map
  // centres on it unless the hand just put it there.
  useEffect(() => {
    placePin.current?.setLngLat([lng, lat]);
    if (draggedTo.current === `${lat},${lng}`) { draggedTo.current = null; return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      mapRef.current?.jumpTo({ center: [lng, lat] });
    } else {
      mapRef.current?.easeTo({ center: [lng, lat], duration: 300 });
    }
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
      liftWhileDragged(m, `il punto ${i + 1} dell’area`, trailOf);
      m.on("drag", () => {
        const p = m.getLngLat();
        const next = live.current.area.map((q, j): [number, number] => (j === i ? [p.lat, p.lng] : q));
        setAreaData(map, next, next.length >= 3);
      });
      m.on("dragend", () => {
        const p = m.getLngLat();
        live.current.onAreaChange?.(live.current.area.map((q, j): [number, number] => (j === i ? [p.lat, p.lng] : q)));
      });
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
  // The colleagues connected now, each a named dot where their GPS puts them; moved, not rebuilt, as they walk.
  const peopleKey = people.map((p) => `${p.id}:${p.lat},${p.lng}:${p.name}`).join("|");
  useEffect(() => {
    const map = mapRef.current, lib = libRef.current;
    if (state !== "ready" || !map || !lib) return;
    const marks = peopleMarks.current, keep = new Set<string>();
    for (const p of people) {
      keep.add(p.id);
      const m = marks.get(p.id);
      if (m) m.setLngLat([p.lng, p.lat]);
      else marks.set(p.id, new lib.Marker({ element: personElement(p.name, p.avatar, p.note, p.away), anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
    }
    for (const [id, m] of marks) if (!keep.has(id)) { m.remove(); marks.delete(id); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, peopleKey]);
  useEffect(() => () => { peopleMarks.current.forEach((m) => m.remove()); peopleMarks.current.clear(); }, []);
  // A colleague changed the shared project: the map comes back to the area of intervention.
  useEffect(() => {
    if (still) return;
    const focus = () => { if (!live.current.drawing) frameArea(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 900); };
    window.addEventListener(FOCUS_AREA_EVENT, focus);
    return () => window.removeEventListener(FOCUS_AREA_EVENT, focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, area]);
  const trailsKey = trails.map((t) => t.length && t[t.length - 1]!.join(",")).join("|");
  useEffect(() => { if (state === "ready") paintTrails(); }, [state, trailsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const framed = useRef(false);
  useEffect(() => {
    if (still || drawing || state !== "ready" || framed.current) return;
    if (follow) { framed.current = true; mapRef.current?.jumpTo({ center: [lng, lat] }); return; }
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
    setSimGhost(map, drawing ? true : proposal ? 0.62 : false);
    handles.current.forEach((m) => m.remove());
    handles.current = [];
    // The vineyard's zone names on their zones, and every inner zone's name ("Libera", "Lotto A", "Alberi"…).
    if (sim?.kind === "vigneto" && !drawing) sim.data.zones.forEach((z, i) => handles.current.push(new lib.Marker({ element: tagElement(`Zona ${i + 1}`) }).setLngLat([z[1], z[0]]).addTo(map)));
    // Every misting pole numbered, in the zones drawn for them first (solid) then those the app placed (white).
    if (sim?.kind === "piazza" && !drawing) sim.data.misters.forEach((m, i) => handles.current.push(new lib.Marker({ element: misterElement(i + 1, i < sim.data.mistersInZones) }).setLngLat([m[1], m[0]]).addTo(map)));
    if (sim && !drawing && !arranging) for (const z of sim.inner ?? []) { if (z.ring.length < 3) continue; const c = ringCentre(z.ring); handles.current.push(new lib.Marker({ element: tagElement(zoneTag(z)) }).setLngLat([c[1], c[0]]).addTo(map)); }
    // The AI camera's finds, draggable to put their spot right.
    if (sim && !drawing) for (const f of sim.finds ?? []) {
      const m = new lib.Marker({ element: findElement(f), draggable: true }).setLngLat([f.lng, f.lat]).addTo(map);
      liftWhileDragged(m, "un rilevamento", trailOf);
      m.on("dragend", () => { const q = m.getLngLat(); moveFind(f.id, q.lat, q.lng); });
      handles.current.push(m);
    }
    if (!arranging || drawing || !sim) return;
    const add = (at: LatLng, label: string | null, done: (to: LatLng) => void) => {
      const m = new lib.Marker({ element: handleElement(label), draggable: true }).setLngLat([at[1], at[0]]).addTo(map);
      liftWhileDragged(m, label ? label.replace(/^✥\s*/, "") : "un albero", trailOf);
      m.on("dragend", () => { const p = m.getLngLat(); done([p.lat, p.lng]); });
      handles.current.push(m);
    };
    // Orientation is free, never automatic: beside each block and zone a turning handle, dragged round its centre,
    // sets its direction (radians, 0 = east, counter-clockwise) to wherever it is let go.
    const kLng = (la: number) => 111_195 * Math.cos((la * Math.PI) / 180);
    const reach = (c: LatLng, rings: LatLng[][]) => Math.max(4, ...rings.flat().map(([la, ln]) => Math.hypot((ln - c[1]) * kLng(c[0]), (la - c[0]) * 111_195))) + 1.5;
    const addRot = (c: LatLng, angle: number, r: number, label: string, done: (angle: number) => void) => {
      const at: LatLng = [c[0] + (Math.sin(angle) * r) / 111_195, c[1] + (Math.cos(angle) * r) / kLng(c[0])];
      const m = new lib.Marker({ element: rotateHandleElement(label), draggable: true }).setLngLat([at[1], at[0]]).addTo(map);
      liftWhileDragged(m, `l’orientamento di ${label.toLowerCase()}`, trailOf);
      m.on("dragend", () => { const p = m.getLngLat(); done(Math.atan2((p.lat - c[0]) * 111_195, (p.lng - c[1]) * kLng(c[0]))); });
      handles.current.push(m);
    };
    // The zones drawn by hand move as a group, with all they hold: a handle on each, and one for all of them together.
    const inner = (sim.inner ?? []).filter((z) => z.ring.length >= 3);
    for (const z of inner) {
      const c = ringCentre(z.ring);
      add(c, `✥ ${zoneTag(z)}`, (to) => moveRef.current?.({ part: "zones", ids: [z.id], from: c, at: to }));
      addRot(c, z.angle ?? initialRingAngle(z.ring), reach(c, [z.ring]), zoneTag(z), (angle) => moveRef.current?.({ part: "zoneAngle", id: z.id, angle }));
    }
    if (inner.length >= 2) {
      const all = ringCentre(inner.flatMap((z) => z.ring));
      add(all, "✥ Tutte le zone", (to) => moveRef.current?.({ part: "zones", ids: inner.map((z) => z.id), from: all, at: to }));
    }
    if (sim.kind === "piazza") {
      sim.data.trees.forEach((t, index) => add(t, null, (to) => moveRef.current?.({ part: "tree", index, at: to })));
      const free = (k: "lawn" | "shade") => sim.data.patches.filter((p) => p.kind === k && !p.exact);
      const lawn = free("lawn"), shade = free("shade");
      if (sim.data.patches.some((p) => p.kind === "lawn")) add(sim.data.lawnAt, "Aiuole", (to) => moveRef.current?.({ part: "lawn", at: to }));
      if (sim.data.patches.some((p) => p.kind === "shade")) add(sim.data.shadeAt, "Ombra", (to) => moveRef.current?.({ part: "shade", at: to }));
      if (lawn.length) addRot(sim.data.lawnAt, sim.data.lawnAngle ?? 0, reach(sim.data.lawnAt, lawn.map((p) => p.ring)), "Aiuole", (angle) => moveRef.current?.({ part: "lawnAngle", angle }));
      if (shade.length) addRot(sim.data.shadeAt, sim.data.shadeAngle ?? 0, reach(sim.data.shadeAt, shade.map((p) => p.ring)), "Ombra", (angle) => moveRef.current?.({ part: "shadeAngle", angle }));
    } else if (sim.data.lines.some((l) => l.kind === "wind")) {
      add(sim.data.windAt, "Frangivento", (to) => moveRef.current?.({ part: "wind", at: to }));
    }
  }, [sim, arranging, drawing, proposal, state]);
  const recenter = () => {
    const d = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 800;
    if (!frameArea(d)) mapRef.current?.easeTo({ ...camera, duration: d });
  };
  return (
    <div data-map-gestures="" className="relative h-full w-full touch-none overflow-hidden bg-card">
      {/* Google's map under, maplibre (see-through) over it with everything drawn and the gestures. */}
      <div ref={under} className={`pointer-events-none absolute left-0 top-0 h-full w-full ${googleOn ? "" : "invisible"}`} aria-hidden="true" />
      <div ref={host} className="relative h-full w-full" role="img" aria-label={`Mappa di ${label}`} />
      {state === "ready" && !still && <button type="button" onClick={recenter} aria-label="Ricentra la mappa sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
      {/* Turned away from north: a compass under the recenter button, its arrow pointing north, a tap turns the map back. */}
      {state === "ready" && !still && turnedOn && <button type="button" onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 400 })} aria-label="Riporta la mappa con il nord in alto" title="Nord in alto" className="absolute left-2 top-12 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Navigation2 className="size-4 fill-red-500 text-red-500" aria-hidden="true" style={{ transform: `rotate(${-bearingNow}deg)` }} /></button>}
      {/* Google's tiles carry its name on the map, as in the 3D view; turned, its corners leave the box, so it is said here. */}
      {googleOn && turnedOn && <span className="pointer-events-none absolute bottom-1 left-2 text-[10px] font-medium text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.8)]">Google · Immagini e dati mappa</span>}
      {state === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-label="Caricamento mappa" /></div>}
      {state === "error" && <div role="status" className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-4 text-center text-sm text-muted-foreground"><p>Mappa non disponibile in questo momento.</p><button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background">Riprova</button></div>}
    </div>
  );
}

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { mowStripes, hedgeParts, netParts, PERGOLA_COLORS, pergolaParts, pergolaRingParts, treeParts } from "@/models/area-layout";
import { SIM_COLORS, thirstColor, ZONE_COLORS, type SimLayout } from "@/views/v10/map-area";
import { Crosshair, LoaderCircle } from "lucide-react";
import { frameCamera, groundElevation, type Camera } from "@/models/map-3d-camera";

/**
 * Photorealistic 3D view of the selected place (Google Maps JavaScript API, `maps3d`
 * library, billed through Map Tiles API). Loaded only when the user switches to 3D, with
 * the referrer-restricted browser key; the 2D embed stays the default.
 */
type Maps3D = { Map3DElement: new (options: Record<string, unknown>) => HTMLElement; Marker3DElement: new (options: Record<string, unknown>) => HTMLElement; Polygon3DElement?: new (options: Record<string, unknown>) => HTMLElement; Polyline3DElement?: new (options: Record<string, unknown>) => HTMLElement };
type GoogleMaps = { maps: { importLibrary: (name: string) => Promise<unknown> } };
type Map3D = HTMLElement & Partial<Camera> & { gestureHandling?: string; flyCameraTo?: (options: { endCamera: Camera; durationMillis: number }) => void };

let loader: Promise<Maps3D> | undefined;

// The browser key can be refused for this address (its allowed sites do not include it): the API then calls
// window.gm_authFailure. From then on the 3D view hands over to its fallback instead of showing the provider's error.
let keyRejected = false;
const rejectedSubs = new Set<() => void>();
if (typeof window !== "undefined") {
  (window as typeof window & { gm_authFailure?: () => void }).gm_authFailure = () => { keyRejected = true; rejectedSubs.forEach((f) => f()); };
}
const useKeyRejected = () => useSyncExternalStore((f) => { rejectedSubs.add(f); return () => { rejectedSubs.delete(f); }; }, () => keyRejected, () => false);

function loadMaps3D(key: string): Promise<Maps3D> {
  loader ??= new Promise<Maps3D>((resolve, reject) => {
    const w = window as typeof window & { google?: GoogleMaps; __mdtMaps3dReady?: () => void };
    const done = () => w.google!.maps.importLibrary("maps3d").then((lib) => resolve(lib as Maps3D), reject);
    if (w.google?.maps?.importLibrary) { void done(); return; }
    w.__mdtMaps3dReady = () => void done();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=beta&language=it&region=IT&loading=async&callback=__mdtMaps3dReady`;
    script.async = true;
    script.onerror = () => reject(new Error("Maps JavaScript API non raggiungibile"));
    document.head.appendChild(script);
  }).catch((error) => { loader = undefined; throw error; });
  return loader;
}

type Shape = HTMLElement & { outerCoordinates?: unknown; coordinates?: unknown };
/**
 * The drawn area and the simulation as Google 3D shapes, kept few so the camera moves smoothly: every shape is drawn
 * again on each frame: trees are a trunk and three crown discs, a pergola its posts, beams and one see-through roof, a
 * shade net one see-through sheet. Heights start from the photographed mesh and every shape is drawn through it, so
 * nothing ends up buried under the photographed ground.
 */
function build3DOverlay({ Polygon3DElement, Polyline3DElement }: Maps3D, area: Array<[number, number]>, sim: SimLayout | null, groundM = 0): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (!Polygon3DElement) return out;
  // Every shape lies FLAT on Google's own ground model (RELATIVE_TO_GROUND, heights in metres above it), drawn through the
  // photographed mesh so it is never hidden. Laid on the mesh vertex by vertex, a corner on a real tree's crown or a roof
  // was lifted metres and the lawn turned into slanted green wedges; laid at an outside ground height (sea-level metres
  // from another elevation model) everything floated above the piazza. Google's ground matches its own map.
  void groundM;
  const flat = true;
  const absPoly = (o: Record<string, unknown>, ring: Array<[number, number]>, h: number) => {
    const p = new Polygon3DElement({ ...o, altitudeMode: "RELATIVE_TO_GROUND", drawsOccludedSegments: true }) as Shape;
    p.outerCoordinates = ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: h }));
    return p;
  };
  const absLine = (o: Record<string, unknown>, coords: Array<{ lat: number; lng: number; h: number }>) => {
    const pl = new Polyline3DElement!({ ...o, altitudeMode: "RELATIVE_TO_GROUND", drawsOccludedSegments: true }) as Shape;
    pl.coordinates = coords.map((c) => ({ lat: c.lat, lng: c.lng, altitude: c.h }));
    return pl;
  };
  // Ground shapes sit on the photographed mesh, 20 cm up, like the place's pin (RELATIVE_TO_MESH): clamped to the terrain
  // model, which in a town lies metres under the mesh, they were drawn below it and, seen tilted, looked shifted from
  // the pin and from the real piazza. An older build without that mode clamps them to the ground as before.
  const LIFT = 0.2;
  const onMesh = (Ctor: new (o: Record<string, unknown>) => HTMLElement, o: Record<string, unknown>) => {
    try { return new Ctor({ ...o, altitudeMode: "RELATIVE_TO_MESH" }) as Shape; } catch { return new Ctor({ ...o, altitudeMode: "CLAMP_TO_GROUND" }) as Shape; }
  };
  const meshPoly = (o: Record<string, unknown>) => onMesh(Polygon3DElement, o);
  const meshLine = (o: Record<string, unknown>) => onMesh(Polyline3DElement!, o);
  try {
    const areaStyle = { fillColor: "rgba(56, 214, 196, 0.14)", strokeColor: "#ffffff", strokeWidth: 3, drawsOccludedSegments: true };
    if (flat) out.push(absPoly(areaStyle, area, 0.15));
    else {
      const poly = meshPoly(areaStyle) as Shape;
      poly.outerCoordinates = area.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: LIFT }));
      out.push(poly);
    }
  } catch { return out; /* an older build without polygons: the pin alone */ }
  try {
    // Ground shapes are drawn through the photographed mesh: the terrain they clamp to often lies under the mesh.
    // An outline (stroke) costs no extra shape and gives each piece a crisp edge, so it reads as an object, not a smear.
    const ground = (ring: Array<[number, number]>, fill: string, stroke = "rgba(0,0,0,0)", width = 0) => {
      if (flat) { out.push(absPoly({ fillColor: fill, strokeColor: stroke, strokeWidth: width }, ring, 0.2)); return; }
      const p = meshPoly({ fillColor: fill, strokeColor: stroke, strokeWidth: width, drawsOccludedSegments: true }) as Shape;
      p.outerCoordinates = ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: LIFT }));
      out.push(p);
    };
    // Heights are measured from the photographed mesh (RELATIVE_TO_MESH), not from the terrain model, which in a town
    // can lie metres below the mesh and buried the pergolas and crowns. A trunk or a post is a vertical line from the
    // mesh up; a slab (crown disc, roof, beam, net) floats at its height; the hedge, a wide wall, stays extruded.
    const part = (pt: { ring: Array<[number, number]>; base: number; height: number; color: string }, at = pt.height, stroke = "rgba(0,0,0,0)", width = 0) => {
      const lats = pt.ring.map((q) => q[0]), lngs = pt.ring.map((q) => q[1]);
      const spanM = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lngs) - Math.min(...lngs)) * Math.cos((lats[0]! * Math.PI) / 180)) * 111_320;
      if (flat) {
        // One ground level for the whole piece: a trunk or post a vertical line, a slab level at its height, a wall extruded.
        if (pt.base === 0 && spanM < 1.2 && Polyline3DElement) {
          const c = { lat: lats.reduce((x, y) => x + y, 0) / lats.length, lng: lngs.reduce((x, y) => x + y, 0) / lngs.length };
          out.push(absLine({ strokeColor: pt.color, strokeWidth: spanM > 0.5 ? 7 : 4 }, [{ ...c, h: 0 }, { ...c, h: pt.height }]));
          return;
        }
        const raisedF = pt.base === 0;
        out.push(absPoly({ extruded: raisedF, fillColor: pt.color, strokeColor: stroke, strokeWidth: width }, pt.ring, raisedF ? pt.height : at));
        return;
      }
      if (pt.base === 0 && spanM < 1.2 && Polyline3DElement) {
        const c = { lat: lats.reduce((x, y) => x + y, 0) / lats.length, lng: lngs.reduce((x, y) => x + y, 0) / lngs.length };
        const pl = new Polyline3DElement({ altitudeMode: "RELATIVE_TO_MESH", strokeColor: pt.color, strokeWidth: spanM > 0.5 ? 7 : 4, drawsOccludedSegments: true }) as Shape;
        pl.coordinates = [{ ...c, altitude: 0 }, { ...c, altitude: pt.height }];
        out.push(pl);
        return;
      }
      const raised = pt.base === 0;
      const make = (mode: string) => new Polygon3DElement({ altitudeMode: mode, extruded: raised, fillColor: pt.color, strokeColor: stroke, strokeWidth: width, drawsOccludedSegments: true }) as Shape;
      let p: Shape;
      try { p = make(raised ? "RELATIVE_TO_GROUND" : "RELATIVE_TO_MESH"); } catch { p = make("RELATIVE_TO_GROUND"); }
      p.outerCoordinates = pt.ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: raised ? pt.height : at }));
      out.push(p);
    };
    if (sim?.kind === "piazza") {
      for (const pt of sim.data.patches) {
        // Lawn: a fresh green with a darker edge and light mowing stripes across it (a few lines, no extra surfaces).
        if (pt.kind === "lawn") {
          ground(pt.ring, "rgba(92,170,62,0.82)", "#3a7a28", 2);
          if (Polyline3DElement) for (const line of mowStripes(pt.ring)) {
            if (flat) { out.push(absLine({ strokeColor: "rgba(178,226,120,0.55)", strokeWidth: 5 }, line.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, h: 0.3 })))); continue; }
            const pl = meshLine({ strokeColor: "rgba(178,226,120,0.55)", strokeWidth: 5, drawsOccludedSegments: true }) as Shape;
            pl.coordinates = line.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: LIFT }));
            out.push(pl);
          }
          continue;
        }
      }
      // The shadows of the pergolas and the trees with the sun of the simulation's season and hour, over the lawn.
      for (const r of sim.shadows ?? []) {
        if (flat) out.push(absPoly({ fillColor: "rgba(11,15,21,0.3)", strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }, r, 0.25));
        else ground(r, "rgba(11,15,21,0.3)");
      }
      for (const pt of sim.data.patches) {
        if (pt.kind !== "shade") continue;
        for (const p of pt.exact ? pergolaRingParts(pt.ring, true) : pergolaParts(pt.ring, true)) {
          if (p.base === 0) part({ ...p, color: "#5c3a1c" });
          else if (p.height < 3.2) part(p, p.height, "#4a2e14", 1);
          else part(p, p.height, PERGOLA_COLORS.beam, 3);
        }
      }
      // Each tree: a dark trunk, then three crown discs each ringed a deeper green, so the layers read as foliage.
      for (const t of sim.data.trees) {
        for (const p of treeParts(t, undefined, 2.85)) {
          if (p.base === 0) part({ ...p, color: "#4e341c" });
          else part(p, (p.base + p.height) / 2, "rgba(14,52,20,0.75)", 1.5);
        }
      }
    } else if (sim?.kind === "vigneto") {
      for (const pt of sim.data.patches) if (pt.kind === "zone") ground(pt.ring, `${thirstColor(sim.thirst[pt.zone ?? 0] ?? 0)}59`);
      for (const p of sim.data.patches.filter((x) => x.kind === "cloth").flatMap((x) => netParts(x.ring, true))) part(p, p.height, "#0b1220", 2);
      for (const p of sim.data.lines.filter((l) => l.kind === "wind").flatMap((l) => hedgeParts(l.line, l.strength ?? 0))) part(p, p.height, "#1d4a1b", 1);
      if (Polyline3DElement) for (const l of sim.data.lines.filter((x) => x.kind !== "wind")) {
        const style = { strokeColor: l.kind === "drip" ? SIM_COLORS.drip : "#ffffff", strokeWidth: l.kind === "drip" ? 2 : 3 };
        if (flat) { out.push(absLine(style, l.line.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, h: 0.5 })))); continue; }
        const pl = meshLine({ ...style, drawsOccludedSegments: true }) as Shape;
        pl.coordinates = l.line.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: LIFT }));
        out.push(pl);
      }
    }
    // The zones drawn by hand: a veil and an outline of their colour, drawn through the photographed mesh.
    for (const z of sim?.inner ?? []) if (z.ring.length >= 3) {
      const color = z.kind === "libera" ? "#94a3b8" : ZONE_COLORS[z.kind];
      const zStyle = { fillColor: z.kind === "libera" ? "rgba(71,85,105,0.6)" : `${color}66`, strokeColor: color, strokeWidth: 4 };
      if (flat) { out.push(absPoly(zStyle, z.ring, 0.18)); continue; }
      const zp = meshPoly({ ...zStyle, drawsOccludedSegments: true }) as Shape;
      zp.outerCoordinates = z.ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: LIFT }));
      out.push(zp);
    }
  } catch { /* polygons not supported: the area alone */ }
  return out;
}

function applyCamera(map: Map3D, camera: Camera, animate: boolean) {
  if (animate && map.flyCameraTo) { map.flyCameraTo({ endCamera: camera, durationMillis: 900 }); return; }
  Object.assign(map, camera);
}

export function LocationMap3D({ lat, lng, label, apiKey, fallback, area = [], sim = null }: { lat: number; lng: number; label: string; apiKey: string; fallback?: ReactNode; area?: Array<[number, number]>; sim?: SimLayout | null }) {
  const rejected = useKeyRejected();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map3D | null>(null);
  const altitude = useRef(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const recenter = (animate: boolean) => {
    const map = mapRef.current;
    if (map && host.current) applyCamera(map, frameCamera(lat, lng, host.current.clientHeight, altitude.current), animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };
  const libs = useRef<Maps3D | null>(null);
  // The map is built once per place: the drawn area and the simulation are laid over it by the next effect, so moving a
  // lever never reloads the photorealistic tiles nor resets the camera.
  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    setState("loading");
    Promise.all([loadMaps3D(apiKey), groundElevation(lat, lng)]).then(([lib, ground]) => {
      if (cancelled || !el) return;
      altitude.current = ground;
      libs.current = lib;
      const map = new lib.Map3DElement({ ...frameCamera(lat, lng, el.clientHeight, ground), mode: "HYBRID" }) as Map3D;
      map.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
      // GREEDY: one finger moves the camera; the AUTO default turns cooperative inside a
      // scrollable page and asks for two fingers. Set as a property so older builds ignore it.
      map.gestureHandling = "GREEDY";
      // On top of the 3D mesh (roofs, trees) and drawn even when occluded: a ground pin in a street disappears behind buildings.
      const marker = new lib.Marker3DElement({ position: { lat, lng, altitude: 0 }, altitudeMode: "RELATIVE_TO_MESH", drawsWhenOccluded: true, label });
      map.append(marker);
      // Google's own red pin, like the 2D one.
      el.replaceChildren(map);
      mapRef.current = map;
      setState("ready");
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; mapRef.current = null; el?.replaceChildren(); };
  }, [lat, lng, label, apiKey]);
  const areaKey = JSON.stringify(area), simKey = JSON.stringify(sim);
  useEffect(() => {
    const map = mapRef.current, lib = libs.current;
    if (state !== "ready" || !map || !lib?.Polygon3DElement || area.length < 3) return;
    const added: HTMLElement[] = [];
    // Laid a moment after the levers stop, so a slide does not rebuild the shapes at every step.
    const timer = window.setTimeout(() => {
      for (const node of build3DOverlay(lib, area, sim, altitude.current)) { map.append(node); added.push(node); }
    }, 250);
    return () => { window.clearTimeout(timer); added.forEach((node) => node.remove()); };
  }, [state, areaKey, simKey]);
  // The panel grows when 3D opens (and on rotation): re-frame the place once the size settles.
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: number | undefined;
    let last = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (Math.abs(el.clientHeight - last) < 4) return;
      last = el.clientHeight;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => recenter(false), 120);
    });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  });
  if (rejected) return fallback ? <>{fallback}</> : <p role="status" className="grid h-full w-full place-items-center bg-lab-surface px-3 text-center text-xs text-muted-foreground">Vista 3D non disponibile in questo momento.</p>;
  return <div className="relative h-full w-full overflow-hidden bg-lab-surface">
    {/* touch-none + data-map-gestures: drag, pinch and rotate belong to the 3D map, not to the page. */}
    <div ref={host} data-map-gestures="" className="absolute inset-0 touch-none" aria-label={`Vista 3D di ${label}`} role="img" />
    {/* Top-left: Google keeps its map-type thumbnail top-right, compass and fullscreen bottom-right, logo bottom-left. */}
    {state === "ready" && <button type="button" onClick={() => recenter(true)} aria-label="Ricentra la vista 3D sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
    {state === "loading" && <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-label="Caricamento vista 3D" /></div>}
    {state === "error" && <p role="status" className="absolute inset-0 grid place-items-center px-3 text-center text-xs text-muted-foreground">Vista 3D non disponibile in questo momento.</p>}
  </div>;
}

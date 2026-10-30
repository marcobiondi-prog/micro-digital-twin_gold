import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { hedgeParts, netParts, pergolaParts, treeParts } from "@/models/area-layout";
import { SIM_COLORS, thirstColor, type SimLayout } from "@/views/v10/map-area";
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
  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    setState("loading");
    Promise.all([loadMaps3D(apiKey), groundElevation(lat, lng)]).then(([{ Map3DElement, Marker3DElement, Polygon3DElement, Polyline3DElement }, ground]) => {
      if (cancelled || !el) return;
      altitude.current = ground;
      const map = new Map3DElement({ ...frameCamera(lat, lng, el.clientHeight, ground), mode: "HYBRID" }) as Map3D;
      map.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
      // GREEDY: one finger moves the camera; the AUTO default turns cooperative inside a
      // scrollable page and asks for two fingers. Set as a property so older builds ignore it.
      map.gestureHandling = "GREEDY";
      // On top of the 3D mesh (roofs, trees) and drawn even when occluded: a ground pin in a street disappears behind buildings.
      map.append(new Marker3DElement({ position: { lat, lng, altitude: 0 }, altitudeMode: "RELATIVE_TO_MESH", drawsWhenOccluded: true, label }));
      // The area drawn with pins on the 2D map, laid on the ground and seen through the buildings.
      if (Polygon3DElement && area.length >= 3) {
        try {
          const poly = new Polygon3DElement({ altitudeMode: "CLAMP_TO_GROUND", fillColor: "rgba(56, 214, 196, 0.35)", strokeColor: "#ffffff", strokeWidth: 3, drawsOccludedSegments: true }) as HTMLElement & { outerCoordinates?: unknown };
          poly.outerCoordinates = area.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng }));
          map.append(poly);
        } catch { /* an older build without polygons: the pin alone */ }
        // The simulation inside the area: lawn and zones on the ground, shade and cloth 3 m up, trees as crowns 9 m tall.
        try {
          const shape = (ring: Array<[number, number]>, fill: string, alt: number | null) => {
            const p = new Polygon3DElement({ altitudeMode: alt === null ? "CLAMP_TO_GROUND" : "RELATIVE_TO_GROUND", extruded: alt !== null, fillColor: fill, strokeColor: "rgba(255,255,255,0)", strokeWidth: 0 }) as HTMLElement & { outerCoordinates?: unknown };
            p.outerCoordinates = ring.map(([pLat, pLng]) => (alt === null ? { lat: pLat, lng: pLng } : { lat: pLat, lng: pLng, altitude: alt }));
            map.append(p);
          };
          if (sim?.kind === "piazza") {
            for (const pt of sim.data.patches) {
              if (pt.kind === "lawn") { shape(pt.ring, "rgba(98,176,66,0.85)", null); continue; }
              // Shade: the shadow on the ground, then the wooden pergola over it (posts raised, beams and slats as floating slabs).
              shape(pt.ring, "rgba(11,15,21,0.35)", null);
              for (const part of pergolaParts(pt.ring)) {
                if (part.base === 0) { shape(part.ring, part.color, part.height); continue; }
                const slab = new Polygon3DElement({ altitudeMode: "RELATIVE_TO_GROUND", extruded: false, fillColor: part.color, strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }) as HTMLElement & { outerCoordinates?: unknown };
                slab.outerCoordinates = part.ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: part.height }));
                map.append(slab);
              }
            }
            // Each tree: the trunk raised from the ground, then the crown as stacked discs floating at their heights.
            for (const t of sim.data.trees) for (const part of treeParts(t, undefined, 1)) {
              if (part.base === 0) { shape(part.ring, part.color, part.height); continue; }
              const disc = new Polygon3DElement({ altitudeMode: "RELATIVE_TO_GROUND", extruded: false, fillColor: part.color, strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }) as HTMLElement & { outerCoordinates?: unknown };
              disc.outerCoordinates = part.ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: (part.base + part.height) / 2 }));
              map.append(disc);
            }
          } else if (sim?.kind === "vigneto") {
            // Zones tinted by thirst on the ground, shade nets floating on posts, the hedge raised along its edge.
            for (const pt of sim.data.patches) if (pt.kind === "zone") shape(pt.ring, `${thirstColor(sim.thirst[pt.zone ?? 0] ?? 0)}66`, null);
            for (const part of [...sim.data.patches.filter((p) => p.kind === "cloth").flatMap((p) => netParts(p.ring)), ...sim.data.lines.filter((l) => l.kind === "wind").flatMap((l) => hedgeParts(l.line, l.strength ?? 0))]) {
              if (part.base === 0) { shape(part.ring, part.color, part.height); continue; }
              const slab = new Polygon3DElement({ altitudeMode: "RELATIVE_TO_GROUND", extruded: false, fillColor: part.color, strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }) as HTMLElement & { outerCoordinates?: unknown };
              slab.outerCoordinates = part.ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: part.height }));
              map.append(slab);
            }
            if (Polyline3DElement) for (const l of sim.data.lines.filter((x) => x.kind === "drip")) {
              const pl = new Polyline3DElement({ altitudeMode: "CLAMP_TO_GROUND", strokeColor: l.kind === "drip" ? SIM_COLORS.drip : SIM_COLORS.wind, strokeWidth: l.kind === "drip" ? 2 : 6, drawsOccludedSegments: true }) as HTMLElement & { coordinates?: unknown };
              pl.coordinates = l.line.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng }));
              map.append(pl);
            }
          }
        } catch { /* polygons not supported: the area alone */ }
      }
      el.replaceChildren(map);
      mapRef.current = map;
      setState("ready");
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; mapRef.current = null; el?.replaceChildren(); };
  }, [lat, lng, label, apiKey, JSON.stringify(area), JSON.stringify(sim)]);
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

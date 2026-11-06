import { isKeyRejected, loadGoogleMaps, onKeyRejected } from "@/lib/google-maps-js";
import { densify, tileRing } from "@/models/drape";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { bedParts, BEDS_3D, crownRing, trapParts, PERGOLA_COLORS, pergolaParts, pergolaRingParts, treeParts } from "@/models/area-layout";
import { MIST_RADIUS_M, SIM_COLORS, thirstColor, ZONE_COLORS, type SimLayout } from "@/views/v10/map-area";
import { Crosshair, LoaderCircle } from "lucide-react";
import { frameCamera, groundElevation, type Camera } from "@/models/map-3d-camera";

/**
 * Photorealistic 3D view of the selected place (Google Maps JavaScript API, `maps3d`
 * library, billed through Map Tiles API). Loaded only when the user switches to 3D, with
 * the referrer-restricted browser key; the 2D embed stays the default.
 */
type Maps3D = { Map3DElement: new (options: Record<string, unknown>) => HTMLElement; Marker3DElement: new (options: Record<string, unknown>) => HTMLElement; Polygon3DElement?: new (options: Record<string, unknown>) => HTMLElement; Polyline3DElement?: new (options: Record<string, unknown>) => HTMLElement };
type Map3D = HTMLElement & Partial<Camera> & { gestureHandling?: string; flyCameraTo?: (options: { endCamera: Camera; durationMillis: number }) => void };

// The browser key can be refused for this address (its allowed sites do not include it): the API then calls
// window.gm_authFailure (lib/google-maps-js). From then on the 3D view hands over to its fallback instead of showing the provider's error.
const useKeyRejected = () => useSyncExternalStore(onKeyRejected, isKeyRejected, () => false);

function loadMaps3D(key: string): Promise<Maps3D> {
  return loadGoogleMaps(key).then((g) => g.maps.importLibrary("maps3d") as Promise<Maps3D>);
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
  // On a hilly ground a big flat shape cut into the slope and vanished, its long edges ran under it: shapes are laid in
  // small tiles that each follow the ground (models/drape), their outline in short pieces of polyline, and every line
  // gets a point every few metres. Walls (extruded) only get their outline densified.
  const DRAPE_STEP = 5, DRAPE_CELL = 8;
  const rawPoly = (o: Record<string, unknown>, ring: Array<[number, number]>, h: number) => {
    const p = new Polygon3DElement({ ...o, altitudeMode: "RELATIVE_TO_GROUND", drawsOccludedSegments: true }) as Shape;
    p.outerCoordinates = ring.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, altitude: h }));
    return p;
  };
  const absLine = (o: Record<string, unknown>, coords: Array<{ lat: number; lng: number; h: number }>) => {
    const pl = new Polyline3DElement!({ ...o, altitudeMode: "RELATIVE_TO_GROUND", drawsOccludedSegments: true }) as Shape;
    const vertical = coords.length === 2 && coords[0]!.lat === coords[1]!.lat && coords[0]!.lng === coords[1]!.lng;
    pl.coordinates = (vertical ? coords : densify(coords, DRAPE_STEP)).map((c) => ({ lat: c.lat, lng: c.lng, altitude: c.h }));
    return pl;
  };
  /** A polygon draped on the ground: tiles for its fill, a densified polyline for its edge; small ones stay whole. */
  const absPoly = (o: Record<string, unknown>, ring: Array<[number, number]>, h: number): Shape => {
    if (o["extruded"]) return rawPoly(o, densify(ring.map(([lat, lng]) => ({ lat, lng })), DRAPE_STEP, true).slice(0, -1).map((q) => [q.lat, q.lng] as [number, number]), h);
    const tiles = tileRing(ring, DRAPE_CELL);
    if (tiles.length <= 1) return rawPoly(o, densify(ring.map(([lat, lng]) => ({ lat, lng })), DRAPE_STEP, true).slice(0, -1).map((q) => [q.lat, q.lng] as [number, number]), h);
    const fill = { ...o, strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 };
    tiles.forEach((t, i) => { if (i < tiles.length - 1) out.push(rawPoly(fill, t, h)); });
    const width = Number(o["strokeWidth"] ?? 0);
    if (width > 0 && Polyline3DElement) out.push(absLine({ strokeColor: o["strokeColor"], strokeWidth: width }, [...ring, ring[0]!].map(([lat, lng]) => ({ lat, lng, h: h + 0.05 }))));
    return rawPoly(fill, tiles[tiles.length - 1]!, h);
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
    const areaStyle = { fillColor: "rgba(56, 214, 196, 0.16)", strokeColor: "#ffffff", strokeWidth: 4, drawsOccludedSegments: true };
    if (flat) out.push(absPoly(areaStyle, area, 0.35));
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
      if (flat) { out.push(absPoly({ fillColor: fill, strokeColor: stroke, strokeWidth: width }, ring, 0.4)); return; }
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
        // Aiuole e ciottoli: no ground plane here — the piazza's own paving shows between the beds (a grey sheet over
        // the photographed ground looked like a slab laid on the square); the beds go on it below.
        if (pt.kind === "lawn") continue;
      }
      // The beds on the pebbles: soft rounded flat beds of grass with a darker green edge and round flower spots
      // (bedParts: a grid of square beds like the 2D, at most 48).
      // On Google's ground model like every other shape, over the area's veil (0,35 m) and the shadows: laid on the
      // photographed mesh instead they wrapped over the real trees' crowns as green wedges.
      for (const p of bedParts(sim.data.patches.filter((x) => x.kind === "lawn").map((x) => x.ring), 50, area).parts) {
        const grass = (BEDS_3D.grass as readonly string[]).includes(p.color);
        part(p, p.height, grass ? BEDS_3D.edge : "rgba(0,0,0,0)", grass ? 2 : 0);
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
      // Each mister: a soft veil of mist on the ground, a slim steel pole with a ring head, and the mist
      // falling from it as three see-through discs widening downwards. Their numbers are badges kept apart (misterBadges).
      for (const m of sim.data.misters) {
        if (flat) out.push(absPoly({ fillColor: "rgba(125,211,252,0.22)", strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }, crownRing(m, MIST_RADIUS_M, 16), 0.24));
        else ground(crownRing(m, MIST_RADIUS_M, 16), "rgba(125,211,252,0.22)");
        part({ ring: crownRing(m, 0.06, 6), base: 0, height: 3, color: "#e2e8f0" });
        part({ ring: crownRing(m, 0.32, 10), base: 2.95, height: 3.08, color: "#f8fafc" }, 3.08, "#38bdf8", 2);
        part({ ring: crownRing(m, 0.9, 14), base: 2.55, height: 2.62, color: "rgba(224,242,254,0.32)" }, 2.62, "rgba(125,211,252,0.55)", 1);
        part({ ring: crownRing(m, 1.7, 16), base: 1.85, height: 1.9, color: "rgba(224,242,254,0.2)" }, 1.9, "rgba(125,211,252,0.35)", 1);
        part({ ring: crownRing(m, 2.5, 18), base: 1.1, height: 1.14, color: "rgba(224,242,254,0.12)" }, 1.14, "rgba(125,211,252,0.22)", 1);
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
      // Treated rows (plant pests): a light see-through veil; traps (animal pests): a post with a yellow box.
      for (const pt of sim.data.patches) if (pt.kind === "treat") ground(pt.ring, `${SIM_COLORS.treat}40`);
      for (const t of sim.data.traps) for (const p of trapParts(t)) { if (p.base === 0) part(p); else part(p, p.height, "#422006", 1); }
      if (Polyline3DElement) for (const l of sim.data.lines) {
        const style = { strokeColor: l.kind === "drip" ? SIM_COLORS.drip : l.kind === "main" ? SIM_COLORS.main : "#ffffff", strokeWidth: l.kind === "drip" ? 2 : l.kind === "main" ? 5 : 3 };
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

/**
 * The misting poles' numbers in 3D, as in 2D: a sky badge for those in the zones drawn for them, white for the others.
 * Kept in a pool and never removed from the map — a Marker3DElement taken off the map kept being drawn, so poles taken
 * away stayed on the 3D view: unused badges are sent under the ground and not drawn when hidden.
 */
function misterBadges(lib: Maps3D, map: HTMLElement, pool: Map<string, HTMLElement>, sim: SimLayout | null) {
  const want = new Map<string, [number, number]>();
  if (sim?.kind === "piazza") sim.data.misters.forEach((m, i) => want.set(`${i}:${i < sim.data.mistersInZones ? "z" : "a"}`, m));
  for (const [key, mk] of pool) {
    const at = want.get(key) as [number, number] | undefined;
    const m = mk as HTMLElement & { position: unknown; drawsWhenOccluded: boolean };
    if (at) { m.position = { lat: at[0], lng: at[1], altitude: 3.9 }; m.drawsWhenOccluded = true; want.delete(key); }
    else { m.drawsWhenOccluded = false; m.position = { ...(m.position as object), altitude: -500 }; }
  }
  for (const [key, at] of want) {
    try {
      const [n, z] = key.split(":"), inZone = z === "z", i = Number(n);
      const mk = new lib.Marker3DElement({ position: { lat: at[0], lng: at[1], altitude: 3.9 }, altitudeMode: "RELATIVE_TO_GROUND", drawsWhenOccluded: true, sizePreserved: true });
      const tpl = document.createElement("template");
      tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="${inZone ? "#38bdf8" : "#f8fafc"}" stroke="${inZone ? "#e0f2fe" : "#38bdf8"}" stroke-width="2.5"/><text x="13" y="17.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${inZone ? "#0b0f15" : "#0369a1"}">${i + 1}</text></svg>`;
      mk.append(tpl);
      map.append(mk);
      pool.set(key, mk);
    } catch { /* an older build without custom markers: the poles alone */ }
  }
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
  // The misting poles' number badges, one per pole and kind, reused for the map's whole life (misterBadges).
  const badges = useRef(new Map<string, HTMLElement>());
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
    return () => { cancelled = true; mapRef.current = null; badges.current.clear(); el?.replaceChildren(); };
  }, [lat, lng, label, apiKey]);
  const areaKey = JSON.stringify(area), simKey = JSON.stringify(sim);
  useEffect(() => {
    const map = mapRef.current, lib = libs.current;
    if (state !== "ready" || !map || !lib) return;
    if (!lib.Polygon3DElement || area.length < 3) { misterBadges(lib, map, badges.current, null); return; }
    const added: HTMLElement[] = [];
    // Laid a moment after the levers stop, so a slide does not rebuild the shapes at every step.
    const timer = window.setTimeout(() => {
      for (const node of build3DOverlay(lib, area, sim, altitude.current)) { map.append(node); added.push(node); }
      misterBadges(lib, map, badges.current, sim);
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

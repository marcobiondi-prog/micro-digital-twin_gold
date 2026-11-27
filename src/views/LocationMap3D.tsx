import { isKeyRejected, loadGoogleMaps, onKeyRejected } from "@/lib/google-maps-js";
import { useModels3D } from "@/lib/use-ios-3d";
import { firstName, personInitials, spotsKey, type ColleagueSpot } from "@/lib/colleagues";
import { densify, tileRing } from "@/models/drape";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bedParts, BEDS_3D, crownRing, hedgeParts, netParts, vineRowParts, PERGOLA_COLORS, pergolaParts, shadePatchBlocks, treeParts } from "@/models/area-layout";
import { MIST_RADIUS_M, SIM_COLORS, thirstColor, ZONE_COLORS, type SimLayout } from "@/views/v10/map-area";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, LoaderCircle, Minus, Move, Plus, RotateCcw, X } from "lucide-react";
import { frameCamera, groundElevation, type Camera } from "@/models/map-3d-camera";
import { heightAt, loadHeights } from "@/lib/ground-heights";

/**
 * Photorealistic 3D view of the selected place (Google Maps JavaScript API, `maps3d`
 * library, billed through Map Tiles API). Loaded only when the user switches to 3D, with
 * the referrer-restricted browser key; the 2D embed stays the default.
 */
type Maps3D = { Map3DElement: new (options: Record<string, unknown>) => HTMLElement; Marker3DElement: new (options: Record<string, unknown>) => HTMLElement; Polygon3DElement?: new (options: Record<string, unknown>) => HTMLElement; Polyline3DElement?: new (options: Record<string, unknown>) => HTMLElement; Model3DElement?: new (options: Record<string, unknown>) => HTMLElement };
type Map3D = HTMLElement & Partial<Camera> & { gestureHandling?: string; flyCameraTo?: (options: { endCamera: Camera; durationMillis: number }) => void };

// The browser key can be refused for this address (its allowed sites do not include it): the API then calls
// window.gm_authFailure (lib/google-maps-js). From then on the 3D view hands over to its fallback instead of showing the provider's error.
const useKeyRejected = () => useSyncExternalStore(onKeyRejected, isKeyRejected, () => false);

const metresBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lat - b.lat) * 111_320, (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
/** Google's 3D needs WebGL 2: without it (an old phone, a lost context, a blocked GPU) the simplified map shows at once. */
function webglOk(): boolean {
  try { const c = document.createElement("canvas"); const gl = c.getContext("webgl2"); (gl?.getExtension("WEBGL_lose_context"))?.loseContext(); return !!gl; } catch { return false; }
}
/** A load that never answers (a slow network, a stuck script) ends as an error instead of a spinner for ever. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => { const t = window.setTimeout(() => reject(new Error("timeout")), ms); p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); }); });
}

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
function build3DOverlay({ Polygon3DElement, Polyline3DElement }: Maps3D, area: Array<[number, number]>, sim: SimLayout | null, adj: Adjust = NO_ADJUST, models = false, layer: "base" | "shadows" = "base"): HTMLElement[] {
  // models: the realistic models (views/v10/g3d-models) stand for the trees, pergolas, aiuole, misting poles, shade
  // nets and hedges, so their simple shapes are not drawn; the ground shapes (area, zones, shadows, mist veils, vine
  // zones and rows, lines) stay.
  const out: HTMLElement[] = [];
  if (!Polygon3DElement) return out;
  // Every shape lies FLAT on Google's own ground model (RELATIVE_TO_GROUND, heights in metres above it), drawn through the
  // photographed mesh so it is never hidden. Laid on the mesh vertex by vertex, a corner on a real tree's crown or a roof
  // was lifted metres and the lawn turned into slanted green wedges; laid at an outside ground height (sea-level metres
  // from another elevation model) everything floated above the piazza. Google's ground matches its own map.
  // Raised or lowered by hand (the 3D view's "Altezza" − / +): Google's ground model can lie under the photographed
  // floor, and shapes laid on it slide when the view tilts; lifted to the floor they stay put.
  // Moved sideways by hand too (north / east, in metres), as the photographed mesh can sit a little aside of the map.
  const MODE = "RELATIVE_TO_GROUND", UP = adj.h;
  const dLat = adj.n / 111_320, dLng = adj.e / (111_320 * Math.cos(((area[0]?.[0] ?? 0) * Math.PI) / 180));
  const flat = true;
  // On a hilly ground a big flat shape cut into the slope and vanished, its long edges ran under it: shapes are laid in
  // small tiles that each follow the ground (models/drape), their outline in short pieces of polyline, and every line
  // gets a point every few metres. Walls (extruded) only get their outline densified.
  const DRAPE_STEP = 5, DRAPE_CELL = 8;
  const rawPoly = (o: Record<string, unknown>, ring: Array<[number, number]>, h: number) => {
    const p = new Polygon3DElement({ ...o, altitudeMode: MODE, drawsOccludedSegments: true }) as Shape;
    p.style.pointerEvents = "none";
    p.style.touchAction = "none";
    p.outerCoordinates = ring.map(([pLat, pLng]) => ({ lat: pLat + dLat, lng: pLng + dLng, altitude: h + UP }));
    return p;
  };
  const absLine = (o: Record<string, unknown>, coords: Array<{ lat: number; lng: number; h: number }>, step = DRAPE_STEP) => {
    const pl = new Polyline3DElement!({ ...o, altitudeMode: MODE, drawsOccludedSegments: true }) as Shape;
    pl.style.pointerEvents = "none";
    pl.style.touchAction = "none";
    const vertical = coords.length === 2 && coords[0]!.lat === coords[1]!.lat && coords[0]!.lng === coords[1]!.lng;
    pl.coordinates = (vertical ? coords : densify(coords, step)).map((c) => ({ lat: c.lat + dLat, lng: c.lng + dLng, altitude: c.h + UP }));
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
  // The shadows alone, a layer of their own: they follow the simulation's clock (a new sun every minute), and laid with
  // everything else they made the whole drawing and its models go and come back each time.
  if (layer === "shadows") {
    if (sim) try { for (const r of sim.shadows ?? []) out.push(absPoly({ fillColor: "rgba(11,15,21,0.4)", strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }, r, 0.74)); } catch { /* polygons not supported */ }
    return out;
  }
  // Ground shapes sit on the photographed mesh, 20 cm up, like the place's pin (RELATIVE_TO_MESH): clamped to the terrain
  // model, which in a town lies metres under the mesh, they were drawn below it and, seen tilted, looked shifted from
  // the pin and from the real piazza. An older build without that mode clamps them to the ground as before.
  const LIFT = 0.2;
  const onMesh = (Ctor: new (o: Record<string, unknown>) => HTMLElement, o: Record<string, unknown>) => {
    let s: Shape;
    try { s = new Ctor({ ...o, altitudeMode: "RELATIVE_TO_MESH" }) as Shape; } catch { s = new Ctor({ ...o, altitudeMode: "CLAMP_TO_GROUND" }) as Shape; }
    s.style.pointerEvents = "none";
    s.style.touchAction = "none";
    return s;
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
      if (!models) for (const p of bedParts(sim.data.patches.filter((x) => x.kind === "lawn").map((x) => x.ring), 50, area).parts) {
        const grass = (BEDS_3D.grass as readonly string[]).includes(p.color);
        part(p, p.height, grass ? BEDS_3D.edge : "rgba(0,0,0,0)", grass ? 2 : 0);
      }
      // The shadows of the pergolas and the trees with the sun of the simulation's season and hour, over the lawn.
      for (const r of flat ? [] : sim.shadows ?? []) {
        // Over the aiuole too (their sods lie 0,60–0,70 m up and hid a shadow laid at 0,25 m), a little darker.
        if (flat) out.push(absPoly({ fillColor: "rgba(11,15,21,0.4)", strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }, r, 0.74));
        else ground(r, "rgba(11,15,21,0.4)");
      }
      // One sail per shade block, as big as the block (never repeated as the m² grow).
      for (const pt of models ? [] : shadePatchBlocks(sim.data.patches.filter((q) => q.kind === "shade"))) {
        for (const p of pergolaParts(pt.ring, true, sim.shadeOpen ?? 1, pt.angle)) {
          // The pole in steel, the fan of fabric with a dark hem.
          if (p.base === 0) part(p);
          else part(p, p.height, PERGOLA_COLORS.beam, 2);
        }
      }
      // Each mister: a soft veil of mist on the ground, a slim steel pole with a ring head, and the mist
      // falling from it as three see-through discs widening downwards. Their numbers are badges kept apart (misterBadges).
      for (const m of sim.data.misters) {
        if (flat) out.push(absPoly({ fillColor: "rgba(125,211,252,0.22)", strokeColor: "rgba(0,0,0,0)", strokeWidth: 0 }, crownRing(m, MIST_RADIUS_M, 16), 0.24));
        else ground(crownRing(m, MIST_RADIUS_M, 16), "rgba(125,211,252,0.22)");
        if (!models) {
          part({ ring: crownRing(m, 0.06, 6), base: 0, height: 3, color: "#e2e8f0" });
          part({ ring: crownRing(m, 0.32, 10), base: 2.95, height: 3.08, color: "#f8fafc" }, 3.08, "#38bdf8", 2);
        }
        part({ ring: crownRing(m, 0.9, 14), base: 2.55, height: 2.62, color: "rgba(224,242,254,0.32)" }, 2.62, "rgba(125,211,252,0.55)", 1);
        part({ ring: crownRing(m, 1.7, 16), base: 1.85, height: 1.9, color: "rgba(224,242,254,0.2)" }, 1.9, "rgba(125,211,252,0.35)", 1);
        part({ ring: crownRing(m, 2.5, 18), base: 1.1, height: 1.14, color: "rgba(224,242,254,0.12)" }, 1.14, "rgba(125,211,252,0.22)", 1);
      }
      // Each sprinkler (innaffiatoio): the wet circle it waters (3 m round, teal), the water thrown in a low dome of
      // see-through rings, and with plain shapes a small dark head; its number is a teal badge (misterBadges). The
      // realistic head alone sits flush in the ground and was not seen from above.
      for (const sp of sim.data.sprinklers ?? []) {
        if (flat) out.push(absPoly({ fillColor: "rgba(45,212,191,0.24)", strokeColor: "rgba(45,212,191,0.7)", strokeWidth: 1 }, crownRing(sp, 3, 18), 0.24));
        else ground(crownRing(sp, 3, 18), "rgba(45,212,191,0.24)");
        if (!models) part({ ring: crownRing(sp, 0.12, 8), base: 0, height: 0.25, color: "#1f2937" });
        // The water itself is animated apart (the sprinklers effect in LocationMap3D): rings of spray and a turning jet.
      }
      // Each tree: a dark trunk, then three crown discs each ringed a deeper green, so the layers read as foliage.
      if (!models) for (const t of sim.data.trees) {
        for (const p of treeParts(t, undefined, 2.85)) {
          if (p.base === 0) part({ ...p, color: "#4e341c" });
          else part(p, (p.base + p.height) / 2, "rgba(14,52,20,0.75)", 1.5);
        }
      }
    } else if (sim?.kind === "vigneto") {
      for (const pt of sim.data.patches) if (pt.kind === "zone") ground(pt.ring, `${thirstColor(sim.thirst[pt.zone ?? 0] ?? 0)}59`);
      // The vines in relief: a low green wall per row across each zone, standing on the ground (kept to 160 rows).
      // With the realistic models the rows are trained vines (g3d-models), not these walls.
      if (!models) for (const p of vineRowParts(sim.data.patches.filter((x) => x.kind === "zone").map((x) => x.ring), 160, true)) part(p, p.height, "#2a5a22", 1);
      // The shade cloth: a see-through dark sheet on corner posts; the windbreak: a hedge along its edge.
      if (!models) {
        for (const p of sim.data.patches.filter((x) => x.kind === "cloth").flatMap((x) => netParts(x.ring, true))) part(p, p.height, "#0b1220", 2);
        for (const p of sim.data.lines.filter((l) => l.kind === "wind").flatMap((l) => hedgeParts(l.line, l.strength ?? 0))) part(p, p.height, "#1d4a1b", 1);
      }
      // With the realistic models the drip lines and main pipes are real pipes in short pieces (g3d-models); as lines
      // they get a point every metre, so on a hilly vineyard they follow the ground and no longer run under it.
      if (Polyline3DElement) for (const l of sim.data.lines.filter((x) => x.kind !== "wind" && !(models && (x.kind === "drip" || x.kind === "main")))) {
        const style = { strokeColor: l.kind === "drip" ? SIM_COLORS.drip : l.kind === "main" ? SIM_COLORS.main : "#ffffff", strokeWidth: l.kind === "drip" ? 2 : l.kind === "main" ? 5 : 3 };
        const pipe = l.kind === "drip" || l.kind === "main";
        if (flat) { out.push(absLine(style, l.line.map(([pLat, pLng]) => ({ lat: pLat, lng: pLng, h: pipe ? 0.35 : 0.5 })), pipe ? 1 : DRAPE_STEP)); continue; }
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
function misterBadges(lib: Maps3D, map: HTMLElement, pool: Map<string, HTMLElement>, sim: SimLayout | null, adj: Adjust = NO_ADJUST) {
  const mode = "RELATIVE_TO_GROUND", up = adj.h + 3.9, upSpr = adj.h + 1.6;
  const want = new Map<string, [number, number]>();
  const kLng = 111_320 * Math.cos(((sim?.kind === "piazza" ? sim.data.misters[0]?.[0] ?? 0 : 0) * Math.PI) / 180) || 1;
  if (sim?.kind === "piazza") sim.data.misters.forEach((m, i) => want.set(`${i}:${i < sim.data.mistersInZones ? "z" : "a"}`, [m[0] + adj.n / 111_320, m[1] + adj.e / kLng]));
  if (sim?.kind === "piazza") (sim.data.sprinklers ?? []).forEach((m, i) => want.set(`${i}:s`, [m[0] + adj.n / 111_320, m[1] + adj.e / kLng]));
  for (const [key, mk] of pool) {
    const at = want.get(key) as [number, number] | undefined;
    const m = mk as HTMLElement & { position: unknown; drawsWhenOccluded: boolean; altitudeMode: string };
    if (at) { m.altitudeMode = mode; m.position = { lat: at[0], lng: at[1], altitude: key.endsWith(":s") ? upSpr : up }; m.drawsWhenOccluded = true; want.delete(key); }
    else {
      // Its lat and lng are getters of Google's LatLngAltitude, lost by a spread (which threw and left the badge on show).
      const p = m.position as { lat: number; lng: number };
      m.drawsWhenOccluded = false; m.position = { lat: Number(p.lat), lng: Number(p.lng), altitude: -500 };
    }
  }
  for (const [key, at] of want) {
    try {
      const [n, z] = key.split(":"), inZone = z === "z", spr = z === "s", i = Number(n);
      const mk = new lib.Marker3DElement({ position: { lat: at[0], lng: at[1], altitude: spr ? upSpr : up }, altitudeMode: mode, drawsWhenOccluded: true, sizePreserved: true });
      const tpl = document.createElement("template");
      tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="11" fill="${spr ? "#2dd4bf" : inZone ? "#38bdf8" : "#f8fafc"}" stroke="${spr ? "#ccfbf1" : inZone ? "#e0f2fe" : "#38bdf8"}" stroke-width="2.5"/><text x="13" y="17.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="${spr || inZone ? "#0b0f15" : "#0369a1"}">${i + 1}</text></svg>`;
      mk.append(tpl);
      map.append(mk);
      pool.set(key, mk);
    } catch { /* an older build without custom markers: the poles alone */ }
  }
}

/**
 * Progetti condivisi in Google's 3D: each colleague connected now as a pill with their initials and first name, 2,5 m
 * over the ground where their phone's GPS puts them, drawn when hidden behind buildings. Kept in a pool like the misting
 * poles' badges (a Marker3DElement taken off the map kept being drawn): one who leaves goes under the ground.
 */
function personBadges(lib: Maps3D, map: HTMLElement, pool: Map<string, HTMLElement>, people: ColleagueSpot[]) {
  const want = new Map(people.map((p) => [p.id, p]));
  for (const [id, mk] of pool) {
    const m = mk as HTMLElement & { position: unknown; drawsWhenOccluded: boolean };
    const p = want.get(id);
    if (p) { m.position = { lat: p.lat, lng: p.lng, altitude: 2.5 }; m.drawsWhenOccluded = true; want.delete(id); }
    else { m.drawsWhenOccluded = false; m.position = { lat: Number((m.position as { lat: number }).lat), lng: Number((m.position as { lng: number }).lng), altitude: -500 }; }
  }
  for (const [id, p] of want) {
    try {
      const mk = new lib.Marker3DElement({ position: { lat: p.lat, lng: p.lng, altitude: 2.5 }, altitudeMode: "RELATIVE_TO_GROUND", drawsWhenOccluded: true, sizePreserved: true });
      const name = firstName(p.name).replace(/[<&>"]/g, ""), ini = personInitials(p.name).replace(/[<&>"]/g, "");
      const note = (p.note ?? "").replace(/[<&>"]/g, ""), ring = p.away ? "#94a3b8" : "#2dd4bf";
      const w = 44 + Math.min(14, name.length) * 8.4 + (note ? note.length * 6.2 + 10 : 0);
      const tpl = document.createElement("template");
      tpl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34" viewBox="0 0 ${w} 34"><rect x="1.5" y="1.5" width="${w - 3}" height="31" rx="15.5" fill="#0b0f15" fill-opacity="0.85" stroke="${ring}" stroke-width="2"/><circle cx="17" cy="17" r="12" fill="${ring}"/><text x="17" y="21" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#0b0f15">${ini}</text><text x="35" y="22" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="#ffffff">${name}${note ? `<tspan font-size="11" font-weight="500" fill="#cbd5e1"> · ${note}</tspan>` : ""}</text></svg>`;
      mk.append(tpl);
      map.append(mk);
      pool.set(id, mk);
    } catch { /* an older build without custom markers */ }
  }
}

/** How much the drawing is raised (or lowered) over Google's ground model, per place, set by hand; kept on this device. */
/** The drawing's correction over Google's 3D, per place: h up (m), n north and e east (m); kept on this device. */
type Adjust = { h: number; n: number; e: number };
const NO_ADJUST: Adjust = { h: 0, n: 0, e: 0 };
const ADJUST_KEY = "mdt-3d-adjust-v1", OLD_LIFT_KEY = "mdt-3d-lift-v1";
export const ADJ_STEP = 0.5, LIFT_MIN = -5, LIFT_MAX = 20, SHIFT_MAX = 30;
const placeKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
function readAdjust(lat: number, lng: number): Adjust {
  try {
    const v = (JSON.parse(localStorage.getItem(ADJUST_KEY) ?? "{}") as Record<string, Adjust>)[placeKey(lat, lng)];
    if (v) return { h: v.h ?? 0, n: v.n ?? 0, e: v.e ?? 0 };
    // The height set before sideways moves existed.
    const old = (JSON.parse(localStorage.getItem(OLD_LIFT_KEY) ?? "{}") as Record<string, number>)[placeKey(lat, lng)];
    return typeof old === "number" ? { ...NO_ADJUST, h: old } : NO_ADJUST;
  } catch { return NO_ADJUST; }
}
function writeAdjust(lat: number, lng: number, a: Adjust) {
  try {
    const all = JSON.parse(localStorage.getItem(ADJUST_KEY) ?? "{}") as Record<string, Adjust>;
    if (!a.h && !a.n && !a.e) delete all[placeKey(lat, lng)]; else all[placeKey(lat, lng)] = a;
    localStorage.setItem(ADJUST_KEY, JSON.stringify(all));
  } catch { /* storage off: for this visit only */ }
}
const metres = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;

function applyCamera(map: Map3D, camera: Camera, animate: boolean) {
  if (animate && map.flyCameraTo) {
    try {
      map.flyCameraTo({ endCamera: camera, durationMillis: 900 });
      return;
    } catch { /* fallback to direct property assignment */ }
  }
  Object.assign(map, camera);
}

export function LocationMap3D({ lat, lng, label, apiKey, area = [], sim = null, follow = false, people = [] }: { lat: number; lng: number; label: string; apiKey: string; area?: Array<[number, number]>; sim?: SimLayout | null; follow?: boolean; people?: ColleagueSpot[] }) {
  const rejected = useKeyRejected();
  // The map is built for a place, not for each GPS fix: the pin can follow the phone metre by metre, and rebuilding the
  // photographic 3D at every fix left it blank half the time. A new place (over 30 m away) builds a new map.
  // While the GPS follows the phone the map is never rebuilt at all: the camera glides after the pin (below), like a car's
  // navigation map; the drawing's origin stays where the place is.
  const anchor = useRef({ lat, lng });
  if (!follow && metresBetween(anchor.current, { lat, lng }) > 30) anchor.current = { lat, lng };
  const { lat: aLat, lng: aLng } = anchor.current;
  const [attempt, setAttempt] = useState(0);
  const markerRef = useRef<HTMLElement & { position?: unknown; label?: string } | null>(null);
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
  // Progetti condivisi: one name badge per colleague connected now, kept for the map's life (personBadges).
  const peopleBadges = useRef(new Map<string, HTMLElement>());
  // The drawing's height over Google's ground, set by hand (− / +), per place.
  const [adj, setAdjState] = useState<Adjust>(NO_ADJUST);
  const [adjusting, setAdjusting] = useState(false);
  useEffect(() => { setAdjState(readAdjust(aLat, aLng)); setAdjusting(false); }, [aLat, aLng]);
  const half = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)) * 2) / 2;
  const nudge = (d: Partial<Adjust>) => {
    const next = { h: half(adj.h + (d.h ?? 0), LIFT_MIN, LIFT_MAX), n: half(adj.n + (d.n ?? 0), -SHIFT_MAX, SHIFT_MAX), e: half(adj.e + (d.e ?? 0), -SHIFT_MAX, SHIFT_MAX) };
    setAdjState(next); writeAdjust(aLat, aLng, next);
  };
  const resetAdj = () => { setAdjState(NO_ADJUST); writeAdjust(aLat, aLng, NO_ADJUST); };
  const adjKey = `${adj.h},${adj.n},${adj.e}`;
  // The map is built once per place: the drawn area and the simulation are laid over it by the next effect, so moving a
  // lever never reloads the photorealistic tiles nor resets the camera.
  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    setState("loading");
    if (!webglOk()) { setState("error"); return; }
    Promise.all([withTimeout(loadMaps3D(apiKey), 20_000), groundElevation(aLat, aLng)]).then(([lib, ground]) => {
      if (cancelled || !el) return;
      altitude.current = ground;
      libs.current = lib;
      const cam = frameCamera(anchor.current.lat, anchor.current.lng, el.clientHeight, ground);
      let map: Map3D;
      try {
        map = new lib.Map3DElement({ ...cam, mode: "HYBRID", gestureHandling: "GREEDY" }) as Map3D;
      } catch {
        map = new lib.Map3DElement({ ...cam, mode: "HYBRID" }) as Map3D;
      }
      map.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
      map.setAttribute("data-map-gestures", "");
      try {
        (map as any).gestureHandling = "GREEDY";
        map.setAttribute("gesture-handling", "GREEDY");
      } catch {}
      const fixShadow = () => {
        try {
          if (map.shadowRoot && !map.shadowRoot.querySelector("style[data-touch-fix]")) {
            const s = document.createElement("style");
            s.setAttribute("data-touch-fix", "");
            s.textContent = "* { touch-action: none !important; }";
            map.shadowRoot.appendChild(s);
          }
        } catch {}
      };
      fixShadow();
      setTimeout(fixShadow, 50);
      setTimeout(fixShadow, 300);
      // On top of the 3D mesh (roofs, trees) and drawn even when occluded: a ground pin in a street disappears behind buildings.
      const marker = new lib.Marker3DElement({ position: { lat: anchor.current.lat, lng: anchor.current.lng, altitude: 0 }, altitudeMode: "RELATIVE_TO_MESH", drawsWhenOccluded: true, label });
      map.append(marker);
      markerRef.current = marker;
      // Google's own red pin, like the 2D one.
      el.replaceChildren(map);
      mapRef.current = map;
      setState("ready");
      // A map that reports an error shows the notice with Riprova (a timer on gmp-steadychange was tried and dropped:
      // some builds never send it, and a working map was taken away).
      map.addEventListener("gmp-error", () => { if (!cancelled) setState("error"); });
    }).catch((err) => {
      console.error("[LocationMap3D] Failed to load 3D map:", err);
      if (!cancelled) setState("error");
    });
    return () => { cancelled = true; mapRef.current = null; markerRef.current = null; badges.current.clear(); peopleBadges.current.clear(); el?.replaceChildren(); };
  }, [aLat, aLng, apiKey, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  // The colleagues connected now to this project, their name where their phone's GPS puts them (as in 2D).
  const peopleKey = spotsKey(people);
  useEffect(() => {
    const map = mapRef.current, lib = libs.current;
    if (state !== "ready" || !map || !lib) return;
    personBadges(lib, map, peopleBadges.current, people);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, peopleKey]);
  // The pin follows the place (a GPS fix, a pin moved by hand) and its name without rebuilding the map.
  useEffect(() => {
    const m = markerRef.current;
    if (!m || state !== "ready") return;
    try { m.position = { lat, lng, altitude: 0 }; m.label = label; } catch { /* older build */ }
  }, [lat, lng, label, state]);
  // Following the phone: the camera glides to the pin once it has moved a couple of metres, keeping its tilt, range and
  // heading (the person's own turn and zoom), never rebuilding the map.
  const followedAt = useRef({ lat, lng });
  useEffect(() => {
    const map = mapRef.current;
    if (!follow || state !== "ready" || !map) return;
    if (metresBetween(followedAt.current, { lat, lng }) < 2) return;
    followedAt.current = { lat, lng };
    const c = map.center as { altitude?: number } | undefined;
    const endCamera = { center: { lat, lng, altitude: c?.altitude ?? altitude.current }, tilt: map.tilt, range: map.range, heading: map.heading } as Camera;
    try { if (map.flyCameraTo) map.flyCameraTo({ endCamera, durationMillis: 900 }); else (map as unknown as { center: unknown }).center = endCamera.center; } catch { /* older build */ }
  }, [lat, lng, follow, state]);
  // Three layers, each laid again only when its own content changes: the drawing (area, zones, ground shapes), the
  // shadows (they move with the simulation's clock) and the realistic models (kept on the map and only added or taken
  // away where they change). Before, any change — a minute of the clock, a save — took everything away and laid it again,
  // and the 3D seemed to reload.
  const baseSim = sim ? { ...sim, shadows: [] } : sim;
  const areaKey = JSON.stringify(area), simKey = JSON.stringify(baseSim);
  const shadowKey = sim?.shadows?.length ? JSON.stringify(sim.shadows) : "";
  const modelPool = useRef(new Map<string, HTMLElement>());
  // iPhone and iPad: plain shapes, or the light realistic models once turned on (Safari froze on the full ones).
  const models = useModels3D();
  useEffect(() => {
    const map = mapRef.current, lib = libs.current;
    if (state !== "ready" || !map || !lib) return;
    if (!lib.Polygon3DElement || area.length < 3) { misterBadges(lib, map, badges.current, null); return; }
    const floor = adj;
    const added: HTMLElement[] = [];
    // Laid a moment after the levers stop, so a slide does not rebuild the shapes at every step.
    const timer = window.setTimeout(() => {
      for (const node of build3DOverlay(lib, area, baseSim, floor, models !== "shapes" && !!lib.Model3DElement && !!sim)) { map.append(node); added.push(node); }
      misterBadges(lib, map, badges.current, sim, floor);
    }, 250);
    return () => { window.clearTimeout(timer); added.forEach((node) => node.remove()); };
  }, [state, areaKey, simKey, adjKey, models]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const map = mapRef.current, lib = libs.current;
    if (state !== "ready" || !map || !lib?.Polygon3DElement || area.length < 3 || !shadowKey) return;
    const added = build3DOverlay(lib, area, sim, adj, false, "shadows");
    added.forEach((node) => map.append(node));
    return () => added.forEach((node) => node.remove());
  }, [state, areaKey, shadowKey, adjKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sprinklers animated (asked "anima gli innaffiatoi"): per sprinkler, rings of spray leaving the head in an arc
  // and widening to its 3 m circle as they fade, and a jet of water turning round once every 6 s — a few shapes moved
  // about 10 times a second, only while the page is in front; still with reduced motion.
  const sprKey = sim?.kind === "piazza" ? JSON.stringify(sim.data.sprinklers ?? []) : "";
  useEffect(() => {
    const map = mapRef.current, lib = libs.current;
    if (state !== "ready" || !map || !lib?.Polygon3DElement || !sprKey || sim?.kind !== "piazza") return;
    const spots = sim.data.sprinklers ?? [];
    if (!spots.length) return;
    const floor = adj, k = 111_320, RINGS = 3;
    const at = (c: [number, number], dx: number, dz: number, h: number) => ({ lat: c[0] + floor.n / k - dz / k, lng: c[1] + (floor.e + dx) / (k * Math.cos((c[0] * Math.PI) / 180)), altitude: floor.h + h });
    const circle = (c: [number, number], r: number, h: number) => Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return at(c, Math.cos(a) * r, Math.sin(a) * r, h); });
    type El = HTMLElement & { outerCoordinates?: unknown; coordinates?: unknown; fillColor?: string; strokeColor?: string };
    const rings: Array<{ c: [number, number]; i: number; el: El }> = [], jets: Array<{ c: [number, number]; el: El }> = [];
    for (const c of spots as Array<[number, number]>) {
      for (let i = 0; i < RINGS; i++) {
        const el = new lib.Polygon3DElement({ altitudeMode: "RELATIVE_TO_GROUND", fillColor: "rgba(204,251,241,0.25)", strokeColor: "rgba(94,234,212,0.6)", strokeWidth: 1, drawsOccludedSegments: true }) as El;
        map.append(el); rings.push({ c, i, el });
      }
      if (lib.Polyline3DElement) {
        const el = new lib.Polyline3DElement({ altitudeMode: "RELATIVE_TO_GROUND", strokeColor: "rgba(224,255,250,0.85)", strokeWidth: 3, drawsOccludedSegments: true }) as El;
        map.append(el); jets.push({ c, el });
      }
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const paint = (t: number) => {
      for (const r of rings) {
        const p = ((t / 1600) + r.i / RINGS) % 1, rad = 0.3 + 2.7 * p, h = 0.15 + 0.9 * Math.sin(Math.PI * p);
        r.el.outerCoordinates = circle(r.c, rad, h);
        r.el.fillColor = `rgba(204,251,241,${(0.3 * (1 - p)).toFixed(2)})`;
        r.el.strokeColor = `rgba(94,234,212,${(0.7 * (1 - p)).toFixed(2)})`;
      }
      for (const j of jets) {
        const a = (t / 6000) * Math.PI * 2;
        j.el.coordinates = Array.from({ length: 9 }, (_, n) => { const q = n / 8, d = 2.9 * q; return at(j.c, Math.cos(a) * d, Math.sin(a) * d, 0.25 + 1.3 * q * (1 - q)); });
      }
    };
    paint(0);
    const id = still ? 0 : window.setInterval(() => { if (document.visibilityState === "visible") paint(performance.now()); }, 100);
    return () => { window.clearInterval(id); rings.forEach((r) => r.el.remove()); jets.forEach((j) => j.el.remove()); };
  }, [state, sprKey, adjKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // The realistic models (views/v10/g3d-models): each placed model is kept by what it is and where it stands, so a
  // change lays only the ones that changed and leaves the others where they are.
  useEffect(() => {
    const map = mapRef.current, lib = libs.current, Model = models === "shapes" ? undefined : lib?.Model3DElement;
    const pool = modelPool.current;
    if (state !== "ready" || !map || !Model || !sim || area.length < 3) { pool.forEach((n) => n.remove()); pool.clear(); return; }
    let cancelled = false;
    const floor = adj;
    const timer = window.setTimeout(() => {
      void import("@/views/v10/g3d-models").then(async ({ modelSpots }) => {
        if (cancelled) return;
        const lite = models === "lite";
        const built = modelSpots(sim, { lat: aLat, lng: aLng }, lite);
        const dLat = floor.n / 111_320, dLng = floor.e / (111_320 * Math.cos((aLat * Math.PI) / 180));
        // Every copy of a model in one model per ground tile (merged), on phones and computers alike: 20 trees load as
        // a few models instead of 20, and the high-poly beds stay light enough.
        // The ground's height under every copy first (Google's elevation, else the open one), so each merged group
        // follows the slope; without an answer the groups stay level as before.
        await loadHeights(built.spots.map((sp) => ({ lat: sp.lat, lng: sp.lng })).concat(built.merged().map((m) => ({ lat: m.lat, lng: m.lng })))).catch(() => undefined);
        if (cancelled) return;
        const spots = built.merged(heightAt).map((m) => ({ key: m.id, lat: m.lat, lng: m.lng, heading: 0, up: m.up, get: m.ensure }));
        const want = new Map(spots.map((sp) => [`${sp.key}@${(sp.lat + dLat).toFixed(7)},${(sp.lng + dLng).toFixed(7)},${sp.heading.toFixed(1)},${floor.h}`, sp]));
        for (const [id, node] of pool) if (!want.has(id)) { node.remove(); pool.delete(id); }
        for (const [id, sp] of want) {
          if (pool.has(id)) continue;
          void sp.get().then((src) => {
            if (cancelled || !src || pool.has(id)) return;
            try {
              const node = new Model({ src, position: { lat: sp.lat + dLat, lng: sp.lng + dLng, altitude: floor.h + (sp.up ?? 0) }, altitudeMode: "RELATIVE_TO_GROUND", orientation: { heading: sp.heading, tilt: 270, roll: 0 }, scale: 1 });
              node.style.pointerEvents = "none";
              node.style.touchAction = "none";
              node.setAttribute("data-map-gestures", "");
              map.append(node); pool.set(id, node);
            } catch { /* an older build without models */ }
          });
        }
      });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [state, areaKey, simKey, adjKey, models]); // eslint-disable-line react-hooks/exhaustive-deps
  // The models go with the map (a new place builds a new map).
  useEffect(() => () => { modelPool.current.forEach((n) => n.remove()); modelPool.current.clear(); }, [aLat, aLng, attempt]);
  // The panel grows when 3D opens (and on rotation): re-frame the place once the size settles.
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: number | undefined;
    let last = el.clientHeight, lastW = el.clientWidth;
    const observer = new ResizeObserver(() => {
      // Re-framed when the panel really changes (3D opening, the phone turned): not for the few pixels the page's bars
      // take or give back while scrolling, which put the camera back and looked like a reload.
      const w = el.clientWidth, h = el.clientHeight;
      if (Math.abs(w - lastW) < 4 && Math.abs(h - last) < Math.max(40, last * 0.15)) return;
      last = h; lastW = w;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => recenter(false), 120);
    });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  });
  // The photographic 3D refused or not drawing (key, quota, WebGL, loading): no simplified map (asked), a plain notice with
  // Riprova, which builds the photographic map again.
  if (rejected || state === "error") return (
    <div role="status" data-map-gestures="" className="grid h-full w-full touch-none place-items-center bg-lab-surface px-6 text-center">
      <div className="grid justify-items-center gap-3">
        <p className="text-sm font-semibold">Vista 3D fotografica non disponibile ora</p>
        <p className="max-w-xs text-xs text-muted-foreground">{rejected ? "Google non ha accettato la richiesta della mappa 3D: riprova più tardi o usa la 2D." : "La mappa 3D non si è caricata: può dipendere dalla rete o dal limite giornaliero delle mappe."}</p>
        {!rejected && <button type="button" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }} className="rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background">Riprova</button>}
      </div>
    </div>
  );
  return <div data-map-gestures="" className="relative h-full w-full overflow-hidden bg-lab-surface touch-none">
    {/* touch-none + data-map-gestures: drag, pinch and rotate belong to the 3D map, not to the page. */}
    <div ref={host} data-map-gestures="" style={{ filter: "var(--map-light-filter, none)" }} className="absolute inset-0 touch-none transition-[filter] duration-700 motion-reduce:transition-none" aria-label={`Vista 3D di ${label}`} />
    {/* Top-left: Google keeps its map-type thumbnail top-right, compass and fullscreen bottom-right, logo bottom-left. */}
    {state === "ready" && <button type="button" onClick={() => recenter(true)} aria-label="Ricentra la vista 3D sul punto" className="absolute left-2 top-2 grid size-9 place-items-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur"><Crosshair className="size-4" aria-hidden="true" /></button>}
    {/* The drawing's position by hand: Google's ground can lie under the photographed floor (the shapes slide when
        tilted) and the mesh can sit a little aside; raised and moved by half metres until it matches the piazza. */}
    {state === "ready" && area.length >= 3 && !adjusting && (
      <button type="button" onClick={() => setAdjusting(true)} aria-label={`Regola posizione del disegno${adj.h || adj.n || adj.e ? " (regolata)" : ""}`} title="Regola posizione"
        className="absolute left-2 top-12 grid size-9 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/15 backdrop-blur">
        <Move className="size-4" aria-hidden="true" />
        {(adj.h !== 0 || adj.n !== 0 || adj.e !== 0) && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-teal-300 ring-2 ring-black/60" aria-hidden="true" />}
      </button>
    )}
    {state === "ready" && area.length >= 3 && adjusting && (
      <div role="group" aria-label="Regola la posizione del disegno" className="absolute left-2 top-12 w-[12.5rem] space-y-2 rounded-2xl bg-black/65 p-2.5 text-white ring-1 ring-white/15 backdrop-blur">
        <div className="flex items-center justify-between text-[12px] font-semibold">
          <span>Regola posizione</span>
          <button type="button" onClick={() => setAdjusting(false)} aria-label="Chiudi" className="grid size-7 place-items-center rounded-full bg-white/10"><X className="size-3.5" aria-hidden="true" /></button>
        </div>
        <div className="flex items-center justify-between gap-1">
          <button type="button" onClick={() => nudge({ h: -ADJ_STEP })} disabled={adj.h <= LIFT_MIN} aria-label="Abbassa di mezzo metro" className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-40"><Minus className="size-4" aria-hidden="true" /></button>
          <span className="text-center text-[12px] leading-tight" aria-live="polite">Altezza<br /><span className="font-semibold tabular-nums">{metres(adj.h)}</span></span>
          <button type="button" onClick={() => nudge({ h: ADJ_STEP })} disabled={adj.h >= LIFT_MAX} aria-label="Alza di mezzo metro" className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-40"><Plus className="size-4" aria-hidden="true" /></button>
        </div>
        <div className="grid grid-cols-3 place-items-center gap-1">
          <span />
          <button type="button" onClick={() => nudge({ n: ADJ_STEP })} disabled={adj.n >= SHIFT_MAX} aria-label="Sposta a nord di mezzo metro" className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-40"><ArrowUp className="size-4" aria-hidden="true" /></button>
          <span />
          <button type="button" onClick={() => nudge({ e: -ADJ_STEP })} disabled={adj.e <= -SHIFT_MAX} aria-label="Sposta a ovest di mezzo metro" className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-40"><ArrowLeft className="size-4" aria-hidden="true" /></button>
          <Move className="size-4 text-white/50" aria-hidden="true" />
          <button type="button" onClick={() => nudge({ e: ADJ_STEP })} disabled={adj.e >= SHIFT_MAX} aria-label="Sposta a est di mezzo metro" className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-40"><ArrowRight className="size-4" aria-hidden="true" /></button>
          <span />
          <button type="button" onClick={() => nudge({ n: -ADJ_STEP })} disabled={adj.n <= -SHIFT_MAX} aria-label="Sposta a sud di mezzo metro" className="grid size-8 place-items-center rounded-full bg-white/10 disabled:opacity-40"><ArrowDown className="size-4" aria-hidden="true" /></button>
          <span />
        </div>
        <p className="text-center text-[11px] text-white/75 tabular-nums" aria-live="polite">Nord {metres(adj.n)} · Est {metres(adj.e)}</p>
        {(adj.h !== 0 || adj.n !== 0 || adj.e !== 0) && (
          <button type="button" onClick={resetAdj} className="mx-auto flex items-center gap-1 text-[12px] font-semibold underline decoration-white/30 underline-offset-4"><RotateCcw className="size-3.5" aria-hidden="true" />Rimetti com’era</button>
        )}
      </div>
    )}
    {state === "loading" && <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-label="Caricamento vista 3D" /></div>}
  </div>;
}

import * as THREE from "three";
import type { LabState } from "@/models/lab-store";
import { zonesOfArea, type DrawnArea } from "@/models/drawn-area";
import { piazzaLayout, vineLayout, TREE_RADIUS_M, type LatLng, type PiazzaLayout, type VineLayout } from "@/models/area-layout";
import { arObject, arToEn, enToAr, fromEN, insideRing, toEN, type Alignment, type ArObjectDef } from "@/models/ar-objects";
import { vineMixOf, zoneMixOf } from "@/models/vine-interventions";
import { objectMesh } from "@/views/ar-object-meshes";
import { realPergola } from "@/views/ar-pergola";
import { realBed } from "@/views/ar-bed";
import { realShadeNet } from "@/views/ar-shadenet";
import { realWindbreak } from "@/views/ar-windbreak";
import { realTree, wantsRealTree } from "@/views/ar-tree";
import { realDrip } from "@/views/ar-drip";

/**
 * The project's interventions as they stand on the map, put back in the real world in the AR view: once the AR floor
 * is aligned with the map (the two corners of the drawn area touched, else the phone's GPS and compass), every tree,
 * aiuola, pergola, misting pole and sprinkler of the piazza — or the vineyard's shade cloth, drip lines and windbreak —
 * stands on the very spot where the simulation laid it (the same layout as the 2D and 3D maps, models/area-layout).
 * Every element of the project, with no cap: trees are a few grown trees cloned, so many stay light enough.
 */
type XZ = { x: number; z: number };

/** An oriented box of a patch in AR metres: its longest edge sets the direction. */
export function rectOf(pts: XZ[]): { cx: number; cz: number; w: number; d: number; yaw: number } {
  let best = 0, ang = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!, l = Math.hypot(b.x - a.x, b.z - a.z);
    if (l > best) { best = l; ang = Math.atan2(b.z - a.z, b.x - a.x); }
  }
  const c = Math.cos(ang), s = Math.sin(ang);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) { const u = p.x * c + p.z * s, v = -p.x * s + p.z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return { cx: um * c - vm * s, cz: um * s + vm * c, w: u1 - u0, d: v1 - v0, yaw: -ang };
}

/** The extent of some points in a frame turned by yaw (the frame's u axis at angle −yaw). */
function extent(pts: XZ[], yaw: number) {
  const c = Math.cos(-yaw), s = Math.sin(-yaw);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const p of pts) { const u = p.x * c + p.z * s, v = -p.x * s + p.z * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  return { u0, u1, v0, v1, c, s };
}

/**
 * Shade patches joined into blocks: two patches belong together when, in the larger one's direction, their boxes
 * overlap or lie within 0,6 m; each block becomes one box turned like its largest patch.
 */
export function pergolaBlocks(patches: XZ[][], gap = 0.6, fits?: (corners: XZ[]) => boolean): Array<{ cx: number; cz: number; w: number; d: number; yaw: number }> {
  const rects = patches.map((p) => ({ pts: p, r: rectOf(p) }));
  const parent = rects.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const big = rects[i]!.r.w * rects[i]!.r.d >= rects[j]!.r.w * rects[j]!.r.d ? rects[i]! : rects[j]!;
    const A = extent(rects[i]!.pts, big.r.yaw), B = extent(rects[j]!.pts, big.r.yaw);
    if (A.u0 - gap <= B.u1 && B.u0 - gap <= A.u1 && A.v0 - gap <= B.v1 && B.v0 - gap <= A.v1) parent[find(i)] = find(j);
  }
  const groups = new Map<number, typeof rects>();
  rects.forEach((r, i) => { const k = find(i); groups.set(k, [...(groups.get(k) ?? []), r]); });
  return [...groups.values()].flatMap((list) => {
    const yaw = list.reduce((b, x) => (x.r.w * x.r.d > b.r.w * b.r.d ? x : b), list[0]!).r.yaw;
    const e = extent(list.flatMap((x) => x.pts), yaw);
    const back = (u: number, v: number): XZ => ({ x: u * e.c - v * e.s, z: u * e.s + v * e.c });
    // Joined only when the block fits where it may stand (its own zone on the map); else each patch stays its own.
    if (list.length > 1 && fits && !fits([back(e.u0, e.v0), back(e.u1, e.v0), back(e.u1, e.v1), back(e.u0, e.v1)])) return list.map((x) => x.r);
    const um = (e.u0 + e.u1) / 2, vm = (e.v0 + e.v1) / 2;
    return [{ cx: um * e.c - vm * e.s, cz: um * e.s + vm * e.c, w: e.u1 - e.u0, d: e.v1 - e.v0, yaw }];
  });
}

function flat(pts: XZ[], color: string, opacity: number, y: number): THREE.Mesh {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 }));
  m.position.y = y;
  return m;
}

/** How many elements of the project went in, said in the status line. */
export type PlanCount = { trees: number; pergolas: number; beds: number; misters: number; sprinklers: number; cloths: number; lines: number };

/** Whether nearby pergolas are joined into one, the person's choice kept on this phone (separate unless turned on). */
const MERGE_KEY = "mdt-ar-merge-pergola-v1";
export function mergePergolas(): boolean {
  try { return localStorage.getItem(MERGE_KEY) === "on"; } catch { return false; }
}
export function setMergePergolas(on: boolean) {
  try { localStorage.setItem(MERGE_KEY, on ? "on" : "off"); } catch { /* private mode */ }
}
/** Whether nearby aiuole are joined into one bed, kept on this phone like the pergolas' choice (separate by default). */
const MERGE_BEDS_KEY = "mdt-ar-merge-beds-v1";
export function mergeBeds(): boolean {
  try { return localStorage.getItem(MERGE_BEDS_KEY) === "on"; } catch { return false; }
}
export function setMergeBeds(on: boolean) {
  try { localStorage.setItem(MERGE_BEDS_KEY, on ? "on" : "off"); } catch { /* private mode */ }
}

export function buildPlan(kind: "urban" | "vineyard", lab: LabState, area: DrawnArea, origin: { lat: number; lng: number }, a: Alignment, merge = false, joinBeds = false): { group: THREE.Group; count: PlanCount } {
  const ar = (p: LatLng): XZ => enToAr(toEN(p[0], p[1], origin), a);
  const edits = area.edits ?? {}, inner = zonesOfArea(area);
  if (kind === "urban") {
    const u = lab.urban;
    // Pergolas and aiuole are joined only when the joined one lies whole in a zone of its kind drawn on the map.
    const inZone = (zk: "ombra" | "prato") => (corners: XZ[]) => {
      const pts = corners.map((c) => fromEN(arToEn(c, a), origin));
      return (area.zones ?? []).some((z) => z.kind === zk && z.ring.length >= 3 && pts.every(([lat, lng]) => insideRing(lat, lng, z.ring)));
    };
    return layoutPlan({ kind: "urban", L: piazzaLayout(area.ring, u.trees, u.permeable, u.shade, edits, inner, u.misters ?? 0, [], u.sprinklers ?? 0) }, ar, merge, false, joinBeds, { shade: inZone("ombra"), lawn: inZone("prato") });
  }
  const v = lab.vineyard, fallback = vineMixOf(v);
  return layoutPlan({ kind: "vineyard", L: vineLayout(area.ring, v.zones.map((z) => zoneMixOf(z, fallback)), edits, inner) }, ar, merge);
}

/**
 * The realistic objects of a layout already worked out (the map's own), placed through `at` — the AR's alignment, or
 * the open 3D map's local metres (x east, z south). Shared by the AR view and the map's 3D, so both show the same
 * pergolas, aiuole, misting poles, sprinklers, shade nets, hedges and drip lines.
 */
export function layoutPlan(
  plan: { kind: "urban"; L: PiazzaLayout | null } | { kind: "vineyard"; L: VineLayout | null },
  ar: (p: LatLng) => XZ, merge = false, far = false, joinBeds = false,
  fits?: { shade?: (corners: XZ[]) => boolean; lawn?: (corners: XZ[]) => boolean },
): { group: THREE.Group; count: PlanCount } {
  const g = new THREE.Group();
  g.name = "plan";
  const count: PlanCount = { trees: 0, pergolas: 0, beds: 0, misters: 0, sprinklers: 0, cloths: 0, lines: 0 };
  const put = (o: THREE.Object3D, p: XZ) => { o.position.set(p.x, 0, p.z); g.add(o); };
  if (plan.kind === "urban") {
    const L = plan.L;
    if (!L) return { group: g, count };
    // Aiuole: the realistic bed (stones, pebbles, soil, grass, flowers) sized and turned to each patch; a patch too thin
    // for one, the plain green ground.
    // With «Unisci» for the aiuole, the beds that touch or nearly touch (the grid's row strips of one block, a zone and
    // the strips round it) become one bed covering them all, like the pergolas.
    const lawn = L.patches.filter((q) => q.kind === "lawn").map((q) => q.ring.map(ar));
    const lawnPieces = joinBeds ? pergolaBlocks(lawn, 0.6, fits?.lawn).map((r) => ({ r, pts: null as XZ[] | null })) : lawn.map((pts) => ({ r: rectOf(pts), pts }));
    for (const { r, pts } of lawnPieces) {
      if (r.w >= 0.8 && r.d >= 0.8) {
        const bed = realBed({ w: r.w, d: r.d }, { far });
        bed.rotation.y = r.yaw;
        put(bed, { x: r.cx, z: r.cz });
      } else if (pts) g.add(flat(pts, "#4f8f3a", 0.72, 0.015));
      count.beds++;
    }
    // Pergolas: the shade patches that touch or nearly touch (the grid's row strips of one block, a zone and the strips
    // round it) are joined into one pergola covering them all, so a block of shade is one structure, not a row of them.
    // With «Pergolati separati» chosen, each shade patch is its own pergola as on the map.
    const shade = L.patches.filter((q) => q.kind === "shade").map((q) => q.ring.map(ar));
    for (const r of merge ? pergolaBlocks(shade, 0.6, fits?.shade) : shade.map(rectOf)) {
      if (r.w < 1 || r.d < 1) continue;
      const pg = realPergola({ w: r.w, d: r.d, h: 3.2 });
      pg.rotation.y = r.yaw;
      put(pg, { x: r.cx, z: r.cz });
      count.pergolas++;
    }
    const tree = arObject("urban", "albero");
    // Trees: the simple shape at once, the realistic tree in its place once grown (growPlan).
    for (const t of L.trees) { const o = objectMesh(tree); o.userData["planTree"] = true; put(o, ar(t)); count.trees++; }
    const mister = arObject("urban", "nebulizzatore");
    for (const m of L.misters) { put(objectMesh(mister), ar(m)); count.misters++; }
    const spr = arObject("urban", "innaffiatoio");
    for (const s of L.sprinklers) { put(objectMesh(spr), ar(s)); count.sprinklers++; }
  } else {
    const L = plan.L;
    if (!L) return { group: g, count };
    // Shade cloth: the realistic net on posts, sized and turned to each patch, else (too thin) a plain dark sheet.
    for (const p of L.patches) {
      if (p.kind !== "cloth") continue;
      const pts = p.ring.map(ar), r = rectOf(pts);
      if (r.w >= 1 && r.d >= 1) {
        const net = realShadeNet({ w: r.w, d: r.d, h: 2.2 }, { far });
        net.rotation.y = r.yaw;
        put(net, { x: r.cx, z: r.cz });
      } else g.add(flat(pts, "#1f2937", 0.55, 2.2));
      count.cloths++;
    }
    for (const l of L.lines) {
      const pts = l.line.map(ar);
      if (l.kind === "drip" || l.kind === "main") {
        // The realistic drip line or main pipe, lying on the soil (views/ar-drip).
        g.add(realDrip(pts, l.kind === "main"));
        count.lines++;
      } else if (l.kind === "wind") {
        // The windbreak: the realistic hedge along each piece of its line.
        const h = 1.8 + 2.2 * ((l.strength ?? 70) / 100);
        for (let i = 0; i + 1 < pts.length; i++) {
          const p0 = pts[i]!, p1 = pts[i + 1]!, len = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          if (len < 0.5) continue;
          const hedge = realWindbreak({ w: len, d: 1.6, h }, i + 1);
          hedge.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
          put(hedge, { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 });
        }
        count.lines++;
      }
    }
  }
  return { group: g, count };
}

/**
 * The trees the project's trees are drawn as: the species recognised with the AI camera in this flow (trees only, not
 * shrubs nor climbers), each at the size of a tree on the map — its crown about as wide as the 30 m² the simulation
 * counts, its height in the species' own proportion —, else the realistic oak of «Albero».
 */
export function planTreeDefs(plants: ReadonlyArray<ArObjectDef> = []): ArObjectDef[] {
  const w = TREE_RADIUS_M * 2;
  const trees = plants.filter((p) => p.plant && p.plant.form !== "shrub" && p.plant.form !== "vine" && wantsRealTree(p))
    .map((p) => ({ ...p, w, d: w, h: Math.max(4, Math.min(16, (p.h / Math.max(0.4, p.w)) * w)) }));
  return trees.length ? trees : [arObject("urban", "albero")];
}

/**
 * Grows the realistic trees and swaps them for the simple shapes: one grown per species recognised (else up to three
 * oaks, the same as «Albero» put by hand), taken in turn and cloned, each turned and sized a little differently, so
 * many trees stay light. alive() says whether the plan is still on screen (the levers may have rebuilt it meanwhile).
 */
export async function growPlan(group: THREE.Group, alive: () => boolean, onTree?: (o: THREE.Object3D) => void, plants: ReadonlyArray<ArObjectDef> = []): Promise<void> {
  const spots = group.children.filter((c) => c.userData["planTree"]);
  if (!spots.length) return;
  const defs = planTreeDefs(plants);
  const variants: THREE.Object3D[] = [];
  const n = defs.length > 1 ? Math.min(defs.length, spots.length) : Math.min(3, spots.length);
  for (let i = 0; i < n; i++) {
    const t = await realTree(defs[i % defs.length]!);
    if (!alive()) return;
    if (t) variants.push(t);
  }
  if (!variants.length) return;
  spots.forEach((spot, i) => {
    const tree = variants[i % variants.length]!.clone(true);
    tree.rotation.y = (i * 2.399) % (Math.PI * 2);
    tree.scale.multiplyScalar(0.9 + ((i * 0.37) % 0.2));
    (spot as THREE.Group).clear();
    spot.add(tree);
    onTree?.(tree);
  });
}

export function planText(c: PlanCount): string {
  const parts = [
    c.trees && `${c.trees} alberi`, c.pergolas && `${c.pergolas} pergolati`, c.beds && `${c.beds} aiuole`,
    c.misters && `${c.misters} nebulizzatori`, c.sprinklers && `${c.sprinklers} innaffiatoi`,
    c.cloths && `${c.cloths} teli`, c.lines && `${c.lines} linee`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "";
}

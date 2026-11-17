import * as THREE from "three";
import type { LabState } from "@/models/lab-store";
import { zonesOfArea, type DrawnArea } from "@/models/drawn-area";
import { piazzaLayout, vineLayout, type LatLng } from "@/models/area-layout";
import { arObject, enToAr, toEN, type Alignment } from "@/models/ar-objects";
import { vineMixOf, zoneMixOf } from "@/models/vine-interventions";
import { objectMesh } from "@/views/ar-object-meshes";
import { realPergola } from "@/views/ar-pergola";
import { realBed } from "@/views/ar-bed";
import { realShadeNet } from "@/views/ar-shadenet";
import { realWindbreak } from "@/views/ar-windbreak";
import { realTree } from "@/views/ar-tree";

/**
 * The project's interventions as they stand on the map, put back in the real world in the AR view: once the AR floor
 * is aligned with the map (the two corners of the drawn area touched, else the phone's GPS and compass), every tree,
 * aiuola, pergola, misting pole and sprinkler of the piazza — or the vineyard's shade cloth, drip lines and windbreak —
 * stands on the very spot where the simulation laid it (the same layout as the 2D and 3D maps, models/area-layout).
 * Light shapes, a few pergolas at most, so the phone keeps up.
 */
type XZ = { x: number; z: number };
const MAX_PERGOLAS = 6, MAX_TREES = 30, MAX_BEDS = 8, MAX_NETS = 6;

/** An oriented box of a patch in AR metres: its longest edge sets the direction. */
function rectOf(pts: XZ[]): { cx: number; cz: number; w: number; d: number; yaw: number } {
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

function flat(pts: XZ[], color: string, opacity: number, y: number): THREE.Mesh {
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, -p.z)));
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 }));
  m.position.y = y;
  return m;
}

function tube(pts: XZ[], radius: number, color: string, y: number): THREE.Mesh | null {
  if (pts.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, y, p.z)), false, "catmullrom", 0);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(2, pts.length * 4), radius, 6, false), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
}

/** How many elements of the project went in, said in the status line. */
export type PlanCount = { trees: number; pergolas: number; beds: number; misters: number; sprinklers: number; cloths: number; lines: number };

export function buildPlan(kind: "urban" | "vineyard", lab: LabState, area: DrawnArea, origin: { lat: number; lng: number }, a: Alignment): { group: THREE.Group; count: PlanCount } {
  const g = new THREE.Group();
  g.name = "plan";
  const count: PlanCount = { trees: 0, pergolas: 0, beds: 0, misters: 0, sprinklers: 0, cloths: 0, lines: 0 };
  const ar = (p: LatLng): XZ => enToAr(toEN(p[0], p[1], origin), a);
  const put = (o: THREE.Object3D, p: XZ) => { o.position.set(p.x, 0, p.z); g.add(o); };
  const edits = area.edits ?? {}, inner = zonesOfArea(area);
  if (kind === "urban") {
    const u = lab.urban;
    const L = piazzaLayout(area.ring, u.trees, u.permeable, u.shade, edits, inner, u.misters ?? 0, [], u.sprinklers ?? 0);
    if (!L) return { group: g, count };
    // Aiuole: the realistic bed (stones, pebbles, soil, grass, flowers) sized and turned to each patch; past a few,
    // or a patch too thin for one, the plain green ground.
    for (const p of L.patches) {
      if (p.kind !== "lawn") continue;
      const pts = p.ring.map(ar), r = rectOf(pts);
      if (count.beds < MAX_BEDS && r.w >= 0.8 && r.d >= 0.8) {
        const bed = realBed({ w: r.w, d: r.d });
        bed.rotation.y = r.yaw;
        put(bed, { x: r.cx, z: r.cz });
      } else g.add(flat(pts, "#4f8f3a", 0.72, 0.015));
      count.beds++;
    }
    for (const p of L.patches.filter((q) => q.kind === "shade").slice(0, MAX_PERGOLAS)) {
      const r = rectOf(p.ring.map(ar));
      if (r.w < 1 || r.d < 1) continue;
      const pg = realPergola({ w: r.w, d: r.d, h: 3.2 });
      pg.rotation.y = r.yaw;
      put(pg, { x: r.cx, z: r.cz });
      count.pergolas++;
    }
    const tree = arObject("urban", "albero");
    // Trees: the simple shape at once, the realistic tree in its place once grown (growPlan).
    for (const t of L.trees.slice(0, MAX_TREES)) { const o = objectMesh(tree); o.userData["planTree"] = true; put(o, ar(t)); count.trees++; }
    const mister = arObject("urban", "nebulizzatore");
    for (const m of L.misters) { put(objectMesh(mister), ar(m)); count.misters++; }
    const spr = arObject("urban", "innaffiatoio");
    for (const s of L.sprinklers) { put(objectMesh(spr), ar(s)); count.sprinklers++; }
  } else {
    const v = lab.vineyard, fallback = vineMixOf(v);
    const L = vineLayout(area.ring, v.zones.map((z) => zoneMixOf(z, fallback)), edits, inner);
    if (!L) return { group: g, count };
    // Shade cloth: the realistic net on posts, sized and turned to each patch (a few at most), else a plain dark sheet.
    for (const p of L.patches) {
      if (p.kind !== "cloth") continue;
      const pts = p.ring.map(ar), r = rectOf(pts);
      if (count.cloths < MAX_NETS && r.w >= 1 && r.d >= 1) {
        const net = realShadeNet({ w: r.w, d: r.d, h: 2.2 });
        net.rotation.y = r.yaw;
        put(net, { x: r.cx, z: r.cz });
      } else g.add(flat(pts, "#1f2937", 0.55, 2.2));
      count.cloths++;
    }
    for (const l of L.lines) {
      const pts = l.line.map(ar);
      if (l.kind === "drip" || l.kind === "main") {
        const t = tube(pts, l.kind === "main" ? 0.035 : 0.012, l.kind === "main" ? "#1d4ed8" : "#2563eb", 0.04);
        if (t) { g.add(t); count.lines++; }
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
 * Grows the realistic trees (EZ-Tree, the same as «Albero» put by hand) and swaps them for the simple shapes: a few
 * grown once and cloned, each turned and sized a little differently, so thirty trees stay light. alive() says
 * whether the plan is still on screen (the levers may have rebuilt it meanwhile).
 */
export async function growPlan(group: THREE.Group, alive: () => boolean, onTree?: (o: THREE.Object3D) => void): Promise<void> {
  const spots = group.children.filter((c) => c.userData["planTree"]);
  if (!spots.length) return;
  const def = arObject("urban", "albero");
  const variants: THREE.Object3D[] = [];
  for (let i = 0; i < Math.min(3, spots.length); i++) {
    const t = await realTree(def);
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

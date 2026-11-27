import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LatLng } from "@/models/area-layout";
import { arObject, recognisedPlants } from "@/models/ar-objects";
import { currentScans } from "@/models/ar-scan-log";
import { planTreeDefs, rectOf, xzAngleOf } from "@/views/ar-plan";
import { realPapillons } from "@/views/ar-papillon";
import { shadePatchBlocks, vineRowSegments } from "@/models/area-layout";
import { realBed } from "@/views/ar-bed";
import { realMister } from "@/views/ar-mister";
import { realSprinkler } from "@/views/ar-sprinkler";
import { realShadeNet } from "@/views/ar-shadenet";
import { realWindbreak } from "@/views/ar-windbreak";
import { realVine } from "@/views/ar-vine";
import { realDrip } from "@/views/ar-drip";
import { realTree } from "@/views/ar-tree";
import type { SimLayout } from "@/views/v10/map-area";

/**
 * The realistic models of the AR (pergolas with cloth and ivy, trees as the species recognised, aiuole, misting poles,
 * sprinklers, shade nets, hedges) for Google's photographic 3D, as <gmp-model-3d>: each model is built here with
 * three.js and handed over as a glTF binary in a data: URL — Google's renderer does not read blob: URLs. Models are
 * built once per kind and size (sizes rounded to half metres) and kept for the session; node transforms and instanced
 * meshes are baked into plain meshes (the map's renderer ignores node scales and instancing), points (mist, water
 * drops) are left out, textures are kept at most 512 px, and colours are lifted a little since the map renders models
 * darker than three.js. Each one is placed at its spot, turned by heading (clockwise from north) with tilt 270 (glTF's
 * up made the map's up).
 */
/** `up`: metres over the ground (the bed tiles a little lifted so the ground’s waves never cover them). */
export type ModelSpot = { key: string; lat: number; lng: number; heading: number; up?: number; x?: number; z?: number; yaw?: number };

const cache = new Map<string, Promise<string | null>>();

/** The light version (phones and tablets): the same high-poly models, pictures at most 256 px and fewer of them laid
 *  (bed tiles, vine and pipe pieces). */

function bake(root: THREE.Object3D) {
  const repl: Array<[THREE.Object3D, THREE.Object3D]> = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) {
      const geos: THREE.BufferGeometry[] = [];
      const m = new THREE.Matrix4(), col = new THREE.Color();
      // Every leaf, pebble and flower is kept (high-poly, as asked): the light version is lighter in pictures and in how
      // many models are laid, never in polygons.
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        const g = im.geometry.clone().applyMatrix4(m);
        if (im.instanceColor) {
          im.getColorAt(i, col);
          const n = g.attributes["position"]!.count, arr = new Float32Array(n * 3);
          for (let k = 0; k < n; k++) { arr[k * 3] = col.r; arr[k * 3 + 1] = col.g; arr[k * 3 + 2] = col.b; }
          g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
        }
        geos.push(g.index ? g.toNonIndexed() : g);
      }
      const merged = geos.length ? mergeGeometries(geos) : null;
      const src = Array.isArray(im.material) ? im.material[0]! : im.material;
      const mat = (src as THREE.Material).clone() as THREE.MeshStandardMaterial;
      if (im.instanceColor) { mat.vertexColors = true; mat.color?.set("#ffffff"); }
      const mesh = merged ? new THREE.Mesh(merged, mat) : new THREE.Group();
      mesh.position.copy(im.position); mesh.rotation.copy(im.rotation); mesh.scale.copy(im.scale);
      repl.push([im, mesh]);
    } else if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine) {
      repl.push([o, new THREE.Group()]);
    }
  });
  for (const [a, b] of repl) { a.parent?.add(b); a.parent?.remove(a); }
}

/** Waits for the texture images of an object: EZ-Tree's bark and leaves are loaded afterwards, their image still
 * missing when the tree is handed over (exported then, the leaves came out white). */
async function waitTextures(root: THREE.Object3D) {
  const maps: THREE.Texture[] = [];
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mm of (Array.isArray(m) ? m : m ? [m] : []) as THREE.MeshStandardMaterial[]) if (mm?.map) maps.push(mm.map);
  });
  const ready = (t: THREE.Texture) => ((t.image as { width?: number } | undefined)?.width ?? 0) > 0;
  for (let waited = 0; waited < 8000 && !maps.every(ready); waited += 150) await new Promise((r) => setTimeout(r, 150));
}

/** A drawn leaf on a transparent canvas: stands in for a leaves texture that never arrived. */
let leafTex: THREE.CanvasTexture | null = null;
function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.translate(64, 64);
  g.fillStyle = "#3e7a33";
  g.beginPath();
  g.moveTo(0, 60);
  g.bezierCurveTo(44, 28, 44, -30, 0, -60);
  g.bezierCurveTo(-44, -30, -44, 28, 0, 60);
  g.fill();
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

/** Drops the maps a model does not need on the map, and any whose image never arrived (the exporter stops on them). */
function trimMaps(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mm of (Array.isArray(m) ? m : m ? [m] : []) as THREE.MeshStandardMaterial[]) {
      for (const k of ["normalMap", "roughnessMap", "aoMap", "metalnessMap", "emissiveMap", "alphaMap"] as const) (mm as unknown as Record<string, unknown>)[k] = null;
      const im = mm.map?.image as { width?: number } | undefined;
      if (mm.map && !(im && (im.width ?? 0) > 0)) mm.map = mm.alphaTest > 0 || mm.transparent ? leafTexture() : null;
      mm.needsUpdate = true;
    }
  });
}

/** Colours and textures lifted a little: the map lights models darker than three.js does. */
function brighten(root: THREE.Object3D, k: number) {
  if (k <= 0) return;
  const done = new Map<THREE.Texture, THREE.Texture>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mm of (Array.isArray(m) ? m : m ? [m] : []) as THREE.MeshStandardMaterial[]) {
      const im = mm.map?.image as (HTMLImageElement | HTMLCanvasElement) | undefined;
      if (mm.map && im && im.width) {
        let t = done.get(mm.map);
        if (!t) {
          const c = document.createElement("canvas");
          c.width = im.width; c.height = im.height;
          const g = c.getContext("2d")!;
          g.filter = `brightness(${1 + k * 2})`;
          g.drawImage(im, 0, 0);
          t = new THREE.CanvasTexture(c);
          t.colorSpace = mm.map.colorSpace; t.wrapS = mm.map.wrapS; t.wrapT = mm.map.wrapT; t.repeat.copy(mm.map.repeat);
          done.set(mm.map, t);
        }
        mm.map = t;
      } else mm.color?.lerp(new THREE.Color("#ffffff"), Math.min(0.5, k));
      mm.needsUpdate = true;
    }
  });
}

/** Every node transform baked into its geometry: the map's renderer ignores node scales. */
function flatten(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const out = new THREE.Group();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) out.add(new THREE.Mesh(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mesh.material));
  });
  return out;
}

async function toDataUrl(obj: THREE.Object3D, glow: number, lite = false): Promise<string> {
  const prepared = obj.userData["prepared"] === true;
  if (!prepared) { await waitTextures(obj); trimMaps(obj); brighten(obj, glow); bake(obj); }
  const buf = (await new GLTFExporter().parseAsync(prepared ? obj : flatten(obj), { binary: true, maxTextureSize: lite ? 256 : 512 })) as ArrayBuffer;
  if (typeof FileReader !== "undefined") {
    const blob = new Blob([buf], { type: "model/gltf-binary" });
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:model/gltf-binary;base64,${btoa(bin)}`;
}

/**
 * A model's data URL, built once per key and kept on the device (IndexedDB "mdt-g3d-models", MODEL_STORE_V): building a
 * high-poly model and writing its GLB runs on the page's own thread and held a phone's 3D still for seconds, so it is
 * done once per device; the next openings lay the models straight away. Builds wait for an idle moment and run one at
 * a time, with a pause between them (longer on phones), so the map keeps moving under the finger.
 */
const MODEL_STORE_V = 1;
let dbP: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbP) return dbP;
  dbP = new Promise((resolve) => {
    try {
      const req = indexedDB.open("mdt-g3d-models", 1);
      req.onupgradeneeded = () => { req.result.createObjectStore("models"); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbP;
}
async function stored(id: string): Promise<string | null> {
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    try { const r = d.transaction("models").objectStore("models").get(`${MODEL_STORE_V}:${id}`); r.onsuccess = () => resolve((r.result as string | undefined) ?? null); r.onerror = () => resolve(null); } catch { resolve(null); }
  });
}
async function store(id: string, url: string) {
  const d = await db();
  try { d?.transaction("models", "readwrite").objectStore("models").put(url, `${MODEL_STORE_V}:${id}`); } catch { /* full or private: built again next time */ }
}
const idle = (ms: number) => new Promise<void>((r) => {
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  setTimeout(() => (ric ? ric(() => r(), { timeout: 2000 }) : r()), ms);
});
let modelQueue: Promise<unknown> = Promise.resolve();
export function modelUrl(key: string, build: () => THREE.Object3D | Promise<THREE.Object3D | null> | null, glow = 0.15, lite = false): Promise<string | null> {
  const id = lite ? `lite:${key}` : key;
  let p = cache.get(id);
  if (!p) {
    const make = async () => {
      const kept = await stored(id);
      if (kept) return kept;
      await idle(lite ? 250 : 60);
      const o = await Promise.resolve().then(build).catch(() => null);
      if (!o) return null;
      const url = await toDataUrl(o, glow, lite).catch(() => null);
      if (url) void store(id, url);
      return url;
    };
    p = modelQueue.then(make);
    modelQueue = p.catch(() => null);
    cache.set(id, p);
  }
  return p;
}

const half = (v: number) => Math.max(0.5, Math.round(v * 2) / 2);
// Pieces of vine row and of pipe, each a model at its own ground height. Fewer vine pieces than before (400 froze the
// photographic 3D on phones: it would not pan); the pipes in short pieces so a drip line follows a hilly ground.
const VINE_PIECE_M = 6, MAX_VINE_PIECES = 140, DRIP_PIECE_M = 1.5, MAX_DRIP_PIECES = 140;
/** The side of the bed tiles (m): small enough to follow a hilly ground, large enough to keep the models few. */
export const BED_TILE_M = 1;
// At most this many bed tiles in all: 2.000 m² of aiuole made 2.000 models and froze Google's 3D (it stopped drawing and
// would not pan). Past it the tiles grow, so a large lawn stays a few hundred models.
const MAX_BED_TILES = 160;
const deg = (yaw: number) => ((-yaw * 180) / Math.PI + 360) % 360;

/**
 * What to place for a simulation: every object of its layout with its model key, spot and heading, the models built
 * on demand by `ensure`. Trees are the species recognised in that flow (else the realistic oak, three variants).
 */
export function modelSpots(sim: SimLayout, origin: { lat: number; lng: number }, lite = false): { spots: ModelSpot[]; ensure: (key: string) => Promise<string | null>; merged: () => MergedSpot[] } {
  const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  const xz = ([lat, lng]: LatLng) => ({ x: (lng - origin.lng) * kx, z: -(lat - origin.lat) * 111_320 });
  const ll = (x: number, z: number) => ({ lat: origin.lat - z / 111_320, lng: origin.lng + x / kx });
  const spots: ModelSpot[] = [];
  const builders = new Map<string, () => THREE.Object3D | Promise<THREE.Object3D | null> | null>();
  const glows = new Map<string, number>();
  const add = (key: string, x: number, z: number, yaw: number, build: () => THREE.Object3D | Promise<THREE.Object3D | null> | null, glow = 0.15, up = 0) => {
    spots.push({ key, ...ll(x, z), heading: deg(yaw), ...(up ? { up } : {}), x, z, yaw });
    if (!builders.has(key)) { builders.set(key, build); glows.set(key, glow); }
  };
  if (sim.kind === "piazza") {
    const L = sim.data;
    // The shade strips joined into blocks first (shadePatchBlocks), so the sails stand along each block's edge; a
    // block or bed turned by hand on the map keeps that orientation.
    const shadeRings = shadePatchBlocks(L.patches.filter((p) => p.kind === "shade"));
    const lawnM2 = L.patches.filter((p) => p.kind === "lawn").reduce((sum, p) => { const r = rectOf(p.ring.map(xz), xzAngleOf(p.ring, p.angle, xz)); return sum + r.w * r.d; }, 0);
    const tileM = Math.max(BED_TILE_M, Math.sqrt(lawnM2 / (lite ? MAX_BED_TILES / 4 : MAX_BED_TILES)));
    for (const p of [...L.patches.filter((q) => q.kind !== "shade"), ...shadeRings.map((b) => ({ kind: "shade" as const, ring: b.ring, angle: b.angle }))]) {
      const r = rectOf(p.ring.map(xz), xzAngleOf(p.ring, p.angle, xz));
      if (p.kind === "lawn" && r.w >= 0.8 && r.d >= 0.8) {
        // Laid in small tiles, each at its own ground height: one flat bed many metres long sat at the ground's height
        // under its middle and the waves of a hilly ground covered it. The tiles of one size share one light model.
        const nx = Math.max(1, Math.ceil(r.w / tileM)), ny = Math.max(1, Math.ceil(r.d / tileM));
        const tw = r.w / nx, td = r.d / ny, kw = half(tw), kd = half(td);
        const ang = -r.yaw, c = Math.cos(ang), s = Math.sin(ang);
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const u = -r.w / 2 + (i + 0.5) * tw, v = -r.d / 2 + (j + 0.5) * td;
          add(`bedtile:${kw}x${kd}`, r.cx + u * c - v * s, r.cz + u * s + v * c, r.yaw, () => realBed({ w: kw, d: kd }, { tile: true }), 0.1, 0.25);
        }
      } else if (p.kind === "shade" && r.w >= 1 && r.d >= 1) {
        const w = half(r.w), d = half(r.d);
        const open = Math.round((sim.shadeOpen ?? 1) * 4) / 4;
        add(`pap:${w}x${d}:${open}`, r.cx, r.cz, r.yaw, () => realPapillons({ w, d, h: 3.2, open }, { far: true }), 0.12);
      }
    }
    const kind = "urban" as const;
    const defs = planTreeDefs(recognisedPlants(kind, currentScans(kind).map((s) => s.species)));
    const variants = defs.length > 1 ? defs.length : lite ? 1 : 3;
    L.trees.forEach((t, i) => {
      const def = defs[i % defs.length]!, v = i % variants;
      const p = xz(t);
      add(`tree:${def.plant?.scientificName ?? "oak"}:${v}`, p.x, p.z, (i * 2.399) % (Math.PI * 2), () => realTree(def), 0.15);
    });
    const mister = arObject("urban", "nebulizzatore"), spr = arObject("urban", "innaffiatoio");
    for (const m of L.misters) { const p = xz(m); add("mister", p.x, p.z, 0, () => realMister({ h: mister.h }), 0.25); }
    for (const s of L.sprinklers) { const p = xz(s); add("sprinkler", p.x, p.z, 0, () => realSprinkler({ w: spr.w }), 0.2); }
  } else {
    const L = sim.data;
    for (const p of L.patches) {
      if (p.kind !== "cloth") continue;
      const r = rectOf(p.ring.map(xz));
      if (r.w < 1 || r.d < 1) continue;
      const w = half(r.w), d = half(r.d);
      add(`net:${w}x${d}`, r.cx, r.cz, r.yaw, () => realShadeNet({ w, d, h: 2.2 }, { far: true }), 0.1);
    }
    // The vines: each row cut in pieces of at most VINE_PIECE_M (so a row follows a hilly ground and pieces of a length
    // share one model), each a realistic trained row — posts, wires, gnarled trunks, the leaf wall and the bunches —,
    // in a light version seen from afar; pieces grow longer while there would be more than MAX_VINE_PIECES.
    const rows = vineRowSegments(L.patches.filter((p) => p.kind === "zone").map((p) => p.ring), 160).map(([a, b]) => [xz(a), xz(b)] as const);
    const total = rows.reduce((t, [a, b]) => t + Math.hypot(b.x - a.x, b.z - a.z), 0);
    const piece = Math.max(VINE_PIECE_M, total / (lite ? MAX_VINE_PIECES / 3 : MAX_VINE_PIECES));
    let n = 0;
    for (const [a, b] of rows) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1) continue;
      // Whole metres: few lengths, so few models to build (each build is heavy and held the map still meanwhile).
      const k = Math.max(1, Math.round(len / piece)), w = Math.max(1, Math.round(len / k)), yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k, v = n++ % 2;
        add(`vine:${w}:${v}`, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, yaw, () => realVine({ h: 1.6, w }, v + 1, { far: true }), 0.12);
      }
    }
    // The irrigation: the drip lines (16 mm, drippers every 50 cm) and the main pipes (32 mm) as real pipes, cut in
    // short pieces each laid at its own ground height a few centimetres up, so they never run under the soil.
    const pipes = L.lines.filter((l) => l.kind === "drip" || l.kind === "main").flatMap((l) => {
      const pts = l.line.map(xz), out: Array<{ a: { x: number; z: number }; b: { x: number; z: number }; main: boolean }> = [];
      for (let i = 0; i + 1 < pts.length; i++) out.push({ a: pts[i]!, b: pts[i + 1]!, main: l.kind === "main" });
      return out;
    });
    const pipeLen = pipes.reduce((t, { a, b }) => t + Math.hypot(b.x - a.x, b.z - a.z), 0);
    const pipePiece = Math.max(DRIP_PIECE_M, pipeLen / (lite ? MAX_DRIP_PIECES / 3 : MAX_DRIP_PIECES));
    for (const { a, b, main } of pipes) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 0.3) continue;
      const k = Math.max(1, Math.round(len / pipePiece)), w = half(len / k), yaw = -Math.atan2(b.z - a.z, b.x - a.x);
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k;
        add(`pipe:${main ? "main" : "drip"}:${w}`, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, yaw, () => realDrip([{ x: -w / 2, z: 0 }, { x: w / 2, z: 0 }], main), 0.12, 0.06);
      }
    }
    for (const l of L.lines) {
      if (l.kind !== "wind") continue;
      const h = half(1.8 + 2.2 * ((l.strength ?? 70) / 100));
      const pts = l.line.map(xz);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!, b = pts[i + 1]!, len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 0.5) continue;
        const w = half(len);
        add(`hedge:${w}x${h}`, (a.x + b.x) / 2, (a.z + b.z) / 2, -Math.atan2(b.z - a.z, b.x - a.x), () => realWindbreak({ w, d: 1.6, h }, 1), 0.15);
      }
    }
  }
  return {
    spots,
    ensure: (key) => modelUrl(key, builders.get(key) ?? (() => null), glows.get(key) ?? 0.15, lite),
    merged: () => mergeSpots(spots, ll, builders, glows, lite),
  };
}

/**
 * Phones and tablets: every copy of one model laid as ONE model (asked "unisci per tipo"): its high-poly meshes are
 * written once in the GLB and placed by a node per copy (translation and turn, no scale), so 20 trees weigh about one
 * tree (1,2 MB) instead of 20 (24 MB) — Google's 3D froze loading them one by one. The group stands at the copies'
 * middle, at its ground height: on a slope a copy can sit a little over or under the ground.
 */
export type MergedSpot = { id: string; lat: number; lng: number; up: number; ensure: () => Promise<string | null> };
function mergeSpots(spots: ModelSpot[], ll: (x: number, z: number) => { lat: number; lng: number }, builders: Map<string, () => THREE.Object3D | Promise<THREE.Object3D | null> | null>, glows: Map<string, number>, lite: boolean): MergedSpot[] {
  const groups = new Map<string, ModelSpot[]>();
  for (const sp of spots) { const g = groups.get(sp.key); if (g) g.push(sp); else groups.set(sp.key, [sp]); }
  return [...groups].map(([key, list]) => {
    const cx = list.reduce((t, p) => t + (p.x ?? 0), 0) / list.length, cz = list.reduce((t, p) => t + (p.z ?? 0), 0) / list.length;
    const places = list.map((p) => ({ x: (p.x ?? 0) - cx, z: (p.z ?? 0) - cz, yaw: p.yaw ?? 0 }));
    const sig = places.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)},${p.yaw.toFixed(2)}`).join(";");
    let h = 0; for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) | 0;
    const id = `many:${key}:${list.length}:${h}`;
    const build = builders.get(key) ?? (() => null);
    return {
      id, ...ll(cx, cz), up: list[0]!.up ?? 0,
      ensure: () => modelUrl(id, async () => {
        const o = await Promise.resolve().then(build).catch(() => null);
        if (!o) return null;
        await waitTextures(o); trimMaps(o); brighten(o, glows.get(key) ?? 0.15); bake(o);
        const flat = flatten(o), root = new THREE.Group();
        root.userData["prepared"] = true;
        for (const pl of places) {
          const copy = new THREE.Group();
          copy.position.set(pl.x, 0, pl.z); copy.rotation.y = pl.yaw;
          for (const m of flat.children as THREE.Mesh[]) copy.add(new THREE.Mesh(m.geometry, m.material));
          root.add(copy);
        }
        return root;
      }, glows.get(key) ?? 0.15, lite),
    };
  });
}

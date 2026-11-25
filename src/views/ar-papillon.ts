import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { papillonUnits } from "@/models/area-layout";

/**
 * Triangular retractable shade sail on three outward-leaning warm wooden posts: one high corner and two lower, unequal
 * ones so the cloth twists; warm taupe ("tortora") cloth with concave catenary edges and a stitched hem; each post
 * guyed to a ground stake behind it. Retractable (`open` 0–1): the two lower tips run back along their lines to the
 * high corner, where the furled cloth hangs as a slim sleeve.
 */

type Mats = {
  wood: THREE.Material;
  satin: THREE.Material;
  cord: THREE.Material;
  wire: THREE.Material;
  fabric: THREE.Material;
  hem: THREE.Material;
  shadow: THREE.Material;
};

let sailTex: THREE.CanvasTexture | null = null;
let woodTex: THREE.CanvasTexture | null = null;

function isTestDom(): boolean {
  return typeof document === "undefined" || (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent));
}

function sailFabricTexture(): THREE.CanvasTexture | null {
  if (sailTex) return sailTex;
  if (isTestDom()) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  // Warm taupe / tortora canvas weave with subtle panel seams.
  g.fillStyle = "#aba294";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(75, 68, 58, 0.055)";
  for (let y = 0; y < 256; y += 3) g.fillRect(0, y, 256, 1);
  g.fillStyle = "rgba(255, 250, 242, 0.045)";
  for (let x = 0; x < 256; x += 3) g.fillRect(x, 0, 1, 256);
  for (let y = 64; y < 256; y += 64) {
    g.fillStyle = "rgba(78, 71, 61, 0.11)";
    g.fillRect(0, y, 256, 1.5);
  }
  sailTex = new THREE.CanvasTexture(c);
  sailTex.colorSpace = THREE.SRGBColorSpace;
  sailTex.wrapS = sailTex.wrapT = THREE.RepeatWrapping;
  return sailTex;
}

function timberTexture(): THREE.CanvasTexture | null {
  if (woodTex) return woodTex;
  if (isTestDom()) return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#aa5e27";
  g.fillRect(0, 0, 128, 256);
  for (let x = 0; x < 128; x += 3) {
    const d = Math.sin(x * 0.27) * 12 + Math.cos(x * 0.73) * 6;
    g.fillStyle = d > 0 ? `rgba(218, 146, 78, ${(d / 85).toFixed(3)})` : `rgba(92, 44, 14, ${(-d / 95).toFixed(3)})`;
    g.fillRect(x, 0, 2, 256);
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.colorSpace = THREE.SRGBColorSpace;
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  return woodTex;
}

function tube(points: THREE.Vector3[], r: number, radial = 4, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  const segs = Math.max(2, Math.min(24, Math.round(points.length * 0.9)));
  return new THREE.TubeGeometry(curve, segs, r, radial, closed);
}

/** A round rod (tapering r0 → r1) from a to b. */
function rodBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial = 6): THREE.BufferGeometry {
  const len = Math.max(1e-4, a.distanceTo(b));
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  geo.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  const up = Math.abs(dir.y) > 0.999 ? new THREE.Vector3(0, dir.y >= 0 ? 1 : -1, 0) : dir;
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** A square-section chamfered wooden post tapering slightly from foot to tip, oriented along foot → top. */
function woodPostBetween(foot: THREE.Vector3, top: THREE.Vector3, w0 = 0.082, w1 = 0.064): THREE.BufferGeometry {
  const len = Math.max(1e-4, foot.distanceTo(top));
  // 4-sided cylinder rotated 45° gives a crisp square timber beam with UV mapping along its length.
  const geo = new THREE.CylinderGeometry(w1 * 0.72, w0 * 0.72, len, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, len / 2, 0);
  const dir = top.clone().sub(foot).normalize();
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  geo.translate(foot.x, foot.y, foot.z);
  return geo;
}

/** Kept exported for compatibility. */
export function platformRadius(r: number): number {
  return Math.max(1.1, Math.min(1.7, r * 0.55));
}

type Put = (m: THREE.Material, g: THREE.BufferGeometry) => void;

/**
 * A triangular shade sail with concave catenary edges: `a` the high corner the sail retracts to, `b` and `c` the two
 * lower corners. Each edge curves in towards the middle (tips stay sharp), the cloth sags a little inside.
 */
function triSailGeo(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, open: number, far = false) {
  const N = far ? 10 : 16;
  const g = a.clone().add(b).add(c).multiplyScalar(1 / 3);
  const scoop = 0.16 * (0.4 + 0.6 * open);
  const span = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  const dip = Math.min(0.3, span * 0.035) * open;
  const at = (wa: number, wb: number, wc: number) => {
    const p = new THREE.Vector3(
      a.x * wa + b.x * wb + c.x * wc,
      a.y * wa + b.y * wb + c.y * wc,
      a.z * wa + b.z * wb + c.z * wc,
    );
    // Concave edges: points pulled towards the middle, most at an edge's centre, not at all at the tips.
    const pull = scoop * 4 * (wa * wb + wb * wc + wc * wa);
    p.x += (g.x - p.x) * pull;
    p.z += (g.z - p.z) * pull;
    p.y += (g.y - p.y) * pull * 0.5;
    p.y -= dip * 27 * wa * wb * wc;
    return p;
  };
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const id = (i: number, j: number) => (i * (2 * N + 3 - i)) / 2 + j;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) {
    const wb = i / N, wc = j / N, wa = 1 - wb - wc;
    const p = at(wa, wb, wc);
    pos.push(p.x, p.y, p.z);
    uvs.push(wb * 2, wc * 2);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) {
    idx.push(id(i, j), id(i + 1, j), id(i, j + 1));
    if (j < N - i - 1) idx.push(id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const edges: THREE.Vector3[][] = [[], [], []];
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    edges[0]!.push(at(1 - u, u, 0));
    edges[1]!.push(at(0, 1 - u, u));
    edges[2]!.push(at(u, 0, 1 - u));
  }
  return { geo, edges };
}

type PostNode = {
  foot: THREE.Vector3;
  top: THREE.Vector3;
  outX: number;
  outZ: number;
  guyed: boolean;
};

function buildWoodPost(p: PostNode, mats: Mats, out: THREE.Group, put: Put) {
  const { foot, top } = p;
  // Subtle concealed ground socket collar at soil/paving level + outward-leaning warm wooden post.
  const socket = new THREE.CylinderGeometry(0.052, 0.062, 0.05, 12);
  socket.translate(foot.x, 0.025, foot.z);
  put(mats.satin, socket);

  put(mats.wood, woodPostBetween(foot, top, 0.086, 0.066));

  // Small stainless eye-cap at the top of the wooden post.
  const dir = top.clone().sub(foot).normalize();
  const cap = new THREE.CylinderGeometry(0.036, 0.042, 0.035, 12);
  cap.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  cap.translate(top.x, top.y, top.z);
  put(mats.satin, cap);

  // External counterbalance guy wire from near the post top down to a discreet ground peg behind the post.
  if (p.guyed) {
    const guyTop = foot.clone().lerp(top, 0.96);
    const stake = new THREE.Vector3(foot.x + p.outX * 1.15, 0.02, foot.z + p.outZ * 1.15);
    put(mats.wire, rodBetween(stake, guyTop, 0.0045, 0.0045, 6));
    const peg = new THREE.CylinderGeometry(0.022, 0.016, 0.05, 8);
    peg.translate(stake.x, 0.025, stake.z);
    put(mats.satin, peg);
  }

  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.24, 20), mats.shadow);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(foot.x, 0.004, foot.z);
  out.add(disc);
}

type TriSail = { posts: [PostNode, PostNode, PostNode]; tips: [THREE.Vector3, THREE.Vector3, THREE.Vector3] };

/** The sail's moving part: cords from the posts to its three tips and the cloth, retracting towards the high post A. */
function buildTriSail(t: TriSail, mats: Mats, far = false): (open: number, putDyn: Put) => void {
  const [pA] = t.posts, [tA, tB, tC] = t.tips;
  const tops = t.posts.map((p) => p.foot.clone().lerp(p.top, 0.97));
  const seg = far ? 4 : 6;
  return (open: number, putDyn: Put) => {
    const o = Math.max(0, Math.min(1, open));
    putDyn(mats.cord, rodBetween(tops[0]!, tA, 0.006, 0.006, seg));
    if (o < 0.05) {
      // Furled: a slim sleeve of cloth hanging from the high corner along its post, the lines run back to B and C.
      const end = tA.clone().lerp(pA.foot, 0.22);
      putDyn(mats.fabric, tube([tA, tA.clone().lerp(end, 0.5), end], 0.07, far ? 5 : 8));
      putDyn(mats.wire, rodBetween(tA, tops[1]!, 0.004, 0.004, seg));
      putDyn(mats.wire, rodBetween(tA, tops[2]!, 0.004, 0.004, seg));
      return;
    }
    // The two lower tips slide out along their lines from the high corner to their posts.
    const b = tA.clone().lerp(tB, o), c = tA.clone().lerp(tC, o);
    putDyn(mats.cord, rodBetween(b, tops[1]!, 0.0055, 0.0055, seg));
    putDyn(mats.cord, rodBetween(c, tops[2]!, 0.0055, 0.0055, seg));
    if (!far) for (const tip of [tA, b, c]) {
      const ring = new THREE.TorusGeometry(0.026, 0.006, 6, 12);
      ring.translate(tip.x, tip.y, tip.z);
      putDyn(mats.satin, ring);
    }
    const sail = triSailGeo(tA, b, c, o, far);
    putDyn(mats.fabric, sail.geo);
    for (const edge of sail.edges) putDyn(mats.hem, tube(edge, 0.0085, far ? 3 : 4));
  };
}

const MERGE = (bins: Map<THREE.Material, THREE.BufferGeometry[]>, into: THREE.Group) => {
  for (const [mat, list] of bins) {
    const merged = mergeGeometries(list, false);
    if (merged) into.add(new THREE.Mesh(merged, mat));
  }
};

function binner(bins: Map<THREE.Material, THREE.BufferGeometry[]>): Put {
  return (m, g) => {
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const n = g.index ? g.toNonIndexed() : g;
    const pos = n.getAttribute("position")!;
    const c = new THREE.BufferGeometry();
    c.setAttribute("position", pos);
    c.setAttribute("normal", n.getAttribute("normal")!);
    const uv = n.getAttribute("uv");
    c.setAttribute("uv", uv ?? new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    const l = bins.get(m) ?? [];
    l.push(c);
    bins.set(m, l);
  };
}

/** How fast the sail unrolls or furls by itself: the whole way in about 4 s. */
const TRAVEL_S = 4;

type PapillonState = { open: number; built: number; target: number; build: (o: number) => void; onFrame?: (() => void) | undefined; last: number };

export function realPapillons(
  def: { w: number; d: number; h?: number; open?: number; joined?: boolean },
  opts: { far?: boolean } = {}
): THREE.Group {
  const out = new THREE.Group();
  const W = Math.max(1, def.w), D = Math.max(1, def.d), H = def.h ?? 3.2;
  const sTex = sailFabricTexture();
  const wTex = timberTexture();

  const mats: Mats = {
    wood: new THREE.MeshStandardMaterial({
      // A texture already carries the timber's colour: the base stays white so the two do not multiply into black.
      color: wTex ? "#ffffff" : "#b8682b",
      ...(wTex ? { map: wTex } : {}),
      emissive: "#522a0d",
      emissiveIntensity: 0.28,
      roughness: 0.64,
      metalness: 0.03,
    }),
    satin: new THREE.MeshStandardMaterial({ color: "#d5dae0", roughness: 0.28, metalness: 0.82 }),
    cord: new THREE.MeshStandardMaterial({ color: "#f0eee8", emissive: "#5e5c56", emissiveIntensity: 0.22, roughness: 0.55, metalness: 0.06 }),
    wire: new THREE.MeshStandardMaterial({ color: "#c2c7ce", roughness: 0.34, metalness: 0.72 }),
    fabric: new THREE.MeshStandardMaterial({
      color: sTex ? "#ffffff" : "#b8afa0",
      ...(sTex ? { map: sTex } : {}),
      // The light through the cloth: its shaded underside stays a warm tortora, never a dark brown.
      emissive: "#7a7266",
      emissiveIntensity: 0.6,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    hem: new THREE.MeshStandardMaterial({ color: "#9c9384", emissive: "#544e44", emissiveIntensity: 0.34, roughness: 0.8, metalness: 0 }),
    shadow: new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.2, depthWrite: false }),
  };

  // One triangular sail over the whole block, as big as its m²: the base along one side, the high corner in the middle
  // of the opposite one, each corner on a wooden post leaning outwards (the high one tallest, the two others lower and
  // unequal, so the cloth twists), every post guyed to a stake behind it.
  void papillonUnits;
  const inset = 0.32;
  const corners: Array<[number, number, number]> = [
    [0, D / 2 - inset, H + 0.3],
    [-W / 2 + inset, -D / 2 + inset, Math.max(2.2, H * 0.72)],
    [W / 2 - inset, -D / 2 + inset, Math.max(2.5, H * 0.86)],
  ];
  const gx = 0, gz = (corners[0]![1] + corners[1]![1] + corners[2]![1]) / 3;
  const lean = 0.5;
  const posts = corners.map(([x, z, h]) => {
    const dx = x - gx, dz = z - gz, l = Math.hypot(dx, dz) || 1;
    const ux = dx / l, uz = dz / l;
    return { foot: new THREE.Vector3(x, 0, z), top: new THREE.Vector3(x + ux * lean, h, z + uz * lean), outX: ux, outZ: uz, guyed: true } as PostNode;
  }) as [PostNode, PostNode, PostNode];
  const mid = new THREE.Vector3(gx, H * 0.7, gz);
  const tips = posts.map((p) => mid.clone().lerp(p.top, 0.93)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];

  const fixed = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const putFixed = binner(fixed);
  const far = Boolean(opts.far);
  for (const p of posts) buildWoodPost(p, mats, out, putFixed);
  const drawers = [buildTriSail({ posts, tips }, mats, far)];
  MERGE(fixed, out);

  const canopy = new THREE.Group();
  canopy.name = "papillon-canopy";
  out.add(canopy);
  const build = (o: number) => {
    for (const c of [...canopy.children]) { canopy.remove(c); (c as THREE.Mesh).geometry?.dispose(); }
    const bins = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const put = binner(bins);
    for (const draw of drawers) draw(o, put);
    MERGE(bins, canopy);
    const cast = out.children.some((c) => c !== canopy && (c as THREE.Mesh).isMesh && c.castShadow && !((c as THREE.Mesh).material as THREE.Material).transparent);
    for (const c of canopy.children) c.castShadow = cast;
  };
  const start = Math.max(0, Math.min(1, def.open ?? 1));
  build(start);
  const state: PapillonState = { open: start, built: start, target: start, build, last: 0 };
  out.userData["papillon"] = state;
  const driver = out.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined;
  if (driver) driver.onBeforeRender = () => stepPapillon(state);
  return out;
}

function stepPapillon(s: PapillonState) {
  const now = performance.now();
  const dt = s.last ? Math.min(0.1, (now - s.last) / 1000) : 0;
  s.last = now;
  if (s.open === s.target) return;
  const step = dt / TRAVEL_S;
  s.open = s.open < s.target ? Math.min(s.target, s.open + step) : Math.max(s.target, s.open - step);
  if (Math.abs(s.open - s.built) >= 0.025 || s.open === s.target) { s.build(s.open); s.built = s.open; }
  s.onFrame?.();
}

export function setShadeTarget(root: THREE.Object3D, target: number, onFrame?: () => void): number {
  let n = 0;
  const t = Math.max(0, Math.min(1, target));
  root.traverse((o) => {
    const s = o.userData?.["papillon"] as PapillonState | undefined;
    if (!s) return;
    if (Math.abs(s.target - t) > 1e-3 || Math.abs(s.open - t) > 1e-3) n++;
    s.target = t; s.onFrame = onFrame; s.last = 0;
    onFrame?.();
  });
  return n;
}

export function realShadeOpen(lat: number, lng: number, date = new Date()): number {
  const rad = Math.PI / 180;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = (date.getTime() - start) / 86400000;
  const decl = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (284 + day));
  const solar = date.getUTCHours() + date.getUTCMinutes() / 60 + lng / 15;
  const h = 15 * (solar - 12) * rad, phi = lat * rad;
  const sun = Math.asin(Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(h)) / rad;
  const m = date.getMonth();
  const winter = lat >= 0 ? m === 11 || m <= 1 : m >= 5 && m <= 7;
  return winter ? 0 : Math.max(0, Math.min(1, (sun - 5) / 10));
}

export function lightTarget(level: number, was: number): number {
  const on = 0.34, off = 0.2;
  if (level >= on) return 1;
  if (level <= off) return 0;
  return was;
}

export function arLightLevel(primary: number, ambient: number): number {
  return 1 - Math.exp(-(Math.max(0, primary) + Math.max(0, ambient) * 2) / 1.2);
}

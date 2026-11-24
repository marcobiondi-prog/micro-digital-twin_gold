import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { papillonUnits } from "@/models/area-layout";

/**
 * Four-point hyperbolic-paraboloid ("hypar" / saddle) retractable shade sail on two outward-leaning warm wooden posts
 * and two low ground-anchored guy lines (modelled directly after the user's reference photo):
 * - Two opposite diagonal corners soar high towards two square-chamfered chestnut/teak timber posts leaning outward
 *   (~18°), each post braced behind by a taut external guy wire to a ground stake, with a twin white V-cord bridle
 *   connecting the sail's corner D-ring to the post top.
 * - The other two opposite corners sweep dramatically downward (~1.35–1.45 m) with no posts, pulled taut by guy cords
 *   angled down to discreet ground stakes outside the footprint.
 * - The continuous warm taupe ("tortora") technical sail cloth has deep concave catenary edges on all four sides with
 *   a matching stitched webbing hem, subtle corner tension pleats, and casts the signature four-pointed star shadow.
 * - Retractable (`open` 0–1): as `open` decreases, the two low corners release along their guy lines and furl smoothly
 *   inward into a slim taut sleeve suspended between the two inclined wooden posts.
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
 * Continuous 4-point hyperbolic paraboloid ("hypar") saddle sail with deep concave catenary edges and subtle tension
 * pleats radiating from the pulled corners:
 * - c00, c11: high corners (attached via twin V-cords to the two inclined wooden posts)
 * - c10, c01: low corners (pulled down toward ground anchor stakes; retract smoothly toward the c00–c11 ridge as open → 0)
 */
function hyparSailGeo(
  c00: THREE.Vector3,
  c10: THREE.Vector3,
  c01: THREE.Vector3,
  c11: THREE.Vector3,
  open: number,
  far = false,
) {
  const N = far ? 10 : 14;
  const scoop = 0.215 * (0.3 + 0.7 * open); // deep concave catenary inward pull on all 4 edges
  const diagSpan = c00.distanceTo(c11);
  const ridgeDip = Math.min(0.32, diagSpan * 0.042) * open;

  const evalPt = (s: number, t: number) => {
    // Map (s, t) ∈ [0,1]^2 inward along smooth catenary arcs so all 4 edges curve deeply in while the 4 tips stay sharp.
    const sp = s + scoop * (0.5 - s) * 4 * t * (1 - t);
    const tp = t + scoop * (0.5 - t) * 4 * s * (1 - s);

    const w00 = (1 - sp) * (1 - tp);
    const w10 = sp * (1 - tp);
    const w01 = (1 - sp) * tp;
    const w11 = sp * tp;

    const p = new THREE.Vector3(
      c00.x * w00 + c10.x * w10 + c01.x * w01 + c11.x * w11,
      c00.y * w00 + c10.y * w10 + c01.y * w01 + c11.y * w11,
      c00.z * w00 + c10.z * w10 + c01.z * w01 + c11.z * w11,
    );

    // Gentle natural gravity sag across the interior so the high ridge sweeps in a smooth catenary arc.
    const interior = 16 * sp * (1 - sp) * tp * (1 - tp);
    const diagMid = 4 * ((sp + tp) * 0.5) * (1 - (sp + tp) * 0.5);
    p.y -= ridgeDip * (0.45 * diagMid * (1 - Math.abs(sp - tp)) + 0.55 * interior);

    // Subtle radial corner tension pleats (like the real taut fabric creases near the pulled corners in the photo).
    if (open > 0.35) {
      const cornerPleat = (du: number, dv: number) => {
        const dist = Math.hypot(du, dv);
        if (dist < 0.03 || dist > 0.65) return 0;
        const ang = Math.atan2(dv, du);
        const env = Math.sin(Math.PI * ((dist - 0.03) / 0.62)) ** 2 * (1 - dist / 0.7);
        return Math.sin(ang * 14) * 0.011 * env * open;
      };
      p.y += cornerPleat(sp, tp) + cornerPleat(1 - sp, 1 - tp) - 0.6 * (cornerPleat(1 - sp, tp) + cornerPleat(sp, 1 - tp));
    }
    return p;
  };

  const pos: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= N; j++) {
    const t = j / N;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const p = evalPt(s, t);
      pos.push(p.x, p.y, p.z);
      uvs.push(s * 2, t * 2);
    }
  }
  const idx: number[] = [];
  const row = N + 1;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      // Split along the high diagonal (a → d) so the hypar ridge is smooth and crease-free.
      idx.push(a, b, d, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const edges: THREE.Vector3[][] = [[], [], [], []];
  for (let k = 0; k <= N; k++) {
    const u = k / N;
    edges[0]!.push(evalPt(u, 0));
    edges[1]!.push(evalPt(1, u));
    edges[2]!.push(evalPt(1 - u, 1));
    edges[3]!.push(evalPt(0, 1 - u));
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

type SailBay = {
  postA: PostNode;
  postC: PostNode;
  lowBAnchor: THREE.Vector3; // ground stake for low corner B
  lowDAnchor: THREE.Vector3; // ground stake for low corner D
  lowBFull: THREE.Vector3;   // low sail tip B when 100% open
  lowDFull: THREE.Vector3;   // low sail tip D when 100% open
  hiAFull: THREE.Vector3;    // high sail tip A (inset from postA.top by twin V-cord bridle)
  hiCFull: THREE.Vector3;    // high sail tip C (inset from postC.top by twin V-cord bridle)
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

function buildSailBay(bay: SailBay, mats: Mats, putFixed: Put, far = false): (open: number, putDyn: Put) => void {
  const { postA, postC, lowBAnchor, lowDAnchor, lowBFull, lowDFull, hiAFull, hiCFull } = bay;

  // Discreet ground stakes at the two low guy-line anchor points.
  for (const st of [lowBAnchor, lowDAnchor]) {
    const peg = new THREE.CylinderGeometry(0.022, 0.016, 0.045, far ? 5 : 8);
    peg.translate(st.x, 0.022, st.z);
    putFixed(mats.satin, peg);
  }

  // Twin V-bridle anchor points near the top of each wooden post (top tip and 24 cm further down the post),
  // matching the two white tension cords visible at the top-left of the reference photo.
  const aTop1 = postA.foot.clone().lerp(postA.top, 0.985);
  const aTop2 = postA.foot.clone().lerp(postA.top, 0.91);
  const cTop1 = postC.foot.clone().lerp(postC.top, 0.985);
  const cTop2 = postC.foot.clone().lerp(postC.top, 0.91);

  const diagMid = hiAFull.clone().add(hiCFull).multiplyScalar(0.5);
  diagMid.y -= 0.14;

  return (open: number, putDyn: Put) => {
    const o = Math.max(0, Math.min(1, open));

    // Twin light V-bridle cords from each wooden post top to the high sail corners.
    putDyn(mats.cord, rodBetween(aTop1, hiAFull, 0.006, 0.006, far ? 4 : 6));
    putDyn(mats.cord, rodBetween(aTop2, hiAFull, 0.0055, 0.0055, far ? 4 : 6));
    putDyn(mats.cord, rodBetween(cTop1, hiCFull, 0.006, 0.006, far ? 4 : 6));
    putDyn(mats.cord, rodBetween(cTop2, hiCFull, 0.0055, 0.0055, far ? 4 : 6));

    // Stainless D-rings at the two high sail tips (skipped when viewed from afar).
    if (!far) {
      for (const tip of [hiAFull, hiCFull]) {
        const ring = new THREE.TorusGeometry(0.026, 0.006, 6, 12);
        ring.translate(tip.x, tip.y, tip.z);
        putDyn(mats.satin, ring);
      }
    }

    if (o < 0.05) {
      // Retracted / furled: a slim taut taupe fabric sleeve suspended in a gentle catenary between the two high tips,
      // with the two low guy cords slackened neatly to the ground stakes.
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        const p = hiAFull.clone().lerp(hiCFull, t);
        p.y -= 0.16 * 4 * t * (1 - t);
        pts.push(p);
      }
      putDyn(mats.fabric, tube(pts, 0.058, far ? 5 : 8));
      putDyn(mats.wire, rodBetween(diagMid, lowBAnchor, 0.004, 0.004, far ? 4 : 6));
      putDyn(mats.wire, rodBetween(diagMid, lowDAnchor, 0.004, 0.004, far ? 4 : 6));
      return;
    }

    // Current positions of the two retractable low corners: sweep smoothly from the high ridge down to their low taut points.
    const lowB = diagMid.clone().lerp(lowBFull, o);
    const lowD = diagMid.clone().lerp(lowDFull, o);

    // Taut guy cords from the two low sail tips down to their ground anchor stakes (as in the photo's lower corners).
    putDyn(mats.cord, rodBetween(lowB, lowBAnchor, 0.0055, 0.0055, far ? 4 : 6));
    putDyn(mats.cord, rodBetween(lowD, lowDAnchor, 0.0055, 0.0055, far ? 4 : 6));

    if (!far) {
      for (const tip of [lowB, lowD]) {
        const ring = new THREE.TorusGeometry(0.024, 0.0055, 6, 12);
        ring.translate(tip.x, tip.y, tip.z);
        putDyn(mats.satin, ring);
      }
    }

    // The continuous 4-point hypar saddle sail and its stitched matching-taupe catenary edge hem.
    const sail = hyparSailGeo(hiAFull, lowB, lowD, hiCFull, o, far);
    putDyn(mats.fabric, sail.geo);
    for (const edge of sail.edges) {
      putDyn(mats.hem, tube(edge, 0.0085, far ? 3 : 4));
    }
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

  const units = papillonUnits(W, D);
  const joinAll = Boolean(def.joined && units.length > 1);
  const sCell = Math.min(6, Math.max(1.6, Math.min(W, D)));
  const nx = joinAll ? 1 : Math.max(1, Math.round(W / sCell));
  const nz = joinAll ? 1 : Math.max(1, Math.round(D / sCell));
  const cw = W / nx, cd = D / nz;

  const posts = new Map<string, PostNode & { touches: number }>();
  const getPost = (ix: number, iz: number, topH: number, cx: number, cz: number, lean: number) => {
    const key = `${ix}:${iz}`;
    const gx = -W / 2 + cw * ix;
    const gz = -D / 2 + cd * iz;
    const footIn = joinAll ? 0.36 : 0.34;
    const footX = ix === 0 ? gx + footIn : ix === nx ? gx - footIn : gx;
    const footZ = iz === 0 ? gz + footIn : iz === nz ? gz - footIn : gz;
    const dx = gx - cx, dz = gz - cz, dl = Math.hypot(dx, dz) || 1;
    const ux = dx / dl, uz = dz / dl;
    let p = posts.get(key);
    if (!p) {
      p = {
        foot: new THREE.Vector3(footX, 0, footZ),
        top: new THREE.Vector3(footX + ux * lean, topH, footZ + uz * lean),
        outX: ux,
        outZ: uz,
        guyed: true,
        touches: 1,
      };
      posts.set(key, p);
    } else {
      p.outX += ux;
      p.outZ += uz;
      p.touches++;
      const ol = Math.hypot(p.outX, p.outZ);
      if (ol > 1e-3) {
        p.outX /= ol;
        p.outZ /= ol;
        p.top.set(p.foot.x + p.outX * (lean * 0.62), Math.max(p.top.y, topH), p.foot.z + p.outZ * (lean * 0.62));
      } else {
        p.top.set(p.foot.x, Math.max(p.top.y, topH), p.foot.z);
        p.guyed = false;
      }
    }
    return p;
  };

  const bays: SailBay[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = -W / 2 + cw * i, x1 = x0 + cw;
      const z0 = -D / 2 + cd * j, z1 = z0 + cd;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

      // Alternating mirror on grid indices so adjacent bays meet at the exact shared grid vertex (ix, iz).
      const iA = i % 2 === 0 ? i : i + 1;
      const iB = i % 2 === 0 ? i + 1 : i;
      const jA = j % 2 === 0 ? j : j + 1;
      const jB = j % 2 === 0 ? j + 1 : j;

      const xa = -W / 2 + cw * iA, xb = -W / 2 + cw * iB;
      const za = -D / 2 + cd * jA, zb = -D / 2 + cd * jB;

      // Strong outward lean (~18°, ~0.72 m horizontal lean over 3.3 m height) on the two wooden posts, just like the photo.
      const lean = joinAll ? 0.56 : 0.72;
      const postA = getPost(iA, jA, H + 0.28, cx, cz, lean);
      const postC = getPost(iB, jB, H + 0.08, cx, cz, lean);

      // High sail corners sit ~38 cm inside each post's top along the pull line (held by the twin white V-bridle cords).
      const centerHi = new THREE.Vector3(cx, H * 0.72, cz);
      const bridleFrac = joinAll ? 0.96 : 0.86;
      const hiAFull = centerHi.clone().lerp(postA.top, bridleFrac);
      const hiCFull = centerHi.clone().lerp(postC.top, bridleFrac);

      // Low corners sweep down low (~1.38–1.48 m) with taut guy cords continuing outward to ground stakes.
      const lowReachX = joinAll ? 0.94 : 0.88;
      const lowBFull = new THREE.Vector3(cx + (xb - cx) * lowReachX, Math.max(1.28, H * 0.43), cz + (za - cz) * lowReachX);
      const lowDFull = new THREE.Vector3(cx + (xa - cx) * lowReachX, Math.max(1.36, H * 0.46), cz + (zb - cz) * lowReachX);

      const stakeOut = joinAll ? 0.98 : 1.12;
      const lowBAnchor = new THREE.Vector3(cx + (xb - cx) * stakeOut, 0.02, cz + (za - cz) * stakeOut);
      const lowDAnchor = new THREE.Vector3(cx + (xa - cx) * stakeOut, 0.02, cz + (zb - cz) * stakeOut);

      bays.push({ postA, postC, lowBAnchor, lowDAnchor, lowBFull, lowDFull, hiAFull, hiCFull });
    }
  }

  const fixed = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const putFixed = binner(fixed);
  const far = Boolean(opts.far);
  for (const p of posts.values()) buildWoodPost(p, mats, out, putFixed);
  const drawers = bays.map((b) => buildSailBay(b, mats, putFixed, far));
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

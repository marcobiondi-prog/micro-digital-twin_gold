import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { papillonUnits } from "@/models/area-layout";

/**
 * Architectural motorised retractable shade sails ("vele ombreggianti retrattili") for the 3D maps, VR and AR views:
 * each bay stands on four inclined powder-coated anthracite steel masts with brushed stainless steel base flanges,
 * collars and masthead pulley blocks (perimeter wing masts guyed with stainless tie-rods). Across the diagonal between
 * the two main masts runs a motorised satin-steel furling roller boom with a tubular motor head and a warm underside
 * LED strip. Two asymmetric-height triangular hypar sail wings (one pulled up to the high corner mast, one sloped down
 * to the low runoff mast) unfurl from the roller boom along taut stainless traction cables, with concave catenary
 * leech edges, tailored seam lines, dark reinforced border webbing and stainless clew rings.
 *
 * `open` (0–1) controls how far the sails are unrolled: at 1 both wings are taut out to the corner masts; at 0.5 they
 * are half-furled with the traction cables visible; at 0 the fabric is neatly rolled around the diagonal boom.
 * Adjacent bays in a multi-sail block share corner masts cleanly without duplicate poles; `joined` spans the whole
 * footprint with one continuous retractable double-wing sail.
 */

type Mats = {
  pole: THREE.Material;
  satin: THREE.Material;
  cable: THREE.Material;
  stone: THREE.Material;
  fabric: THREE.Material;
  trim: THREE.Material;
  led: THREE.Material;
  shadow: THREE.Material;
};

let sailTex: THREE.CanvasTexture | null = null;
function sailFabricTexture(): THREE.CanvasTexture | null {
  if (sailTex) return sailTex;
  if (typeof document === "undefined" || (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent))) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#f5f0e6";
  g.fillRect(0, 0, 256, 256);
  // Subtle micro-perforated technical weave + stitched panel seams parallel to the roller boom (along u).
  g.fillStyle = "rgba(130, 120, 105, 0.055)";
  for (let y = 0; y < 256; y += 4) g.fillRect(0, y, 256, 1);
  g.fillStyle = "rgba(120, 110, 96, 0.045)";
  for (let x = 0; x < 256; x += 4) g.fillRect(x, 0, 1, 256);
  for (let y = 32; y < 256; y += 32) {
    g.fillStyle = "rgba(115, 106, 92, 0.16)";
    g.fillRect(0, y, 256, 2);
    g.fillStyle = "rgba(255, 255, 255, 0.35)";
    g.fillRect(0, y + 2, 256, 1);
  }
  sailTex = new THREE.CanvasTexture(c);
  sailTex.colorSpace = THREE.SRGBColorSpace;
  sailTex.wrapS = sailTex.wrapT = THREE.RepeatWrapping;
  return sailTex;
}

function tube(points: THREE.Vector3[], r: number, radial = 6, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return new THREE.TubeGeometry(curve, Math.max(2, points.length * 3), r, radial, closed);
}

/** A round rod (tapering r0 → r1) from a to b, always carrying UVs so it can merge into any material bin. */
function rodBetween(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, radial = 16): THREE.BufferGeometry {
  const len = Math.max(1e-4, a.distanceTo(b));
  const geo = new THREE.CylinderGeometry(r1, r0, len, radial, 1);
  geo.translate(0, len / 2, 0);
  const dir = b.clone().sub(a).normalize();
  const up = Math.abs(dir.y) > 0.999 ? new THREE.Vector3(0, dir.y >= 0 ? 1 : -1, 0) : dir;
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
  geo.translate(a.x, a.y, a.z);
  return geo;
}

/** Kept exported for backwards compatibility with any caller checking footprint sizing. */
export function platformRadius(r: number): number {
  return Math.max(1.1, Math.min(1.7, r * 0.55));
}

type Put = (m: THREE.Material, g: THREE.BufferGeometry) => void;

/**
 * One triangular retractable hypar sail wing with concave catenary leech edges:
 * - `p0 → p1`: luff attached along the diagonal roller boom
 * - `clew`: current movable corner pulled along the traction cable towards the masthead pulley
 */
function sailWingGeo(p0: THREE.Vector3, p1: THREE.Vector3, clew: THREE.Vector3, open: number) {
  const N = 14;
  const mid = p0.clone().add(p1).multiplyScalar(0.5);
  const span = p0.distanceTo(p1);
  const reach = mid.distanceTo(clew);
  // Inward directions in the wing's plane for the two concave catenary edges (p0→clew and p1→clew).
  const centroid = p0.clone().add(p1).add(clew).multiplyScalar(1 / 3);
  const inDir0 = centroid.clone().sub(p0.clone().add(clew).multiplyScalar(0.5));
  const inDir1 = centroid.clone().sub(p1.clone().add(clew).multiplyScalar(0.5));
  const catScale = Math.min(0.34, reach * 0.13) * (0.35 + 0.65 * open);
  if (inDir0.lengthSq() > 1e-6) inDir0.normalize().multiplyScalar(catScale);
  if (inDir1.lengthSq() > 1e-6) inDir1.normalize().multiplyScalar(catScale);
  const belly = Math.min(0.14, span * 0.022) * open;

  const evalPt = (a: number, b: number, c: number) => {
    // a at p0, b at p1, c at clew (a + b + c = 1).
    const p = new THREE.Vector3(
      p0.x * a + p1.x * b + clew.x * c,
      p0.y * a + p1.y * b + clew.y * c,
      p0.z * a + p1.z * b + clew.z * c,
    );
    // Concave catenary scoop along the two free leech edges (strongest at each edge, fading smoothly inward).
    const w0 = (1 - Math.min(1, b * 3.2)) ** 2 * (4 * a * c);
    const w1 = (1 - Math.min(1, a * 3.2)) ** 2 * (4 * b * c);
    p.addScaledVector(inDir0, w0);
    p.addScaledVector(inDir1, w1);
    // Slight hypar tension sag across the middle of the cloth.
    p.y -= belly * 4 * (a + b) * c * (1 - 0.35 * Math.abs(a - b));
    return p;
  };

  // Grid indexed by row i (0 at boom, N at clew) and column j (0..N-i from p0 to p1).
  const pos: number[] = [];
  const uvs: number[] = [];
  const rowStart: number[] = [];
  let vertCount = 0;
  for (let i = 0; i <= N; i++) {
    rowStart.push(vertCount);
    const c = i / N;
    const cols = N - i;
    for (let j = 0; j <= cols; j++) {
      const rem = 1 - c;
      const b = cols === 0 ? 0 : (j / cols) * rem;
      const a = rem - b;
      const p = evalPt(a, b, c);
      pos.push(p.x, p.y, p.z);
      // UVs: v runs from boom to clew (seam stripes parallel to the boom!), u runs along the boom.
      uvs.push(cols === 0 ? 0.5 : j / cols, c * Math.max(0.4, reach / 2.6));
      vertCount++;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < N; i++) {
    const r0 = rowStart[i]!, r1 = rowStart[i + 1]!;
    const cols = N - i;
    for (let j = 0; j < cols; j++) {
      idx.push(r0 + j, r0 + j + 1, r1 + j);
      if (j + 1 < cols) idx.push(r0 + j + 1, r1 + j + 1, r1 + j);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  const edge0: THREE.Vector3[] = [];
  const edge1: THREE.Vector3[] = [];
  for (let i = 0; i <= N; i++) {
    const c = i / N;
    edge0.push(evalPt(1 - c, 0, c));
    edge1.push(evalPt(0, 1 - c, c));
  }
  return { geo, edge0, edge1 };
}

type Role = "boomA" | "boomC" | "high" | "low";
type MastNode = {
  x: number;
  z: number;
  h: number;
  leanX: number;
  leanZ: number;
  touches: number;
  wingMast: boolean;
  top: THREE.Vector3;
  foot: THREE.Vector3;
};

type BaySpec = {
  mA: MastNode;
  mC: MastNode;
  mHi: MastNode;
  mLo: MastNode;
  joined: boolean;
};

function buildMast(m: MastNode, mats: Mats, out: THREE.Group, put: Put) {
  const { foot, top } = m;
  // Low stone plinth + brushed steel anchor flange with 4 anchor bolts.
  const plinth = new THREE.CylinderGeometry(0.17, 0.19, 0.035, 24);
  plinth.translate(foot.x, 0.0175, foot.z);
  put(mats.stone, plinth);

  const plate = new THREE.CylinderGeometry(0.135, 0.145, 0.02, 24);
  plate.translate(foot.x, 0.045, foot.z);
  put(mats.satin, plate);

  for (let k = 0; k < 4; k++) {
    const a = (Math.PI / 2) * k + Math.PI / 4;
    const bolt = new THREE.CylinderGeometry(0.011, 0.011, 0.018, 8);
    bolt.translate(foot.x + Math.cos(a) * 0.1, 0.06, foot.z + Math.sin(a) * 0.1);
    put(mats.pole, bolt);
  }

  // Tapered structural steel mast + brushed stainless collar + machined masthead cap.
  put(mats.pole, rodBetween(foot, top, 0.056, 0.039, 18));

  const dir = top.clone().sub(foot).normalize();
  const collarAt = foot.clone().lerp(top, 0.11);
  const collar = new THREE.CylinderGeometry(0.06, 0.062, 0.055, 20);
  collar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  collar.translate(collarAt.x, collarAt.y, collarAt.z);
  put(mats.satin, collar);

  const head = new THREE.CylinderGeometry(0.048, 0.044, 0.09, 18);
  head.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  head.translate(top.x, top.y, top.z);
  put(mats.satin, head);

  const cap = new THREE.SphereGeometry(0.044, 14, 10);
  cap.scale(1, 0.55, 1);
  cap.translate(top.x + dir.x * 0.045, top.y + dir.y * 0.045, top.z + dir.z * 0.045);
  put(mats.satin, cap);

  // Wing masts carry a stainless pulley block at the top and, on outer perimeter masts, an external stainless guy rod.
  if (m.wingMast) {
    const sheave = new THREE.CylinderGeometry(0.038, 0.038, 0.022, 16);
    sheave.rotateZ(Math.PI / 2);
    sheave.translate(top.x - m.leanX * 0.22, top.y - 0.02, top.z - m.leanZ * 0.22);
    put(mats.satin, sheave);

    // Cleat / tensioner 1.1 m up the mast for the return line.
    const cleatAt = foot.clone().lerp(top, 0.34);
    const cleat = new THREE.CylinderGeometry(0.048, 0.048, 0.04, 14);
    cleat.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    cleat.translate(cleatAt.x, cleatAt.y, cleatAt.z);
    put(mats.satin, cleat);

    if (m.touches === 1) {
      const len = Math.hypot(m.leanX, m.leanZ) || 1;
      const ux = m.leanX / len, uz = m.leanZ / len;
      const anchor = new THREE.Vector3(foot.x + ux * 0.36, 0.03, foot.z + uz * 0.36);
      const anchorPad = new THREE.CylinderGeometry(0.055, 0.065, 0.02, 14);
      anchorPad.translate(anchor.x, 0.02, anchor.z);
      put(mats.satin, anchorPad);
      const tieTop = foot.clone().lerp(top, 0.88);
      put(mats.cable, rodBetween(anchor, tieTop, 0.008, 0.008, 8));
      // Turnbuckle barrel near the bottom of the tie-rod.
      const tbA = anchor.clone().lerp(tieTop, 0.12), tbB = anchor.clone().lerp(tieTop, 0.24);
      put(mats.satin, rodBetween(tbA, tbB, 0.017, 0.017, 10));
    }
  }

  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), mats.shadow);
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(foot.x, 0.004, foot.z);
  out.add(disc);
}

function buildBayFixed(bay: BaySpec, mats: Mats, put: Put): (open: number, put: Put) => void {
  const { mA, mC, mHi, mLo, joined } = bay;
  const boomDir = mC.top.clone().sub(mA.top).normalize();
  const aEnd = mA.top.clone().addScaledVector(boomDir, 0.07);
  const cEnd = mC.top.clone().addScaledVector(boomDir, -0.07);

  // Diagonal furling roller boom (anodised satin axle + anthracite tubular motor head at A + end bracket at C).
  put(mats.satin, rodBetween(aEnd, cEnd, 0.032, 0.032, 16));
  const motorEnd = aEnd.clone().addScaledVector(boomDir, 0.34);
  put(mats.pole, rodBetween(mA.top, motorEnd, 0.052, 0.048, 16));
  const motorRing = motorEnd.clone().addScaledVector(boomDir, 0.025);
  put(mats.satin, rodBetween(motorEnd, motorRing, 0.051, 0.051, 16));
  const idlerStart = cEnd.clone().addScaledVector(boomDir, -0.1);
  put(mats.pole, rodBetween(idlerStart, mC.top, 0.045, 0.048, 16));

  // Slim warm LED profile suspended just below the middle of the boom.
  const ledA = aEnd.clone().lerp(cEnd, 0.16); ledA.y -= 0.058;
  const ledB = aEnd.clone().lerp(cEnd, 0.84); ledB.y -= 0.058;
  put(mats.pole, rodBetween(ledA, ledB, 0.014, 0.014, 10));
  const ledGlowA = ledA.clone(); ledGlowA.y -= 0.012;
  const ledGlowB = ledB.clone(); ledGlowB.y -= 0.012;
  put(mats.led, rodBetween(ledGlowA, ledGlowB, 0.009, 0.009, 8));

  // Attachment span along the roller boom where the sail fabric rolls up.
  const luffA = aEnd.clone().addScaledVector(boomDir, 0.28);
  const luffC = cEnd.clone().addScaledVector(boomDir, -0.12);
  const boomMid = luffA.clone().add(luffC).multiplyScalar(0.5);

  const pulleyHi = mHi.top.clone(); pulleyHi.y -= 0.02;
  const pulleyLo = mLo.top.clone(); pulleyLo.y -= 0.02;
  const cleatHi = mHi.foot.clone().lerp(mHi.top, 0.34);
  const cleatLo = mLo.foot.clone().lerp(mLo.top, 0.34);

  // Full-open clew reach: 96% when joined so the canopy spans almost mast-to-mast; 90% on individual bays so the
  // stainless turnbuckle/traction cable gap to each corner pulley reads crisp and realistic.
  const maxReach = joined ? 0.965 : 0.9;
  const fullHi = boomMid.clone().lerp(pulleyHi, maxReach);
  const fullLo = boomMid.clone().lerp(pulleyLo, maxReach);

  return (open: number, putDyn: Put) => {
    const o = Math.max(0, Math.min(1, open));
    // Fabric roll wrapped around the diagonal boom: thick when retracted (o = 0), slim when unrolled (o = 1).
    const rRoll = 0.036 + 0.048 * (1 - o);
    putDyn(mats.fabric, rodBetween(luffA, luffC, rRoll, rRoll, 20));
    // Dark webbing end-bands on the rolled fabric.
    const bandA2 = luffA.clone().addScaledVector(boomDir, 0.035);
    const bandC1 = luffC.clone().addScaledVector(boomDir, -0.035);
    putDyn(mats.trim, rodBetween(luffA, bandA2, rRoll + 0.004, rRoll + 0.004, 16));
    putDyn(mats.trim, rodBetween(bandC1, luffC, rRoll + 0.004, rRoll + 0.004, 16));

    const wings: Array<{ full: THREE.Vector3; pulley: THREE.Vector3; cleat: THREE.Vector3 }> = [
      { full: fullHi, pulley: pulleyHi, cleat: cleatHi },
      { full: fullLo, pulley: pulleyLo, cleat: cleatLo },
    ];

    for (const w of wings) {
      const toPulley = w.pulley.clone().sub(boomMid);
      const sideDir = toPulley.lengthSq() > 1e-6 ? toPulley.clone().normalize() : new THREE.Vector3(1, 0, 0);
      // Retracted clew sits right against the rolled cylinder on the boom; opening pulls it smoothly along the cable.
      const parked = boomMid.clone().addScaledVector(sideDir, rRoll + 0.035);
      const clew = parked.clone().lerp(w.full, o);

      // Taut stainless traction cable from the sail's clew ring to the masthead pulley, plus return line down the mast.
      putDyn(mats.cable, rodBetween(clew, w.pulley, 0.0065, 0.0065, 8));
      putDyn(mats.cable, rodBetween(w.pulley, w.cleat, 0.005, 0.005, 6));

      // Stainless clew ring / corner hardware.
      const ring = new THREE.TorusGeometry(0.032, 0.008, 8, 18);
      ring.rotateX(Math.PI / 2);
      ring.translate(clew.x, clew.y, clew.z);
      putDyn(mats.satin, ring);

      if (o >= 0.04) {
        const p0 = luffA.clone().addScaledVector(sideDir, rRoll * 0.72);
        const p1 = luffC.clone().addScaledVector(sideDir, rRoll * 0.72);
        const wing = sailWingGeo(p0, p1, clew, o);
        putDyn(mats.fabric, wing.geo);
        // Dark reinforced perimeter webbing along both concave catenary leech edges.
        putDyn(mats.trim, tube(wing.edge0, 0.011, 5));
        putDyn(mats.trim, tube(wing.edge1, 0.011, 5));
        // Triangular stainless corner reinforcement patch at the clew.
        const cPatch = clew.clone().lerp(boomMid, Math.min(0.18, 0.09 / Math.max(0.12, o)));
        putDyn(mats.satin, rodBetween(cPatch, clew, 0.022, 0.012, 8));
      }
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

export function realPapillons(def: { w: number; d: number; h?: number; open?: number; joined?: boolean }): THREE.Group {
  const out = new THREE.Group();
  const W = Math.max(1, def.w), D = Math.max(1, def.d), H = def.h ?? 3.2;
  const tex = sailFabricTexture();
  const mats: Mats = {
    pole: new THREE.MeshStandardMaterial({ color: "#262a30", roughness: 0.36, metalness: 0.62 }),
    satin: new THREE.MeshStandardMaterial({ color: "#d0d5dc", roughness: 0.24, metalness: 0.88 }),
    cable: new THREE.MeshStandardMaterial({ color: "#b6bec7", roughness: 0.28, metalness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: "#cdc6ba", roughness: 0.88 }),
    fabric: new THREE.MeshStandardMaterial({
      color: "#f6f1e7",
      ...(tex ? { map: tex } : {}),
      emissive: "#8c8475",
      emissiveIntensity: 0.45,
      roughness: 0.78,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    trim: new THREE.MeshStandardMaterial({ color: "#353940", roughness: 0.58 }),
    led: new THREE.MeshStandardMaterial({ color: "#fff3d6", emissive: "#ffd39a", emissiveIntensity: 1.05, roughness: 0.38 }),
    shadow: new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.24, depthWrite: false }),
  };

  const units = papillonUnits(W, D);
  const joinAll = Boolean(def.joined && units.length > 1);
  const sCell = Math.min(6, Math.max(1.6, Math.min(W, D)));
  const nx = joinAll ? 1 : Math.max(1, Math.round(W / sCell));
  const nz = joinAll ? 1 : Math.max(1, Math.round(D / sCell));
  const inset = joinAll ? 0.06 : Math.min(0.14, Math.min(W, D) * 0.04);
  const xStart = -W / 2 + inset, xSpan = W - inset * 2;
  const zStart = -D / 2 + inset, zSpan = D - inset * 2;
  const cw = xSpan / nx, cd = zSpan / nz;

  const hOf = (role: Role) =>
    role === "high" ? H + 0.46 : role === "low" ? Math.max(2.25, H - 0.54) : H + 0.12;

  const masts = new Map<string, MastNode>();
  const getMast = (x: number, z: number, role: Role, cx: number, cz: number): MastNode => {
    const key = `${Math.round(x * 100)}:${Math.round(z * 100)}`;
    const dx = x - cx, dz = z - cz, dl = Math.hypot(dx, dz) || 1;
    let m = masts.get(key);
    if (!m) {
      m = {
        x,
        z,
        h: hOf(role),
        leanX: dx / dl,
        leanZ: dz / dl,
        touches: 1,
        wingMast: role === "high" || role === "low",
        foot: new THREE.Vector3(x, 0.045, z),
        top: new THREE.Vector3(x, hOf(role), z),
      };
      masts.set(key, m);
    } else {
      m.leanX += dx / dl;
      m.leanZ += dz / dl;
      m.touches++;
      if (role === "high" || role === "low") m.wingMast = true;
    }
    return m;
  };

  const rawBays: Array<{ mA: MastNode; mC: MastNode; mHi: MastNode; mLo: MastNode; joined: boolean }> = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x0 = xStart + cw * i, x1 = x0 + cw;
      const z0 = zStart + cd * j, z1 = z0 + cd;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // Alternating mirror across adjacent bays so shared corner masts always agree on role and height.
      const xa = i % 2 === 0 ? x0 : x1, xb = i % 2 === 0 ? x1 : x0;
      const za = j % 2 === 0 ? z0 : z1, zb = j % 2 === 0 ? z1 : z0;
      rawBays.push({
        mA: getMast(xa, za, "boomA", cx, cz),
        mC: getMast(xb, zb, "boomC", cx, cz),
        mHi: getMast(xa, zb, "high", cx, cz),
        mLo: getMast(xb, za, "low", cx, cz),
        joined: joinAll,
      });
    }
  }

  // Finalise outward masthead lean once all touching bays are registered.
  for (const m of masts.values()) {
    const ll = Math.hypot(m.leanX, m.leanZ);
    const amp = joinAll ? 0.12 : m.touches === 1 ? 0.22 : 0.1;
    const ox = ll > 1e-4 ? (m.leanX / ll) * amp : 0;
    const oz = ll > 1e-4 ? (m.leanZ / ll) * amp : 0;
    m.leanX = ll > 1e-4 ? m.leanX / ll : 0;
    m.leanZ = ll > 1e-4 ? m.leanZ / ll : 0;
    m.top.set(m.x + ox, m.h, m.z + oz);
  }

  const fixed = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const putFixed = binner(fixed);
  for (const m of masts.values()) buildMast(m, mats, out, putFixed);
  const drawers = rawBays.map((b) => buildBayFixed(b, mats, putFixed));
  MERGE(fixed, out);

  // Dynamic group rebuilt smoothly as `open` changes.
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

/**
 * Makes every sail under `root` unroll or furl towards `target` (0 retracted – 1 open), moving smoothly
 * (about 4 s the whole way). onFrame is called at each step (the map's 3D asks for a repaint there).
 */
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

/** The sails' openness under the real sun now over (lat, lng): open from 15° of sun, closed under 5° and in winter. */
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

/**
 * How much light there is, 0 (dark) – 1 (bright), turned into the sails' openness with some hysteresis: they open
 * above `on` and close below `off`, so a shadow passing by does not make them flap. `was` is the last target.
 */
export function lightTarget(level: number, was: number): number {
  const on = 0.34, off = 0.2;
  if (level >= on) return 1;
  if (level <= off) return 0;
  return was;
}
/** ARCore's light estimate (primary light and ambient, HDR) as a 0–1 light level. */
export function arLightLevel(primary: number, ambient: number): number {
  return 1 - Math.exp(-(Math.max(0, primary) + Math.max(0, ambient) * 2) / 1.2);
}

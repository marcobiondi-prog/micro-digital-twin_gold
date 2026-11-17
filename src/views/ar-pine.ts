import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The stone pine (Pinus pinea, "pino domestico") for the AR view, built in code with nothing to download: the
 * procedural trees cannot make its shape. A tall bare trunk with a slight lean and red-brown plate bark (a canvas drawn
 * once), forking near the top into a few upward limbs that open into a broad, flat "umbrella" crown — a dome much wider
 * than tall, flat underneath, made of needle tufts (alpha-tested crossed planes, instanced, each its own green) over a
 * dark inner mass so it never looks see-through. Stands on y = 0, h tall, its crown w wide. A seed makes each pine a
 * little different (lean, limbs, tufts) while staying the same on every phone for the same seed.
 */

let barkTex: THREE.Texture | null = null;
let tuftTex: THREE.Texture | null = null;

export function rng(seed: number) {
  let s = (Math.abs(Math.round(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Plate bark: red-brown plates split by dark grey fissures, running up the trunk. */
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 512;
  const g = c.getContext("2d")!;
  const r = rng(31);
  g.fillStyle = "#4a3a32";
  g.fillRect(0, 0, c.width, c.height);
  // Plates: irregular rounded rectangles, longer than wide, in reddish browns and greys.
  for (let y = -20; y < c.height; y += 34) {
    for (let x = -10; x < c.width; x += 40) {
      const w = 26 + r() * 22, h = 40 + r() * 34, ox = (r() - 0.5) * 14, oy = (r() - 0.5) * 18;
      const hue = r();
      g.fillStyle = hue < 0.55 ? `rgb(${128 + r() * 40},${78 + r() * 26},${56 + r() * 18})` : `rgb(${110 + r() * 30},${100 + r() * 24},${92 + r() * 20})`;
      g.beginPath();
      g.roundRect(x + ox, y + oy, w, h, 6 + r() * 8);
      g.fill();
      // A lighter flake on some plates.
      if (r() < 0.4) { g.fillStyle = `rgba(214,150,110,${0.25 + r() * 0.3})`; g.fillRect(x + ox + 4, y + oy + 6, w * 0.5, h * 0.4); }
    }
  }
  // Fine dark fissures running up.
  g.strokeStyle = "rgba(30,22,18,0.55)";
  for (let i = 0; i < 24; i++) {
    g.lineWidth = 1 + r() * 2;
    g.beginPath();
    let x = r() * c.width;
    g.moveTo(x, 0);
    for (let y = 0; y <= c.height; y += 16) { x += (r() - 0.5) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A tuft of needles: pairs of long thin needles fanning out of a twig, white so each instance tints it. */
function tuftTexture() {
  if (tuftTex) return tuftTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(77);
  g.lineCap = "round";
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.3;
    const len = 34 + r() * 26, x0 = 64 + (r() - 0.5) * 10, y0 = 92 + (r() - 0.5) * 8;
    const v = 200 + Math.floor(r() * 55);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1.4 + r() * 1.2;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x0 + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.5 - 4, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    g.stroke();
  }
  g.strokeStyle = "rgb(150,130,110)";
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(64, 92); g.lineTo(64, 124); g.stroke();
  tuftTex = new THREE.CanvasTexture(c);
  tuftTex.colorSpace = THREE.SRGBColorSpace;
  return tuftTex;
}

/** A tube along points, radius tapering from r0 to r1. */
export function limb(points: THREE.Vector3[], r0: number, r1: number, segs = 10, radial = 9): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  // Taper: scale each ring around its centre by the radius at its place along the tube.
  const pos = geo.attributes["position"]!;
  const rings = segs + 1, perRing = pos.count / rings;
  const centre = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < rings; i++) {
    const t = i / segs;
    curve.getPointAt(t, centre);
    const rad = r0 + (r1 - r0) * t;
    for (let j = 0; j < perRing; j++) {
      const k = i * perRing + j;
      p.fromBufferAttribute(pos, k).sub(centre).multiplyScalar(rad).add(centre);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function realStonePine(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 97 + 13);
  const H = Math.max(4, def.h);
  const W = Math.max(H * 0.6, def.w);
  const g = new THREE.Group();

  // Trunk: bare up to about 62 % of the height, with a gentle lean and a curve.
  // The crown's dome sits on top, so the fork and the crown's base are worked out from the total height.
  const thick = Math.max(1.6, H * 0.25);
  const crownBase = H - thick * 1.02;
  const forkY = crownBase * (0.72 + r() * 0.08);
  const leanA = r() * Math.PI * 2, lean = H * (0.03 + r() * 0.05);
  const lx = Math.cos(leanA) * lean, lz = Math.sin(leanA) * lean;
  const trunkR = Math.max(0.12, H * 0.024);
  const trunkPts = [0, 0.3, 0.65, 1].map((t) => new THREE.Vector3(lx * t * t + (t > 0 && t < 1 ? (r() - 0.5) * H * 0.02 : 0), forkY * t, lz * t * t));
  const woodGeos: THREE.BufferGeometry[] = [limb(trunkPts, trunkR, trunkR * 0.72, 14)];
  // Flared foot.
  const foot = new THREE.CylinderGeometry(trunkR * 0.95, trunkR * 1.45, H * 0.04, 12);
  foot.translate(0, H * 0.02, 0);
  woodGeos.push(foot);

  // Main limbs: 4–6 forking upwards and outwards from the top of the trunk, then a secondary split each.
  const top = trunkPts[3]!.clone();
  const crownR = W / 2;
  const nLimbs = 4 + Math.floor(r() * 3);
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + r() * 0.6;
    const reach = crownR * (0.35 + r() * 0.25);
    const mid = new THREE.Vector3(top.x + Math.cos(a) * reach * 0.45, top.y + (crownBase - top.y) * 0.55, top.z + Math.sin(a) * reach * 0.45);
    const end = new THREE.Vector3(top.x + Math.cos(a) * reach, crownBase + H * 0.02 * r(), top.z + Math.sin(a) * reach);
    woodGeos.push(limb([top.clone(), mid, end], trunkR * 0.5, trunkR * 0.22, 8));
    for (let k = 0; k < 2; k++) {
      const b = a + (k ? 1 : -1) * (0.35 + r() * 0.35);
      const far = reach + crownR * (0.2 + r() * 0.25);
      const twig = new THREE.Vector3(top.x + Math.cos(b) * far, crownBase + H * (0.03 + r() * 0.04), top.z + Math.sin(b) * far);
      woodGeos.push(limb([end.clone(), twig], trunkR * 0.2, trunkR * 0.08, 5));
      tips.push(twig);
    }
    tips.push(end);
  }
  const bark = barkTexture().clone();
  bark.needsUpdate = true;
  bark.repeat.set(1.5, Math.max(2, H / 3));
  const wood = new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.92 }));
  g.add(wood);

  // Crown: an umbrella — a flattened dome over the limbs, its centre over the top of the trunk.
  const cx = top.x, cz = top.z;
  // Inner mass: a squashed half-sphere of dark green so light never shows through the middle of the crown.
  const massGeo = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const mass = new THREE.Mesh(massGeo, new THREE.MeshStandardMaterial({ color: "#2c4524", roughness: 1 }));
  mass.scale.set(crownR * 0.9, thick * 0.75, crownR * 0.9);
  mass.position.set(cx, crownBase + thick * 0.08, cz);
  g.add(mass);
  // Flat underside, a little darker.
  const under = new THREE.Mesh(new THREE.CircleGeometry(crownR * 0.9, 28), new THREE.MeshStandardMaterial({ color: "#2f4a28", roughness: 1, side: THREE.DoubleSide }));
  under.rotation.x = Math.PI / 2;
  under.position.set(cx, crownBase + thick * 0.08, cz);
  g.add(under);

  // Needle tufts on the dome's surface and rim, denser on top: crossed planes, instanced, each its own green.
  const plane = new THREE.PlaneGeometry(1, 1);
  const tuftGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2), plane.clone().rotateX(Math.PI / 2)])!;
  const n = Math.min(2400, Math.round(220 + crownR * crownR * 14));
  const tufts = new THREE.InstancedMesh(
    tuftGeo,
    new THREE.MeshStandardMaterial({ map: tuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    n,
  );
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // A point on the dome: angle around, and how far out (more near the rim, where the umbrella is widest).
    const a = r() * Math.PI * 2, u = Math.sqrt(r());
    const rad = crownR * (0.15 + 0.88 * u);
    const lift = Math.sqrt(Math.max(0, 1 - (rad / (crownR * 1.03)) ** 2));
    // About one tuft in six hangs along the rim's underside, so the umbrella has a soft, full edge.
    const low = r() < 0.17 && u > 0.6;
    const y = low ? crownBase + thick * (0.02 + r() * 0.12) : crownBase + thick * (0.08 + 0.9 * lift) + (r() - 0.5) * thick * 0.3;
    dummy.position.set(cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad);
    dummy.rotation.set((r() - 0.5) * 0.9, r() * Math.PI, (r() - 0.5) * 0.9);
    const s = Math.max(0.6, crownR * 0.16) * (0.75 + r() * 0.5);
    dummy.scale.set(s, s * 0.8, s);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
    tufts.setColorAt(i, col.setHSL(0.27 + r() * 0.05, 0.38 + r() * 0.15, 0.22 + r() * 0.14));
  }
  g.add(tufts);
  void tips;
  // Exactly the species' height: the tufts' spread can lift the top a little, so the whole tree is scaled to it.
  const box = new THREE.Box3().setFromObject(g);
  const real = box.max.y - Math.max(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

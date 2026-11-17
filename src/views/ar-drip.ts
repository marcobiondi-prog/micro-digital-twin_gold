import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Drip irrigation for the AR view, built in code, laid along a line of floor points (AR metres, y = 0):
 * - a drip line: a black 16 mm polyethylene pipe lying on the soil with a slight wave, a dark green dripper every
 *   50 cm, under each a darker wet patch, a drop forming and falling every second or so, and every 3 m a wire stake
 *   holding the pipe down;
 * - a main pipe: a thicker 32 mm black pipe with a blue stripe, a tee at every 6 m.
 * Points moved once a frame for the drops.
 */
type XZ = { x: number; z: number };

let wetTex: THREE.Texture | null = null;
function wetTexture() {
  if (wetTex) return wetTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  rg.addColorStop(0, "rgba(25,18,12,0.55)"); rg.addColorStop(0.7, "rgba(25,18,12,0.3)"); rg.addColorStop(1, "rgba(25,18,12,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  wetTex = new THREE.CanvasTexture(c);
  return wetTex;
}
let dropTex: THREE.Texture | null = null;
function dropTexture() {
  if (dropTex) return dropTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.5, "rgba(210,235,255,0.7)"); rg.addColorStop(1, "rgba(210,235,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  dropTex = new THREE.CanvasTexture(c);
  return dropTex;
}

/** Points every `step` metres along a polyline, with their direction. */
function along(pts: XZ[], step: number): Array<{ p: XZ; dir: number; d: number }> {
  const out: Array<{ p: XZ; dir: number; d: number }> = [];
  let carry = step / 2, total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 1e-6) continue;
    const dir = Math.atan2(b.z - a.z, b.x - a.x);
    let t = carry;
    while (t <= len) { out.push({ p: { x: a.x + ((b.x - a.x) * t) / len, z: a.z + ((b.z - a.z) * t) / len }, dir, d: total + t }); t += step; }
    carry = t - len; total += len;
  }
  return out;
}

export function realDrip(pts: XZ[], main = false): THREE.Group {
  const g = new THREE.Group();
  if (pts.length < 2) return g;
  const R = main ? 0.016 : 0.008;
  // The pipe: a gentle wave as it lies on the soil, resting on it.
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) total += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z);
  // The drip line waves a little on the soil (none at its ends, where it is fitted); the stiffer main pipe lies straight.
  const onPipe = ({ p, dir, d }: { p: XZ; dir: number; d: number }): XZ => {
    const ease = main ? 0 : Math.min(1, d / 0.6, (total - d) / 0.6);
    const wob = (Math.sin(d * 1.7) * 0.03 + Math.sin(d * 0.6 + 1) * 0.02) * Math.max(0, ease);
    return { x: p.x - Math.sin(dir) * wob, z: p.z + Math.cos(dir) * wob };
  };
  const path = along(pts, 0.25).map((a) => { const q = onPipe(a); return new THREE.Vector3(q.x, R, q.z); });
  path.unshift(new THREE.Vector3(pts[0]!.x, R, pts[0]!.z));
  path.push(new THREE.Vector3(pts[pts.length - 1]!.x, R, pts[pts.length - 1]!.z));
  const curve = new THREE.CatmullRomCurve3(path, false, "catmullrom", 0.2);
  const pipeMat = new THREE.MeshStandardMaterial({ color: "#16181a", roughness: 0.45, metalness: 0.05 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, path.length * 3), R, 8, false), pipeMat));
  // End plug.
  const end = path[path.length - 1]!;
  g.add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.3, 8, 6).translate(end.x, end.y, end.z), pipeMat));

  if (main) {
    // A blue stripe along the main pipe, and a tee every 6 m where a drip line would leave it.
    const stripe = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, path.length * 3), R * 0.35, 5, false), new THREE.MeshStandardMaterial({ color: "#1d4ed8", roughness: 0.5 }));
    stripe.position.y = R * 0.8;
    g.add(stripe);
    const fittings: THREE.BufferGeometry[] = [];
    for (const { p, dir } of along(pts, 6)) {
      fittings.push(new THREE.CylinderGeometry(R * 1.35, R * 1.35, 0.09, 10).rotateZ(Math.PI / 2).rotateY(-dir).translate(p.x, R, p.z));
      fittings.push(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 0.08, 8).rotateX(Math.PI / 2).rotateY(-dir).translate(p.x + Math.sin(dir) * 0.04, R, p.z - Math.cos(dir) * 0.04));
    }
    if (fittings.length) g.add(new THREE.Mesh(mergeGeometries(fittings)!, new THREE.MeshStandardMaterial({ color: "#2b2f33", roughness: 0.5 })));
    return g;
  }

  // Drippers every 50 cm, each with its wet patch; a wire stake every 3 m.
  const drips = along(pts, 0.5).map((a) => ({ ...a, p: onPipe(a) }));
  const emitters: THREE.BufferGeometry[] = [], stakes: THREE.BufferGeometry[] = [];
  for (const { p, dir } of drips) emitters.push(new THREE.CylinderGeometry(R * 1.6, R * 1.6, 0.035, 8).rotateZ(Math.PI / 2).rotateY(-dir).translate(p.x, R, p.z));
  for (const { p, dir } of along(pts, 3).map((a) => ({ ...a, p: onPipe(a) }))) {
    const ox = -Math.sin(dir) * R * 1.4, oz = Math.cos(dir) * R * 1.4;
    stakes.push(new THREE.CylinderGeometry(0.0025, 0.0025, 0.06, 4).translate(p.x + ox, 0.025, p.z + oz));
    stakes.push(new THREE.CylinderGeometry(0.0025, 0.0025, 0.06, 4).translate(p.x - ox, 0.025, p.z - oz));
    stakes.push(new THREE.CylinderGeometry(0.0025, 0.0025, R * 2.8, 4).rotateZ(Math.PI / 2).rotateY(-dir + Math.PI / 2).translate(p.x, R * 2.1, p.z));
  }
  if (emitters.length) g.add(new THREE.Mesh(mergeGeometries(emitters)!, new THREE.MeshStandardMaterial({ color: "#2f4a2a", roughness: 0.6 })));
  if (stakes.length) g.add(new THREE.Mesh(mergeGeometries(stakes)!, new THREE.MeshStandardMaterial({ color: "#8c9196", roughness: 0.4, metalness: 0.7 })));
  // Wet patches: one instanced disc each, a little different in size.
  const wet = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: wetTexture(), transparent: true, depthWrite: false }), drips.length);
  const o = new THREE.Object3D();
  drips.forEach(({ p, d }, i) => { o.position.set(p.x, 0.003, p.z); const s = 0.14 + ((Math.sin(d * 12.9) + 1) / 2) * 0.08; o.scale.set(s, 1, s * 1.15); o.updateMatrix(); wet.setMatrixAt(i, o.matrix); });
  wet.frustumCulled = false;
  g.add(wet);
  // Drops: one per dripper, swelling under it then falling the few millimetres to the soil, each on its own beat.
  const N = drips.length;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), phase = new Float32Array(N);
  drips.forEach((_, i) => { phase[i] = Math.random(); });
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 4);
  geo.setAttribute("position", pa); geo.setAttribute("color", ca);
  const drops = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.018, map: dropTexture(), transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true }));
  drops.frustumCulled = false;
  const place = (t: number) => {
    drips.forEach(({ p }, i) => {
      const f = (t * 0.9 + phase[i]!) % 1;               // a drop about every 1,1 s
      const y = f < 0.75 ? R * 0.2 : R * 0.2 - ((f - 0.75) / 0.25) * R * 0.2;
      pos[i * 3] = p.x; pos[i * 3 + 1] = Math.max(0.002, y); pos[i * 3 + 2] = p.z;
      col[i * 4] = 0.9; col[i * 4 + 1] = 0.96; col[i * 4 + 2] = 1; col[i * 4 + 3] = f < 0.75 ? f / 0.75 : 1 - (f - 0.75) / 0.25;
    });
    pa.needsUpdate = true; ca.needsUpdate = true;
  };
  place(0);
  drops.onBeforeRender = () => place(performance.now() / 1000);
  g.add(drops);
  return g;
}

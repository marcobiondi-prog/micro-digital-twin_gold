import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";
import { drawn } from "@/views/ar-broadleaf";

/**
 * The weeping willow (Salix babylonica, S. × sepulcralis, "salice piangente") for the AR view, built in code with
 * nothing to download: a short, thick, often leaning trunk of deeply ridged grey-brown bark that splits low into a few
 * great limbs; they climb, then arch over like the ribs of an umbrella, and from them and their side branches hang
 * hundreds of long thin twigs straight down, like hair, swaying a little, ending unevenly not far above the ground,
 * with gaps between them through which trunk and limbs show. Narrow yellow-green leaves along every twig.
 * Stands on y = 0, exactly h tall, about w across. A seed varies limbs, twigs and their lengths.
 */

const willowBark = drawn("willow-bark", 128, 256, (g, r) => {
  g.fillStyle = "#5e554a"; g.fillRect(0, 0, 128, 256); g.lineCap = "round";
  for (let i = 0; i < 34; i++) {
    g.strokeStyle = r() < 0.55 ? "rgba(30,25,20,0.65)" : "rgba(140,128,110,0.35)"; g.lineWidth = 1.5 + r() * 3.5;
    g.beginPath(); let x = r() * 136 - 4; g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 12) { x += (r() - 0.5) * 6; g.lineTo(x, y); }
    g.stroke();
  }
}, true);

/** A hanging twig: a thin stem down the middle, narrow pointed leaves along it, hanging down and a little outwards. */
const strandTex = drawn("willow-strand2", 32, 256, (g, r) => {
  // Dense: leaves fill most of the width, so a far, small strand keeps enough of its picture not to vanish.
  g.strokeStyle = "rgb(150,140,100)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(16, 0); g.lineTo(16 + (r() - 0.5) * 3, 256); g.stroke();
  for (let y = 2; y < 254; y += 4.5) {
    for (const s of [-1, 1]) {
      const len = 15 + r() * 6, w = 3.2 + r() * 1.4, ang = s * (0.28 + r() * 0.22);
      const v = 175 + Math.floor(r() * 75);
      g.save(); g.translate(16 + s * 1.5, y); g.rotate(ang);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, len * 0.45, 0, len); g.quadraticCurveTo(-w, len * 0.45, 0, 0); g.fill();
      g.restore();
    }
  }
});

export function realWillow(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 709 + 23);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 1.4, Math.max(H * 0.85, def.w || H * 1.1));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk: short, thick, leaning, splitting at about a fifth of the height.
  const forkY = H * (0.18 + r() * 0.06);
  const trunkR = Math.max(0.1, H * 0.042);
  const la = r() * Math.PI * 2, lean = H * (0.03 + r() * 0.05);
  const top = new THREE.Vector3(Math.cos(la) * lean, forkY, Math.sin(la) * lean);
  const woodGeos: THREE.BufferGeometry[] = [
    limb([new THREE.Vector3(0, 0, 0), new THREE.Vector3(top.x * 0.3, forkY * 0.45, top.z * 0.3), new THREE.Vector3(top.x * 0.75, forkY * 0.8, top.z * 0.75), top.clone()], trunkR, trunkR * 0.8, 10, 12),
    new THREE.CylinderGeometry(trunkR * 1.05, trunkR * 1.45, H * 0.03, 12).translate(0, H * 0.015, 0),
  ];

  // Great limbs: climbing, then arching over and down like umbrella ribs. Points along them carry the hanging twigs.
  const anchors: { p: THREE.Vector3; out: number }[] = [];
  const nLimbs = 4 + Math.floor(r() * 3);
  const arc = (a: number, apexR: number, apexY: number, endR: number, endY: number) => {
    const p0 = top.clone();
    const p1 = new THREE.Vector3(top.x + Math.cos(a) * apexR * 0.4, (forkY + apexY) / 2 + H * 0.08, top.z + Math.sin(a) * apexR * 0.4);
    const p2 = new THREE.Vector3(top.x * 0.5 + Math.cos(a) * apexR, apexY, top.z * 0.5 + Math.sin(a) * apexR);
    const p3 = new THREE.Vector3(Math.cos(a) * endR, endY, Math.sin(a) * endR);
    return [p0, p1, p2, p3];
  };
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const pts = arc(a, R * (0.3 + r() * 0.12), H * (0.86 + r() * 0.1), R * (0.78 + r() * 0.15), H * (0.58 + r() * 0.08));
    woodGeos.push(limb(pts, trunkR * 0.5, trunkR * 0.08, 12, 8));
    const curve = new THREE.CatmullRomCurve3(pts);
    // Side branches: arcs fanning out on either side of the limb from its upper part.
    for (let k = 0; k < 4; k++) {
      const t0 = 0.35 + k * 0.14 + r() * 0.05;
      const start = curve.getPointAt(t0);
      const b = a + (k % 2 ? 1 : -1) * (0.45 + r() * 0.4);
      const endR = R * (0.7 + r() * 0.28);
      const end = new THREE.Vector3(Math.cos(b) * endR, H * (0.5 + r() * 0.15), Math.sin(b) * endR);
      const mid = new THREE.Vector3((start.x + end.x) / 2, Math.max(start.y, end.y) + H * 0.04, (start.z + end.z) / 2);
      woodGeos.push(limb([start, mid, end], trunkR * 0.16, trunkR * 0.04, 6, 6));
      const side = new THREE.CatmullRomCurve3([start, mid, end]);
      for (let j = 0; j < 9; j++) { const p = side.getPointAt(0.15 + (j / 9) * 0.85); anchors.push({ p, out: Math.hypot(p.x, p.z) / R }); }
    }
    for (let j = 0; j < 14; j++) { const p = curve.getPointAt(0.3 + (j / 14) * 0.7); anchors.push({ p, out: Math.hypot(p.x, p.z) / R }); }
  }
  const bark = willowBark().clone(); bark.needsUpdate = true; bark.repeat.set(1.5, Math.max(1, H / 3));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 })));

  // Hanging twigs: from the anchors, straight down with a slight sway, in segments; the outer ones longest (the hem
  // a little above the ground), the inner ones shorter so the trunk shows through.
  const seg = Math.max(0.6, H * 0.1);
  const strands: { x: number; z: number; y0: number; len: number; sway: number }[] = [];
  const nStrands = Math.min(520, Math.round(120 + R * R * 9));
  for (let i = 0; i < nStrands; i++) {
    const { p, out } = anchors[Math.floor(r() * anchors.length)]!;
    const x = p.x + (r() - 0.5) * R * 0.12, z = p.z + (r() - 0.5) * R * 0.12;
    const hem = H * (0.05 + r() * 0.12) + (1 - Math.min(1, out)) * H * 0.35 * r();
    strands.push({ x, z, y0: p.y, len: Math.max(seg * 0.5, p.y - hem), sway: (r() - 0.5) * 0.25 });
  }
  const total = Math.min(6000, strands.reduce((s, st) => s + Math.ceil(st.len / seg), 0));
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const geo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const twigs = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: strandTex(), alphaTest: 0.28, side: THREE.DoubleSide, roughness: 0.8 }), total);
  const d = new THREE.Object3D(), col = new THREE.Color();
  let used = 0;
  for (const st of strands) {
    const n = Math.ceil(st.len / seg);
    const hue = 0.21 + r() * 0.04, sat = 0.55 + r() * 0.15, light = 0.52 + r() * 0.12;
    const outward = Math.atan2(st.z, st.x);
    for (let k = 0; k < n && used < total; k++) {
      // Each segment hangs from the end of the one above, the strand drifting slightly outwards as it falls.
      const drift = (k * seg / Math.max(1, H)) * 0.12 * R;
      d.position.set(st.x + Math.cos(outward) * drift + st.sway * k * 0.08, st.y0 - k * seg, st.z + Math.sin(outward) * drift);
      d.rotation.set((r() - 0.5) * 0.08, r() * Math.PI, st.sway * 0.25);
      d.scale.set(Math.max(0.24, seg * 0.36), seg * (k === n - 1 ? Math.min(1, (st.len - k * seg) / seg + 0.15) : 1.04), Math.max(0.24, seg * 0.36));
      d.updateMatrix();
      twigs.setMatrixAt(used, d.matrix);
      twigs.setColorAt(used, col.setHSL(hue, sat, light * (1 + k * 0.02)));
      used++;
    }
  }
  twigs.count = used;
  // Instances spread far from the mesh's own origin: never culled by a stale bounding sphere.
  twigs.frustumCulled = false;
  g.add(twigs);

  // A cap of leaves over the arching limbs, so the dome's top reads green and the bare limbs do not show above it.
  const cap = Math.round(nStrands * 1.1);
  const capMesh = new THREE.InstancedMesh(geo, twigs.material as THREE.Material, cap);
  for (let i = 0; i < cap; i++) {
    const { p } = anchors[Math.floor(r() * anchors.length)]!;
    d.position.set(p.x + (r() - 0.5) * R * 0.12, p.y + seg * (0.35 + r() * 0.3), p.z + (r() - 0.5) * R * 0.12);
    d.rotation.set((r() - 0.5) * 0.6, r() * Math.PI, (r() - 0.5) * 0.6);
    d.scale.set(seg * 0.34, seg * 0.7, seg * 0.34);
    d.updateMatrix();
    capMesh.setMatrixAt(i, d.matrix);
    capMesh.setColorAt(i, col.setHSL(0.22 + r() * 0.04, 0.55, 0.5 + r() * 0.1));
  }
  capMesh.frustumCulled = false;
  g.add(capMesh);

  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

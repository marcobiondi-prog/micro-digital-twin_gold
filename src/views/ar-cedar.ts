import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng, tuftTexture } from "@/views/ar-pine";
import { drawn } from "@/views/ar-broadleaf";

/**
 * The cedar (Cedrus — atlas, deodar, Lebanon cedar) for the AR view, built in code with nothing to download: a straight
 * dark trunk running up to a leader that nods over at the top, and tiers of long branches held out flat, layer above
 * layer, the lower ones longest, so the tree is a broad pyramid of horizontal plates with sky between them; tufts of
 * blue-green needles lie flat along each branch. Stands on y = 0, exactly h tall, about w across. A seed varies tiers
 * and branches.
 */

const cedarBark = drawn("cedar-bark", 128, 256, (g, r) => {
  g.fillStyle = "#4a443e"; g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 10) for (let x = -8; x < 128; x += 16) {
    const v = 55 + Math.floor(r() * 30); g.fillStyle = `rgb(${v + 8},${v + 2},${v - 4})`;
    g.fillRect(x + r() * 6, y + r() * 3, 12 + r() * 5, 7 + r() * 3);
  }
}, true);

/** The cedar's width at f (0 at the foot, 1 at the top): a broad pyramid, slightly flared at the bottom. */
export function cedarRadius(f: number): number {
  if (f <= 0) return 1; if (f >= 1) return 0;
  return Math.pow(1 - f, 0.95);
}

export function realCedar(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 401 + 7);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 0.85, Math.max(H * 0.45, def.w || H * 0.65));
  const R = W / 2;
  const g = new THREE.Group();
  const crownFoot = H * (0.06 + r() * 0.06);
  const depth = H - crownFoot;
  const trunkR = Math.max(0.08, H * 0.03);

  // Trunk and the nodding leader.
  const nod = r() * Math.PI * 2;
  const woodGeos: THREE.BufferGeometry[] = [
    limb([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H * 0.5, 0), new THREE.Vector3(0, H * 0.92, 0), new THREE.Vector3(Math.cos(nod) * H * 0.04, H, Math.sin(nod) * H * 0.04)], trunkR, trunkR * 0.08, 16, 10),
  ];
  const foot = new THREE.CylinderGeometry(trunkR * 1.05, trunkR * 1.4, H * 0.03, 12).translate(0, H * 0.015, 0);
  woodGeos.push(foot);

  // Tiers of flat branches.
  const tufts: { p: THREE.Vector3; flat: boolean; s: number }[] = [];
  const tiers = Math.round(Math.max(6, Math.min(14, H / 1.6)));
  for (let t = 0; t < tiers; t++) {
    const f = (t + r() * 0.5) / tiers;
    const y = crownFoot + f * depth * 0.95;
    const len = R * cedarRadius(f) * (0.85 + r() * 0.2);
    const n = Math.max(5, Math.round(7 - f * 2 + r() * 2));
    for (let b = 0; b < n; b++) {
      const a = (b / n) * Math.PI * 2 + t * 0.7 + r() * 0.4;
      const droop = -len * 0.08, tipUp = len * 0.06;
      const p0 = new THREE.Vector3(0, y, 0);
      const p1 = new THREE.Vector3(Math.cos(a) * len * 0.5, y + droop, Math.sin(a) * len * 0.5);
      const p2 = new THREE.Vector3(Math.cos(a) * len, y + droop + tipUp, Math.sin(a) * len);
      woodGeos.push(limb([p0, p1, p2], trunkR * 0.28 * (1 - f * 0.6), trunkR * 0.04, 5, 6));
      // Needle tufts lying flat along the branch and its side shoots, a plate a branch.
      const k = Math.round(16 + len * 10);
      for (let i = 0; i < k; i++) {
        const s = 0.12 + r() * 0.88, side = (r() - 0.5) * len * 0.6 * (0.4 + s);
        const along = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), across = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const p = new THREE.Vector3().addScaledVector(along, len * s).addScaledVector(across, side);
        p.y = y + droop * (s < 0.5 ? s * 2 : 1) + tipUp * Math.max(0, s - 0.5) * 2 + (r() - 0.5) * 0.25;
        tufts.push({ p, flat: r() < 0.7, s: 0.6 + r() * 0.5 });
      }
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: cedarBark(), roughness: 0.95 })));

  const plane = new THREE.PlaneGeometry(1, 1);
  const tuftGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const mesh = new THREE.InstancedMesh(tuftGeo, new THREE.MeshStandardMaterial({ map: tuftTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }), tufts.length);
  const d = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.35, Math.min(1.2, R * 0.2));
  tufts.forEach(({ p, flat, s }, i) => {
    d.position.copy(p);
    d.rotation.set(flat ? -Math.PI / 2 + (r() - 0.5) * 0.5 : (r() - 0.5) * 0.6, r() * Math.PI, (r() - 0.5) * 0.4);
    d.scale.setScalar(size * s);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    mesh.setColorAt(i, col.setHSL(0.42 + r() * 0.06, 0.18 + r() * 0.1, 0.33 + r() * 0.1));
  });
  g.add(mesh);

  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

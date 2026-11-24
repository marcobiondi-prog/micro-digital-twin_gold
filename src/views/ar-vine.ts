import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";
import { drawn } from "@/views/ar-broadleaf";

/**
 * The grapevine (Vitis vinifera, "vite") for the AR view, built in code with nothing to download: a stretch of a
 * trained row as in an Italian vineyard (spurred cordon on a vertical trellis) — end posts and wires, and every metre
 * or so a vine: a short, gnarled, peeling trunk up to the first wire, a cordon running along it each way, shoots
 * climbing from the spurs into a leafy wall held between the upper wires, and bunches of grapes hanging under the
 * leaves. Stands on y = 0, exactly h tall, w long along x. A seed varies the vines, the leaves and the bunches.
 */

const vineBark = drawn("vine-bark", 64, 256, (g, r) => {
  g.fillStyle = "#5a4535"; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = r() < 0.5 ? "rgba(140,110,85,0.6)" : "rgba(35,25,18,0.6)"; g.lineWidth = 1 + r() * 3;
    g.beginPath(); let x = r() * 64; g.moveTo(x, 0); for (let y = 0; y <= 256; y += 16) { x += (r() - 0.5) * 4; g.lineTo(x, y); } g.stroke();
  }
}, true);

/** A vine shoot: big five-lobed toothed leaves alternate along it, white-ish so each instance tints them. */
const vineLeaf = drawn("vine-leaf", 128, 128, (g, r) => {
  g.strokeStyle = "rgb(120,110,70)"; g.lineWidth = 2; g.beginPath(); g.moveTo(64, 127); g.lineTo(64, 10); g.stroke();
  const leaf = (x: number, y: number, a: number, s: number) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    const v = 175 + Math.floor(r() * 70); g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(0, 4);
    const lobes = [[-1.5, 0.55], [-0.8, 0.85], [0, 1], [0.8, 0.85], [1.5, 0.55]] as const;
    for (const [ang, len] of lobes) {
      const L = 24 * len;
      for (let k = 0; k <= 4; k++) {
        const aa = ang - 0.35 + (0.7 * k) / 4, rr = L * (k === 2 ? 1 : 0.78 + (k % 2) * 0.12);
        g.lineTo(Math.sin(aa) * rr, -Math.cos(aa) * rr);
      }
      g.lineTo(Math.sin(ang + 0.42) * L * 0.55, -Math.cos(ang + 0.42) * L * 0.55);
    }
    g.closePath(); g.fill();
    g.strokeStyle = "rgba(90,90,90,0.45)"; g.lineWidth = 0.8;
    g.beginPath(); for (const [ang, len] of lobes) { g.moveTo(0, 2); g.lineTo(Math.sin(ang) * 22 * len, -Math.cos(ang) * 22 * len); } g.stroke();
    g.restore();
  };
  leaf(38, 100, -0.9, 1); leaf(90, 70, 0.8, 1.05); leaf(40, 46, -0.6, 0.95); leaf(66, 22, 0, 0.9);
});

/**
 * `far`: seen from afar (Google's photographic 3D), a lighter row — a quarter of the leaves, each larger so the wall
 * stays full, and smaller bunches — as a whole vineyard is many pieces of row.
 */
export function realVine(def: { h: number; w: number }, seed = 1, opts: { far?: boolean } = {}): THREE.Group {
  const r = rng(seed * 601 + 3);
  const H = Math.max(1, def.h);
  const L = Math.max(1.2, def.w || 4);
  const g = new THREE.Group();
  const wireYs = [H * 0.45, H * 0.62, H * 0.8, H * 0.97];

  // End posts (weathered wood) and the galvanised wires between them.
  const postMat = new THREE.MeshStandardMaterial({ color: "#8a7a62", roughness: 0.9 });
  for (const x of [-L / 2, L / 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, H * 1.05, 0.08), postMat);
    post.position.set(x, H * 0.525, 0);
    g.add(post);
  }
  const wireMat = new THREE.MeshStandardMaterial({ color: "#b8bcc0", roughness: 0.35, metalness: 0.7 });
  for (const y of wireYs) {
    const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, L, 4).rotateZ(Math.PI / 2), wireMat);
    wire.position.set(0, y, 0);
    g.add(wire);
  }

  // Vines about every metre: trunk, cordon each way, shoots up from the spurs.
  const n = Math.max(1, Math.round(L / 1.1));
  const step = L / n;
  const woodGeos: THREE.BufferGeometry[] = [];
  const shootTops: THREE.Vector3[] = [];
  const bunchAt: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + step * (i + 0.5);
    const cy = wireYs[0]!;
    woodGeos.push(limb([
      new THREE.Vector3(x0, 0, 0), new THREE.Vector3(x0 + (r() - 0.5) * 0.08, cy * 0.4, (r() - 0.5) * 0.05),
      new THREE.Vector3(x0 + (r() - 0.5) * 0.06, cy * 0.8, (r() - 0.5) * 0.04), new THREE.Vector3(x0, cy, 0),
    ], 0.045, 0.03, 8, 8));
    for (const dir of [-1, 1]) {
      const end = x0 + dir * step * 0.48;
      woodGeos.push(limb([new THREE.Vector3(x0, cy, 0), new THREE.Vector3((x0 + end) / 2, cy + 0.01, 0), new THREE.Vector3(end, cy - 0.005, 0)], 0.028, 0.016, 6, 6));
      for (let s = 1; s <= 3; s++) {
        const sx = x0 + dir * step * 0.48 * (s / 3.3);
        const tip = new THREE.Vector3(sx + (r() - 0.5) * 0.15, H * (0.92 + r() * 0.1), (r() - 0.5) * 0.12);
        woodGeos.push(limb([new THREE.Vector3(sx, cy, 0), new THREE.Vector3(sx + (r() - 0.5) * 0.08, (cy + tip.y) / 2, (r() - 0.5) * 0.08), tip], 0.012, 0.005, 5, 5));
        shootTops.push(tip);
        if (r() < 0.8) bunchAt.push(new THREE.Vector3(sx + (r() - 0.5) * 0.1, cy + H * (0.06 + r() * 0.08), (r() < 0.5 ? -1 : 1) * (0.08 + r() * 0.06)));
      }
    }
  }
  const bark = vineBark().clone(); bark.needsUpdate = true; bark.repeat.set(1, 2);
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 })));

  // The leaf wall: between the second wire and the top, about 45 cm thick, a little wider at the top.
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const far = !!opts.far;
  const count = far ? Math.min(400, Math.round(L * 40)) : Math.min(1600, Math.round(L * 160));
  const leaves = new THREE.InstancedMesh(twigGeo, new THREE.MeshStandardMaterial({ map: vineLeaf(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }), count);
  const d = new THREE.Object3D(), col = new THREE.Color();
  const y0 = wireYs[0]! + H * 0.05, y1 = H;
  for (let i = 0; i < count; i++) {
    const t = r(), y = y0 + (y1 - y0) * Math.pow(t, 0.8);
    const half = 0.16 + 0.14 * t;
    d.position.set(-L / 2 + 0.05 + r() * (L - 0.1), y, (r() - 0.5) * 2 * half);
    d.rotation.set((r() - 0.5) * 1, r() * Math.PI, (r() - 0.5) * 1);
    d.scale.setScalar((0.32 + r() * 0.18) * (far ? 1.75 : 1));
    d.updateMatrix();
    leaves.setMatrixAt(i, d.matrix);
    leaves.setColorAt(i, col.setHSL(0.23 + r() * 0.05, 0.45 + r() * 0.15, 0.3 + r() * 0.12));
  }
  g.add(leaves);

  // Bunches: cones of berries hanging under the leaves, dark purple.
  const berry = new THREE.IcosahedronGeometry(1, 1);
  const perBunch = far ? 8 : 34;
  const berries = new THREE.InstancedMesh(berry, new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35 }), bunchAt.length * perBunch);
  let k = 0;
  for (const b of bunchAt) {
    const blen = 0.14 + r() * 0.08;
    for (let j = 0; j < perBunch; j++) {
      const t = Math.pow(r(), 0.8), rad = 0.045 * (1 - t * 0.8);
      const a = r() * Math.PI * 2;
      d.position.set(b.x + Math.cos(a) * rad * r(), b.y - t * blen, b.z + Math.sin(a) * rad * r());
      d.rotation.set(0, 0, 0);
      d.scale.setScalar((0.009 + r() * 0.003) * (far ? 1.9 : 1));
      d.updateMatrix();
      berries.setMatrixAt(k, d.matrix);
      berries.setColorAt(k, col.setHSL(0.78 + r() * 0.04, 0.35, 0.16 + r() * 0.08));
      k++;
    }
  }
  if (k) g.add(berries);

  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

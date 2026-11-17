import * as THREE from "three";
import { rng } from "@/views/ar-pine";
import { drawn } from "@/views/ar-broadleaf";

/**
 * A palm (Phoenix canariensis, the Canary date palm of so many Italian squares, and the other palms) for the AR view,
 * built in code with nothing to download: a thick straight trunk covered in the diamond-shaped scars of old leaf
 * bases, swelling into a "pineapple" under the crown, and a round head of long pinnate fronds — the young ones
 * standing up, the old ones arching out and down, the oldest yellowing — each frond a bent strip folded along its
 * midrib in a V, drawn as a feather of leaflets. Stands on y = 0, exactly h tall, the crown about w across.
 */

const trunkTex = drawn("palm-trunk", 128, 128, (g, r) => {
  g.fillStyle = "#6e5a44"; g.fillRect(0, 0, 128, 128);
  // Diamond leaf-base scars in staggered rows.
  for (let row = 0; row < 8; row++) for (let col = 0; col < 5; col++) {
    const x = col * 32 + (row % 2 ? 16 : 0), y = row * 16 + 8;
    const v = 120 + Math.floor(r() * 40);
    g.fillStyle = `rgb(${v},${v - 18},${v - 40})`;
    g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 15, y); g.lineTo(x, y + 9); g.lineTo(x - 15, y); g.closePath(); g.fill();
    g.strokeStyle = "rgba(50,38,26,0.7)"; g.lineWidth = 1.5; g.stroke();
  }
}, true);

/** A frond: a midrib with long narrow leaflets angled forward on both sides, white so each frond tints it. */
const frondTex = drawn("palm-frond", 64, 256, (g, r) => {
  g.lineCap = "round";
  for (let y = 250; y > 6; y -= 4.2) {
    const t = 1 - y / 256, len = 28 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)) + 4;
    const v = 190 + Math.floor(r() * 60);
    g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 2;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32, y); g.lineTo(32 + s * len, y - len * 0.55); g.stroke(); }
  }
  g.strokeStyle = "rgb(200,190,150)"; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 2); g.stroke();
});

export function realPalm(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 503 + 11);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 1.1, Math.max(H * 0.5, def.w || H * 0.8));
  const R = W / 2;
  const g = new THREE.Group();

  // Trunk: up to where the fronds spring, thick, a slight swelling at the foot and the pineapple under the crown.
  const crownY = H - R * 0.75;
  const trunkR = Math.max(0.15, H * 0.045);
  const trunkGeo = new THREE.CylinderGeometry(trunkR * 0.95, trunkR * 1.12, crownY, 18, 8, true).translate(0, crownY / 2, 0);
  const tex = trunkTex().clone(); tex.needsUpdate = true; tex.repeat.set(2, Math.max(2, crownY / 0.6));
  const barkMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  g.add(new THREE.Mesh(trunkGeo, barkMat));
  const pineapple = new THREE.Mesh(new THREE.SphereGeometry(trunkR * 1.35, 16, 12), barkMat);
  pineapple.scale.set(1, 1.15, 1); pineapple.position.y = crownY - trunkR * 0.2;
  g.add(pineapple);

  // Fronds.
  const n = Math.round(60 + r() * 20);
  const L = R * 1.2;
  const segs = 14;
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, vertexColors: true });
  const geos: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + r() * 0.3;
    // Younger fronds (most) stand up; older ones arch out and down.
    const age = i / n;
    const elev = THREE.MathUtils.degToRad(72 - Math.pow(age, 0.85) * 100 + (r() - 0.5) * 14);
    const len = L * (0.8 + r() * 0.3) * (age > 0.85 ? 0.95 : 1);
    const width = len * 0.3;
    const yellow = age > 0.88;
    col.setHSL(yellow ? 0.13 : 0.25 + r() * 0.04, yellow ? 0.45 : 0.38 + r() * 0.12, yellow ? 0.42 : 0.3 + r() * 0.08);
    for (const fold of [-1, 1]) {
      const geo = new THREE.PlaneGeometry(width / 2, len, 1, segs);
      geo.translate(fold * width / 4, len / 2, 0);
      const pos = geo.attributes["position"]!;
      const uv = geo.attributes["uv"]!;
      const colors = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), y = pos.getY(k);
        const s = y / len;
        // The path: up and out at `elev`, bending down under its weight.
        const reach = s * len * Math.max(0.35, Math.cos(elev)) + s * s * len * 0.18;
        const rise = s * len * Math.sin(elev) * (elev < 0 ? 0.55 : 1) - s * s * len * 0.38;
        // V fold: each half lifted a little along its width.
        const lift = Math.abs(x) * 0.5;
        const px = Math.cos(a) * reach - Math.sin(a) * x, pz = Math.sin(a) * reach + Math.cos(a) * x;
        pos.setXYZ(k, px, crownY + trunkR * 0.6 + rise + lift, pz);
        // Each half takes its side of the frond picture (left or right of the midrib).
        uv.setX(k, fold < 0 ? uv.getX(k) * 0.5 : 0.5 + uv.getX(k) * 0.5);
        colors[k * 3] = col.r; colors[k * 3 + 1] = col.g; colors[k * 3 + 2] = col.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      geos.push(geo);
    }
  }
  // One mesh for all fronds.
  if (geos.length) g.add(new THREE.Mesh(mergeAll(geos), frondMat));

  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let count = 0, idx = 0;
  for (const g of geos) { count += g.attributes["position"]!.count; idx += g.index!.count; }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2), color = new Float32Array(count * 3), index = new Uint32Array(idx);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes["position"]!, n = g.attributes["normal"]!, u = g.attributes["uv"]!, c = g.attributes["color"]!;
    pos.set(p.array as Float32Array, vo * 3); nor.set(n.array as Float32Array, vo * 3); uv.set(u.array as Float32Array, vo * 2); color.set(c.array as Float32Array, vo * 3);
    const gi = g.index!.array;
    for (let k = 0; k < gi.length; k++) index[io + k] = gi[k]! + vo;
    vo += p.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setAttribute("color", new THREE.BufferAttribute(color, 3));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

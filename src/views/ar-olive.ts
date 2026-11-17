import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { limb, rng } from "@/views/ar-pine";

/**
 * The olive tree (Olea europaea, "olivo") for the AR view, built in code with nothing to download: a short, thick,
 * gnarled trunk (twisted, ridged and bulging, grey bark with dark fissures) that splits low into three or four main
 * limbs opening like a vase, under a broad, irregular, airy crown — a handful of rounded clumps of narrow leaves,
 * grey-green above and silver beneath, with gaps between them where the branches show. Stands on y = 0, exactly h
 * tall, the crown about w across. A seed varies the twist, the limbs and the clumps.
 */

let barkTex: THREE.Texture | null = null;
let leafTex: THREE.Texture | null = null;

/** Old olive bark: pale grey with a network of dark fissures and a few lighter, smoother patches. */
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(211);
  g.fillStyle = "#8d8679";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(180,172,158,${0.2 + r() * 0.3})` : `rgba(90,82,70,${0.15 + r() * 0.25})`;
    g.beginPath(); g.ellipse(r() * 256, r() * 256, 8 + r() * 30, 12 + r() * 40, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // Fissures: crooked dark lines, mostly along the trunk, joined by short cross cracks.
  g.lineCap = "round";
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(40,34,28,${0.5 + r() * 0.4})`;
    g.lineWidth = 1.5 + r() * 3;
    g.beginPath();
    let x = r() * 256, y = 0;
    g.moveTo(x, y);
    while (y < 256) { y += 6 + r() * 14; x += (r() - 0.5) * 18; g.lineTo(x, y); if (r() < 0.15) { g.lineTo(x + (r() - 0.5) * 30, y + 4); g.moveTo(x, y); } }
    g.stroke();
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A twig of narrow lance-shaped leaves in pairs, darker above and lighter (silvery) edges; white-ish so instances tint it. */
export function leafTexture() {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(17);
  const leaf = (x: number, y: number, a: number, len: number) => {
    g.save();
    g.translate(x, y); g.rotate(a);
    const w = len * 0.16;
    const silver = r() < 0.4;
    g.fillStyle = silver ? "rgb(235,240,232)" : `rgb(${175 + r() * 30},${185 + r() * 30},${170 + r() * 25})`;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(w, -len * 0.45, 0, -len);
    g.quadraticCurveTo(-w, -len * 0.45, 0, 0);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, -2); g.lineTo(0, -len * 0.9); g.stroke();
    g.restore();
  };
  for (let t = 0; t < 4; t++) {
    const x0 = 30 + t * 22 + (r() - 0.5) * 10, a0 = -Math.PI / 2 + (r() - 0.5) * 0.6;
    g.strokeStyle = "rgb(140,130,115)"; g.lineWidth = 2;
    const ex = x0 + Math.cos(a0) * 100, ey = 124 + Math.sin(a0) * 100;
    g.beginPath(); g.moveTo(x0, 124); g.lineTo(ex, ey); g.stroke();
    for (let k = 1; k <= 7; k++) {
      const f = k / 8, px = x0 + (ex - x0) * f, py = 124 + (ey - 124) * f;
      leaf(px, py, a0 + Math.PI / 2 - 0.9 - r() * 0.3, 22 + r() * 10);
      leaf(px, py, a0 + Math.PI / 2 + 0.9 + r() * 0.3, 22 + r() * 10);
    }
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  return leafTex;
}

/** Gnarls: each ring of a tube pushed in and out around its centre (ridges, bulges, a slow twist). */
function gnarl(geo: THREE.BufferGeometry, axis: THREE.Curve<THREE.Vector3>, segs: number, r: () => number, depth: number) {
  const pos = geo.attributes["position"]!;
  const rings = segs + 1, per = pos.count / rings;
  const c = new THREE.Vector3(), p = new THREE.Vector3();
  const lobes = 3 + Math.floor(r() * 3), phase = r() * 6;
  for (let i = 0; i < rings; i++) {
    const t = i / segs;
    axis.getPointAt(t, c);
    const bulge = 1 + Math.sin(t * 9 + phase) * 0.08 + (t < 0.12 ? (0.12 - t) * 1.6 : 0);
    for (let j = 0; j < per; j++) {
      const k = i * per + j;
      p.fromBufferAttribute(pos, k).sub(c);
      const ang = Math.atan2(p.z, p.x) + t * 2.2;
      const ridge = 1 + depth * Math.sin(ang * lobes + phase) + depth * 0.5 * Math.sin(ang * 7 + t * 13);
      p.multiplyScalar(ridge * bulge).add(c);
      pos.setXYZ(k, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
}

export function realOlive(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 173 + 29);
  const H = Math.max(2, def.h);
  const W = Math.min(H * 1.6, Math.max(H * 0.8, def.w || H));
  const crownR = W / 2;
  const g = new THREE.Group();

  // Trunk: short and thick, leaning and twisting, splitting at about a quarter of the height.
  const forkY = H * (0.22 + r() * 0.08);
  const trunkR = Math.max(0.12, H * 0.055);
  const la = r() * Math.PI * 2, lean = H * 0.06;
  const trunkPts = [0, 0.35, 0.7, 1].map((t) => new THREE.Vector3(Math.cos(la) * lean * t + (t > 0 && t < 1 ? (r() - 0.5) * trunkR : 0), forkY * t, Math.sin(la) * lean * t));
  const trunkCurve = new THREE.CatmullRomCurve3(trunkPts);
  const trunk = limb(trunkPts, trunkR, trunkR * 0.85, 16, 14);
  gnarl(trunk, trunkCurve, 16, r, 0.16);
  const woodGeos: THREE.BufferGeometry[] = [trunk];
  const top = trunkPts[3]!.clone();

  // Main limbs: 3–4 opening like a vase, then two or three branches each ending where a leaf clump sits.
  const nLimbs = 3 + Math.floor(r() * 2);
  const clumps: THREE.Vector3[] = [];
  for (let i = 0; i < nLimbs; i++) {
    const a = (i / nLimbs) * Math.PI * 2 + (r() - 0.5) * 0.7;
    const out = crownR * (0.3 + r() * 0.2);
    const mid = new THREE.Vector3(top.x + Math.cos(a) * out * 0.5, forkY + (H * 0.55 - forkY) * 0.5, top.z + Math.sin(a) * out * 0.5);
    const end = new THREE.Vector3(top.x + Math.cos(a) * out, H * (0.52 + r() * 0.08), top.z + Math.sin(a) * out);
    const pts = [top.clone(), mid, end];
    const geo = limb(pts, trunkR * 0.55, trunkR * 0.28, 10, 10);
    gnarl(geo, new THREE.CatmullRomCurve3(pts), 10, r, 0.1);
    woodGeos.push(geo);
    const nb = 2 + Math.floor(r() * 2);
    for (let k = 0; k < nb; k++) {
      const b = a + (k - (nb - 1) / 2) * (0.5 + r() * 0.3);
      const far = out + crownR * (0.2 + r() * 0.35);
      const tip = new THREE.Vector3(top.x + Math.cos(b) * far, H * (0.62 + r() * 0.18), top.z + Math.sin(b) * far);
      woodGeos.push(limb([end.clone(), tip], trunkR * 0.24, trunkR * 0.08, 6, 7));
      clumps.push(tip);
    }
  }
  // One clump over the middle so the crown is not a ring.
  clumps.push(new THREE.Vector3(top.x, H * 0.8, top.z));
  const bark = barkTexture().clone();
  bark.needsUpdate = true;
  bark.repeat.set(2, Math.max(1, H / 3));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 })));

  // Leaf clumps: a grey-green inner mass and leafy twigs all over it, light and silver here and there.
  const plane = new THREE.PlaneGeometry(1, 1);
  const twigGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const clumpR = clumps.map(() => crownR * (0.3 + r() * 0.16));
  const total = Math.min(3600, Math.round(clumpR.reduce((s, cr) => s + cr * cr, 0) * 120));
  const twigs = new THREE.InstancedMesh(
    twigGeo,
    new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }),
    total,
  );
  const massMat = new THREE.MeshStandardMaterial({ color: "#46553d", roughness: 1 });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const sumSq = clumpR.reduce((s, cr) => s + cr * cr, 0);
  let i = 0;
  clumps.forEach((c, ci) => {
    const cr = clumpR[ci]!;
    const sy = 0.62 + r() * 0.15;
    const mass = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), massMat);
    mass.scale.set(cr * 0.58, cr * 0.58 * sy, cr * 0.58);
    mass.position.copy(c);
    g.add(mass);
    const n = ci === clumps.length - 1 ? total - i : Math.round((total * cr * cr) / sumSq);
    for (let k = 0; k < n && i < total; k++, i++) {
      // A point on the clump's surface, more on top and on the sides than underneath.
      const u = r() * 2 - 1, a = r() * Math.PI * 2;
      const y = u < -0.5 ? u * 0.6 : u;
      const s = Math.sqrt(1 - y * y);
      const d = cr * (0.55 + r() * 0.5);
      dummy.position.set(c.x + Math.cos(a) * s * d, c.y + y * d * sy, c.z + Math.sin(a) * s * d);
      dummy.rotation.set((r() - 0.5) * 1.2, r() * Math.PI, (r() - 0.5) * 1.2);
      const sz = Math.max(0.35, crownR * 0.13) * (0.7 + r() * 0.6);
      dummy.scale.set(sz, sz, sz);
      dummy.updateMatrix();
      twigs.setMatrixAt(i, dummy.matrix);
      // Grey-green, a few silvery ones (the underside turned by the wind).
      const silver = r() < 0.18;
      twigs.setColorAt(i, silver ? col.setHSL(0.2, 0.08, 0.62 + r() * 0.1) : col.setHSL(0.19 + r() * 0.05, 0.18 + r() * 0.12, 0.3 + r() * 0.12));
    }
  });
  twigs.count = i;
  g.add(twigs);

  // Exactly the species' height, standing on y = 0 (the gnarled foot can dip a little below it).
  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - Math.min(0, box.min.y) - Math.max(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

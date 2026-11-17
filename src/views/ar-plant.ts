import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { crownDepth, crownRadius, type LeafKind, type TreeShape } from "@/models/plant-shape";
import { limb, rng, tuftTexture } from "@/views/ar-pine";
import { sprayTexture } from "@/views/ar-cypress";
import { leafTexture as narrowTexture } from "@/views/ar-olive";

/**
 * Any recognised plant for the AR view, built in code from its shape (models/plant-shape: the specimen as the AI saw
 * it, its species' card, else its form): trunk or stems leaning as seen, bare up to where the crown starts, branches
 * reaching into a crown of the given outline (columnar, conical, ovoid, round, spreading, umbrella, vase, weeping,
 * irregular, shrub), a dark inner body so it never looks see-through (smaller for an airy crown), and leaf tufts of the
 * species' kind (needles, scale-leaves, broad, compound or narrow leaves) in its own greens all over the outline, more
 * for a dense crown. Stands on y = 0, exactly h tall. A seed varies branches and tufts.
 */

let broadTex: THREE.Texture | null = null;
let compoundTex: THREE.Texture | null = null;
const barkCache = new Map<string, THREE.Texture>();

/** A twig of broad, oval, pointed leaves with a midrib, white-ish so instances tint it. */
function broadTexture() {
  if (broadTex) return broadTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(303);
  const leaf = (x: number, y: number, a: number, len: number) => {
    g.save(); g.translate(x, y); g.rotate(a);
    const w = len * 0.42, v = 175 + Math.floor(r() * 70);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(w, -len * 0.2, w * 0.8, -len * 0.8, 0, -len);
    g.bezierCurveTo(-w * 0.8, -len * 0.8, -w, -len * 0.2, 0, 0);
    g.fill();
    g.strokeStyle = "rgba(90,90,90,0.5)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -1); g.lineTo(0, -len * 0.92); g.stroke();
    for (let k = 1; k < 4; k++) { const yy = -len * k / 4.4; g.beginPath(); g.moveTo(0, yy); g.lineTo(w * 0.55, yy - len * 0.12); g.moveTo(0, yy); g.lineTo(-w * 0.55, yy - len * 0.12); g.stroke(); }
    g.restore();
  };
  g.strokeStyle = "rgb(130,115,100)"; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(64, 126); g.lineTo(64, 30); g.stroke();
  for (let k = 0; k < 9; k++) {
    const y = 118 - k * 11, side = k % 2 ? 1 : -1;
    leaf(64, y, side * (0.7 + r() * 0.4), 30 + r() * 12);
  }
  leaf(64, 30, (r() - 0.5) * 0.3, 32);
  broadTex = new THREE.CanvasTexture(c);
  broadTex.colorSpace = THREE.SRGBColorSpace;
  return broadTex;
}

/** A compound leaf: small oval leaflets in pairs along a stalk (ash, robinia, sophora), a few to a twig. */
function compoundTexture() {
  if (compoundTex) return compoundTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(404);
  for (let s = 0; s < 3; s++) {
    const x0 = 34 + s * 30, a = -Math.PI / 2 + (s - 1) * 0.35;
    const ex = x0 + Math.cos(a) * 110, ey = 126 + Math.sin(a) * 110;
    g.strokeStyle = "rgb(150,140,120)"; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x0, 126); g.lineTo(ex, ey); g.stroke();
    for (let k = 1; k <= 7; k++) {
      const f = k / 7.6, px = x0 + (ex - x0) * f, py = 126 + (ey - 126) * f;
      for (const side of [-1, 1]) {
        g.save(); g.translate(px, py); g.rotate(a + Math.PI / 2 + side * 1.2);
        const v = 180 + Math.floor(r() * 65);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.beginPath(); g.ellipse(0, -7, 4.2, 8, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
  }
  compoundTex = new THREE.CanvasTexture(c);
  compoundTex.colorSpace = THREE.SRGBColorSpace;
  return compoundTex;
}

const TEXTURES: Record<LeafKind, () => THREE.Texture> = {
  needle: tuftTexture, scale: sprayTexture, broad: broadTexture, compound: compoundTexture, narrow: narrowTexture,
};

/** Bark of a colour, plain or with pale peeling patches (plane tree) or dark fissures, drawn once per look. */
function barkTexture(color: string, kind: TreeShape["bark"]) {
  const key = `${color}-${kind}`;
  const had = barkCache.get(key);
  if (had) return had;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(color.length * 7 + 5);
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  if (kind === "patchy") {
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(225,215,190,${0.45 + r() * 0.35})` : `rgba(120,135,105,${0.3 + r() * 0.3})`;
      g.beginPath(); g.ellipse(r() * 128, r() * 256, 8 + r() * 18, 12 + r() * 26, r() * 3, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === "white") {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(40,36,32,${0.5 + r() * 0.4})`;
      g.fillRect(r() * 128, r() * 256, 6 + r() * 20, 1.5 + r() * 3);
    }
  } else {
    g.strokeStyle = kind === "fissured" ? "rgba(25,20,16,0.6)" : "rgba(25,20,16,0.28)";
    for (let i = 0; i < (kind === "fissured" ? 26 : 12); i++) {
      g.lineWidth = 1 + r() * (kind === "fissured" ? 3 : 1.5);
      g.beginPath();
      let x = r() * 128;
      g.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 14) { x += (r() - 0.5) * 8; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  barkCache.set(key, t);
  return t;
}

export function realPlant(shape: TreeShape, def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 59 + 3);
  const H = Math.max(0.4, def.h);
  const shrub = shape.crown === "shrub";
  const W = Math.max(0.3, shape.widthRatio * H);
  const R = W / 2;
  const g = new THREE.Group();

  // Where the crown sits: its foot above the bare trunk, its depth by outline (low for spreading and umbrella crowns).
  const crownFoot = H * shape.clearTrunk;
  const depth = H * crownDepth(shape.crown, shape.clearTrunk);
  const crownBase = H - depth;
  const leanRad = (shape.leanDeg * Math.PI) / 180, leanDir = r() * Math.PI * 2;
  // The crown's axis leans with the trunk: x/z offset at height y.
  const axisAt = (y: number) => ({ x: Math.cos(leanDir) * Math.tan(leanRad) * y, z: Math.sin(leanDir) * Math.tan(leanRad) * y });

  // Trunk(s): from the ground into the crown; stems splay a little at the foot when there are several.
  const woodGeos: THREE.BufferGeometry[] = [];
  const trunkR = Math.max(0.03, H * (shrub ? 0.012 : 0.034) * (shape.stems > 1 ? 0.7 : 1));
  const trunkTop = Math.max(crownFoot, crownBase) + depth * 0.45;
  for (let s = 0; s < shape.stems; s++) {
    const a = (s / shape.stems) * Math.PI * 2 + r();
    const splay = shape.stems > 1 ? R * (shrub ? 0.45 : 0.22) : 0;
    const top = axisAt(trunkTop);
    const pts = [0, 0.4, 1].map((t) => {
      const y = trunkTop * t, ax = axisAt(y);
      return new THREE.Vector3(ax.x + Math.cos(a) * splay * t, y, ax.z + Math.sin(a) * splay * t);
    });
    pts[2]!.set(top.x + Math.cos(a) * splay, trunkTop, top.z + Math.sin(a) * splay);
    woodGeos.push(limb(pts, trunkR, trunkR * 0.35, 8, 8));
  }
  const leaf = new THREE.Color(shape.leafColor);
  const hsl = { h: 0, s: 0, l: 0 };
  leaf.getHSL(hsl);
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
  const tuftGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const area = 2 * Math.PI * R * depth * 0.75 + Math.PI * R * R * 0.5;
  const n = Math.min(3200, Math.max(shrub ? 650 : 0, Math.round((150 + area * 30) * (0.45 + 0.75 * shape.density))));
  const tufts = new THREE.InstancedMesh(
    tuftGeo,
    new THREE.MeshStandardMaterial({ map: TEXTURES[shape.leaf](), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
    n,
  );
  const massMat = new THREE.MeshStandardMaterial({ color: leaf.clone().multiplyScalar(shrub ? 0.6 : 0.45), roughness: 1 });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.16, Math.min(1.3, Math.max(R, depth / 3) * (shrub ? 0.32 : 0.24)));
  const weeping = shape.crown === "weeping";
  let used = 0;
  const putTuft = (x: number, y: number, z: number, hang = false) => {
    if (used >= n) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(hang ? Math.PI + (r() - 0.5) * 0.4 : (r() - 0.5) * 1.1, r() * Math.PI, hang ? (r() - 0.5) * 0.3 : (r() - 0.5) * 1.1);
    const sz = size * (0.7 + r() * 0.6);
    dummy.scale.set(hang ? sz * 0.45 : sz, sz * (hang ? 1.6 : 1), hang ? sz * 0.45 : sz);
    dummy.updateMatrix();
    tufts.setMatrixAt(used, dummy.matrix);
    tufts.setColorAt(used, col.setHSL(hsl.h + (r() - 0.5) * 0.03, Math.min(1, hsl.s * (0.8 + r() * 0.4)), Math.min(0.85, hsl.l * (0.75 + r() * 0.55))));
    used++;
  };

  // Regular outlines (cones, columns): one continuous surface, as those trees are; leaves all over it.
  if (shape.crown === "conical" || shape.crown === "columnar") {
    const steps = 22, pts: THREE.Vector2[] = [];
    const inner = 0.45 + 0.4 * shape.density;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      pts.push(new THREE.Vector2(Math.max(0.001, R * inner * crownRadius(shape.crown, f)), crownBase + f * depth));
    }
    const body = new THREE.LatheGeometry(pts, 18);
    const bp = body.attributes["position"]!;
    const v = new THREE.Vector3();
    for (let i = 0; i < bp.count; i++) {
      v.fromBufferAttribute(bp, i);
      const k = 1 + Math.sin(v.y * 1.7 + Math.atan2(v.z, v.x) * 3) * 0.08;
      const ax = axisAt(v.y);
      bp.setXYZ(i, v.x * k + ax.x, v.y, v.z * k + ax.z);
    }
    body.computeVertexNormals();
    g.add(new THREE.Mesh(body, massMat));
    while (used < n) {
      let f = 0;
      for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < crownRadius(shape.crown, f) + 0.15) break; }
      const a = r() * Math.PI * 2, rad = R * crownRadius(shape.crown, f) * (0.78 + r() * 0.3), y = crownBase + f * depth, ax = axisAt(y);
      putTuft(ax.x + Math.cos(a) * rad, y, ax.z + Math.sin(a) * rad);
    }
  } else {
    // Every other outline: rounded clumps of leaves inside it, each at the end of a branch, with gaps between them
    // (wider for an airy crown) where the branches show, and one on top.
    const sy = Math.max(0.55, Math.min(1.2, depth / (2 * R) * 1.4));
    const k = shrub ? Math.round(Math.min(18, 9 + R * 3)) : Math.round(Math.max(6, Math.min(26, 6 + R * 1.5 + depth * 0.35)) * (shape.crown === "irregular" ? 0.75 : 1));
    const clumps: { c: THREE.Vector3; cr: number }[] = [];
    for (let i = 0; i < k; i++) {
      // Spread evenly: one height band each, turned by the golden angle, so no side of the crown is left empty.
      const f = shrub ? 0.12 + ((i + r()) / k) * 0.76 : 0.18 + ((i + r()) / k) * 0.72;
      const env = R * crownRadius(shape.crown, f);
      const cr = shrub ? Math.max(0.12, R * (0.4 + r() * 0.2)) : Math.max(0.25, R * (0.28 + r() * 0.2) * (0.75 + 0.35 * shape.density));
      const rpos = Math.max(0, env - cr * (shrub ? 1 : 0.75 + r() * 0.2));
      const a = i * 2.39996 + r() * 0.5;
      const y = crownBase + f * depth, ax = axisAt(y);
      clumps.push({ c: new THREE.Vector3(ax.x + Math.cos(a) * rpos, y, ax.z + Math.sin(a) * rpos), cr });
    }
    const topY = crownBase + depth * (shape.crown === "umbrella" ? 0.6 : 0.85), topAx = axisAt(topY);
    clumps.push({ c: new THREE.Vector3(topAx.x, topY, topAx.z), cr: Math.max(0.25, R * 0.4) });
    // Branches to the clumps (not for a shrub, whose stems are its branches).
    if (!shrub) {
      for (const { c } of clumps) {
        const fromY = Math.max(crownFoot, Math.min(c.y - depth * 0.25, crownBase + depth * 0.3)), from = axisAt(fromY);
        const droop = weeping ? -depth * 0.04 : 0;
        woodGeos.push(limb([
          new THREE.Vector3(from.x, fromY, from.z),
          new THREE.Vector3((from.x + c.x) / 2, (fromY + c.y) / 2 + depth * 0.05, (from.z + c.z) / 2),
          new THREE.Vector3(c.x, c.y + droop, c.z),
        ], trunkR * 0.45, trunkR * 0.12, 5, 6));
      }
    }
    const sumSq = clumps.reduce((t, cl) => t + cl.cr * cl.cr, 0);
    const curtain = weeping ? Math.round(n * 0.3) : 0;
    const crownTufts = n - curtain;
    clumps.forEach(({ c, cr }, ci) => {
      const mass = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), massMat);
      const mr = cr * (shrub ? 0.45 + 0.2 * shape.density : 0.35 + 0.3 * shape.density);
      mass.scale.set(mr, mr * sy, mr);
      mass.position.copy(c);
      g.add(mass);
      const m = ci === clumps.length - 1 ? crownTufts - used : Math.round((crownTufts * cr * cr) / sumSq);
      for (let t = 0; t < m; t++) {
        const u = r() * 2 - 1, a = r() * Math.PI * 2;
        const yy = u < -0.4 ? u * 0.6 : u, ss = Math.sqrt(1 - yy * yy), d = cr * (0.5 + r() * 0.55);
        putTuft(c.x + Math.cos(a) * ss * d, c.y + yy * d * sy, c.z + Math.sin(a) * ss * d);
      }
    });
    // A weeping crown hangs curtains of leaves from the crown's rim, mostly short, a few down to near the ground,
    // so the trunk shows inside them.
    if (weeping) {
      const rimY = crownBase + depth * 0.35;
      while (used < n) {
        const a = r() * Math.PI * 2;
        const f = 0.2 + r() * 0.4, env = R * crownRadius(shape.crown, f) * (0.95 + r() * 0.15);
        const y0 = crownBase + f * depth, ax = axisAt(y0);
        const drop = Math.pow(r(), 1.6) * Math.max(0.5, rimY - H * 0.12);
        putTuft(ax.x + Math.cos(a) * env, y0 - drop, ax.z + Math.sin(a) * env, true);
      }
    }
  }
  tufts.count = used;
  const bark = barkTexture(shape.barkColor, shape.bark).clone();
  bark.needsUpdate = true;
  bark.repeat.set(1, Math.max(1, H / 3));
  g.add(new THREE.Mesh(mergeGeometries(woodGeos)!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.92 })));
  g.add(tufts);

  // Exactly the species' height, standing on y = 0.
  const box = new THREE.Box3().setFromObject(g);
  if (box.min.y < 0) g.children.forEach((ch) => { ch.position.y -= box.min.y; });
  const real = box.max.y - box.min.y;
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

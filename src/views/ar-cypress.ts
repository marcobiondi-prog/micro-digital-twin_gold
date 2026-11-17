import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * The Italian cypress (Cupressus sempervirens, "cipresso") for the AR view, built in code with nothing to download: a
 * narrow flame-shaped column, widest at about a quarter of its height and tapering to a soft point, so dense it is
 * all foliage, with a short fibrous trunk showing only at the foot. A dark inner body (a lathe of the flame's outline,
 * a little lumpy) under thousands of upright sprays of scale-leaves (alpha-tested crossed planes of a drawn spray,
 * instanced, each its own dark green) so it reads as one solid green flame. Stands on y = 0, exactly h tall, its
 * widest point w across (kept between 8 % and 30 % of the height, as cypresses are). A seed varies its sway and sprays.
 */

let barkTex: THREE.Texture | null = null;
let sprayTex: THREE.Texture | null = null;

function rng(seed: number) {
  let s = (Math.abs(Math.round(seed)) % 2147483646) + 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Fibrous bark: long grey-brown strips running up the trunk. */
function barkTexture() {
  if (barkTex) return barkTex;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(53);
  g.fillStyle = "#6b5a4c";
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 46; i++) {
    const v = 70 + Math.floor(r() * 70);
    g.strokeStyle = r() < 0.5 ? `rgba(${v + 30},${v + 15},${v},0.7)` : `rgba(40,32,26,${0.4 + r() * 0.4})`;
    g.lineWidth = 1 + r() * 4;
    g.beginPath();
    let x = r() * c.width;
    g.moveTo(x, 0);
    for (let y = 0; y <= c.height; y += 12) { x += (r() - 0.5) * 5; g.lineTo(x, y); }
    g.stroke();
  }
  barkTex = new THREE.CanvasTexture(c);
  barkTex.colorSpace = THREE.SRGBColorSpace;
  barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
  return barkTex;
}

/** A spray of scale-leaves: a short twig branching into many small flat fronds, pointing up, white so instances tint it. */
function sprayTexture() {
  if (sprayTex) return sprayTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = rng(91);
  g.lineCap = "round";
  const frond = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const v = 190 + Math.floor(r() * 65);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    if (depth > 0) {
      for (let k = 0; k < 3; k++) {
        const t = 0.3 + k * 0.25;
        const bx = x + (ex - x) * t, by = y + (ey - y) * t;
        const side = k % 2 ? 1 : -1;
        frond(bx, by, a + side * (0.5 + r() * 0.3), len * 0.5, w * 0.7, depth - 1);
      }
    }
  };
  for (let i = 0; i < 5; i++) frond(64 + (r() - 0.5) * 30, 124, -Math.PI / 2 + (r() - 0.5) * 0.7, 60 + r() * 40, 5, 2);
  sprayTex = new THREE.CanvasTexture(c);
  sprayTex.colorSpace = THREE.SRGBColorSpace;
  return sprayTex;
}

/** The flame's radius at f (0 at the foliage's foot, 1 at the tip), its widest about a quarter of the way up. */
export function cypressRadius(f: number): number {
  if (f <= 0 || f >= 1) return f <= 0 ? 0.42 : 0;
  const rise = Math.min(1, 0.42 + 0.58 * Math.sqrt(f / 0.28));
  return rise * Math.pow(1 - f, 0.8) / Math.pow(0.72, 0.8);
}

export function realCypress(def: { h: number; w: number }, seed = 1): THREE.Group {
  const r = rng(seed * 131 + 7);
  const H = Math.max(2, def.h);
  const R = Math.min(H * 0.15, Math.max(H * 0.04, (def.w || H * 0.14) / 2));
  const g = new THREE.Group();

  // Trunk: a short fibrous foot, then hidden inside the column up to two thirds of the height.
  const foot = H * (0.03 + r() * 0.02);
  const trunkR = Math.max(0.06, R * 0.2);
  const trunk = new THREE.CylinderGeometry(trunkR * 0.55, trunkR, H * 0.66, 10, 1);
  trunk.translate(0, H * 0.33, 0);
  const flare = new THREE.CylinderGeometry(trunkR * 1.05, trunkR * 1.45, foot * 0.6, 10);
  flare.translate(0, foot * 0.3, 0);
  const bark = barkTexture().clone();
  bark.needsUpdate = true;
  bark.repeat.set(1, Math.max(1, H / 4));
  g.add(new THREE.Mesh(mergeGeometries([trunk, flare])!, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 })));

  // A gentle sway of the axis: the top leans a little (cypresses are rarely perfectly straight).
  const swayA = r() * Math.PI * 2, sway = H * (0.004 + r() * 0.01);
  const axis = (f: number) => ({ x: Math.cos(swayA) * sway * f * f, z: Math.sin(swayA) * sway * f * f });
  const span = H - foot;

  // Inner body: a lathe of the flame's outline at 82 % of its radius, made a little lumpy so its edge is not a perfect curve.
  const steps = 28, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push(new THREE.Vector2(Math.max(0.001, R * 0.82 * cypressRadius(f)), foot + f * span));
  }
  const body = new THREE.LatheGeometry(pts, 20);
  const bp = body.attributes["position"]!;
  const v = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) {
    v.fromBufferAttribute(bp, i);
    const f = (v.y - foot) / span;
    const k = 1 + (Math.sin(v.y * 2.3 + Math.atan2(v.z, v.x) * 3) * 0.07 + (r() - 0.5) * 0.06);
    const off = axis(f);
    bp.setXYZ(i, v.x * k + off.x, v.y, v.z * k + off.z);
  }
  body.computeVertexNormals();
  g.add(new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: "#172a1a", roughness: 1 })));

  // Sprays on the flame's surface, upright with a little splay, denser where it is widest.
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.4, 0);
  const sprayGeo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const area = 2 * Math.PI * R * span * 0.62;
  const n = Math.min(2600, Math.round(260 + area * 26));
  const sprays = new THREE.InstancedMesh(
    sprayGeo,
    new THREE.MeshStandardMaterial({ map: sprayTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }),
    n,
  );
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  const size = Math.max(0.28, R * 0.42);
  for (let i = 0; i < n; i++) {
    // Height by the surface's share (more sprays where the flame is wider), angle all round.
    let f = 0;
    for (let tries = 0; tries < 6; tries++) { f = r(); if (r() < cypressRadius(f) / 1.05) break; }
    const a = r() * Math.PI * 2;
    const rad = R * cypressRadius(f) * (0.8 + r() * 0.28);
    const off = axis(f);
    dummy.position.set(Math.cos(a) * rad + off.x, foot + f * span + (r() - 0.5) * size * 0.4, Math.sin(a) * rad + off.z);
    // Upright sprays, turned to face outwards, tilted a little away from the axis.
    dummy.rotation.set(0, -a + Math.PI / 2 + (r() - 0.5) * 0.8, 0);
    dummy.rotateX((r() - 0.5) * 0.35);
    dummy.rotateZ((r() < 0.5 ? -1 : 1) * (0.1 + r() * 0.25));
    const s = size * (0.7 + r() * 0.5) * (0.55 + 0.45 * Math.min(1, cypressRadius(f) * 1.4));
    dummy.scale.set(s * 0.8, s, s * 0.8);
    dummy.updateMatrix();
    sprays.setMatrixAt(i, dummy.matrix);
    sprays.setColorAt(i, col.setHSL(0.3 + r() * 0.06, 0.28 + r() * 0.14, 0.12 + r() * 0.1));
  }
  g.add(sprays);

  // Exactly the species' height.
  const box = new THREE.Box3().setFromObject(g);
  const real = box.max.y - Math.max(0, box.min.y);
  if (real > 0) g.scale.setScalar(H / real);
  return g;
}

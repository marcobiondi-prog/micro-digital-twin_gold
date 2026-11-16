import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A realistic wooden pergola for the AR view, built in code (no files to download): larch-coloured timber with its
 * own grain (drawn once on a canvas, the grain running along each piece), posts on steel base plates over concrete
 * footings, double main beams clamping the posts, knee braces, rafters and thin top battens, a few
 * bolts. Stands on y = 0, centred, w along x and d along z, h tall (the object's real sizes).
 */

let grainCache: { along: THREE.Texture; across: THREE.Texture; up: THREE.Texture } | null = null;

function grainCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#9a6a3f";
  g.fillRect(0, 0, c.width, c.height);
  // Long grain lines (vertical on the canvas), wavy, of slightly different browns.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) {
    const x0 = rnd() * c.width, amp = 2 + rnd() * 6, freq = 0.004 + rnd() * 0.01, w = 0.6 + rnd() * 2.2;
    const dark = rnd() < 0.6;
    g.strokeStyle = dark ? `rgba(70,42,20,${0.18 + rnd() * 0.3})` : `rgba(200,150,100,${0.12 + rnd() * 0.18})`;
    g.lineWidth = w;
    g.beginPath();
    for (let y = 0; y <= c.height; y += 8) { const x = x0 + Math.sin(y * freq + i) * amp; if (y === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  // A couple of knots.
  for (let k = 0; k < 3; k++) {
    const x = 30 + rnd() * (c.width - 60), y = 40 + rnd() * (c.height - 80), r = 5 + rnd() * 7;
    const rg = g.createRadialGradient(x, y, 1, x, y, r * 2.2);
    rg.addColorStop(0, "rgba(55,30,12,0.85)"); rg.addColorStop(0.45, "rgba(80,48,22,0.5)"); rg.addColorStop(1, "rgba(80,48,22,0)");
    g.fillStyle = rg;
    g.beginPath(); g.ellipse(x, y, r * 1.4, r * 2.4, 0, 0, Math.PI * 2); g.fill();
  }
  // Weathering: soft lighter and darker patches.
  for (let p = 0; p < 40; p++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,235,210,${rnd() * 0.06})` : `rgba(40,25,10,${rnd() * 0.07})`;
    g.fillRect(rnd() * c.width, rnd() * c.height, 20 + rnd() * 80, 30 + rnd() * 120);
  }
  return c;
}

function grain() {
  if (grainCache) return grainCache;
  const canvas = grainCanvas();
  const make = (rot: number) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.center.set(0.5, 0.5);
    t.rotation = rot;
    t.anisotropy = 4;
    return t;
  };
  // The canvas grain runs along v: "up" for posts, rotated a quarter turn for pieces lying along x or z.
  grainCache = { up: make(0), along: make(Math.PI / 2), across: make(Math.PI / 2) };
  return grainCache;
}

const wood = (map: THREE.Texture, tint = "#ffffff") => new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.82, metalness: 0 });

function piece(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

export function realPergola(def: { w: number; d: number; h: number }): THREE.Group {
  const g = new THREE.Group();
  const tex = grain();
  const postMat = wood(tex.up);
  const beamMat = wood(tex.along, "#f2e6d8");
  const rafterMat = wood(tex.across, "#e9dccb");
  const battenMat = wood(tex.along, "#dccab4");
  const steel = new THREE.MeshStandardMaterial({ color: "#3a3f45", roughness: 0.45, metalness: 0.75 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#a7a39b", roughness: 0.95 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.33, depthWrite: false });

  const W = def.w, D = def.d, H = def.h;
  const post = 0.15, beamH = 0.22, beamT = 0.06, rafterH = 0.18, rafterT = 0.05;
  const beamY = H - 0.55;                    // bottom of the main beams
  const rafterY = beamY + beamH;             // rafters sit on the beams
  const topY = rafterY + rafterH;            // battens sit on the rafters
  const hw = W / 2 - 0.3, hd = D / 2 - 0.1;  // posts set in from the beam ends

  // Posts: every 3 m or less along the two long sides.
  const n = Math.max(1, Math.ceil((2 * hw) / 3));
  const xs = Array.from({ length: n + 1 }, (_, i) => -hw + (2 * hw * i) / n);
  for (const z of [-hd, hd]) for (const x of xs) {
    const foot = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), shadowMat);
    foot.rotation.x = -Math.PI / 2; foot.position.set(x, 0.004, z);
    g.add(foot);
    g.add(piece(0.3, 0.06, 0.3, concrete, x, 0.03, z));             // concrete footing, flush with the floor
    g.add(piece(0.2, 0.012, 0.2, steel, x, 0.066, z));              // base plate
    g.add(piece(0.012, 0.16, post * 0.7, steel, x - post / 2 - 0.006, 0.15, z)); // the plate's two side cheeks
    g.add(piece(0.012, 0.16, post * 0.7, steel, x + post / 2 + 0.006, 0.15, z));
    const pH = beamY + beamH - 0.072;
    g.add(piece(post, pH, post, postMat, x, 0.072 + pH / 2, z));   // the post itself, up to the beams' top
    // Knee braces towards the beam, both sides along x (not past the ends).
    for (const s of [-1, 1]) {
      if ((s < 0 && x <= -hw + 1e-6) || (s > 0 && x >= hw - 1e-6)) continue;
      const L = 0.75, br = piece(0.07, L, 0.07, postMat, 0, 0, 0);
      br.rotation.z = -s * Math.PI / 4;
      br.position.set(x + s * (post / 2 + (L / 2) * Math.SQRT1_2), beamY - (L / 2) * Math.SQRT1_2 + 0.02, z);
      g.add(br);
    }
    // A pair of bolt heads through post and beams.
    for (const by of [beamY + 0.06, beamY + beamH - 0.06]) for (const sz of [-1, 1]) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.01, 10), steel);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(x, by, z + sz * (post / 2 + beamT + 0.005));
      g.add(bolt);
    }
  }
  // Main beams: a pair clamping each line of posts, running past the end posts.
  for (const z of [-hd, hd]) for (const sz of [-1, 1]) {
    const bz = z + sz * (post / 2 + beamT / 2);
    g.add(piece(W, beamH, beamT, beamMat, 0, beamY + beamH / 2, bz));
  }
  // Rafters across, every 60 cm, overhanging the beams.
  const nr = Math.max(2, Math.round(W / 0.6));
  for (let i = 0; i <= nr; i++) {
    const x = -W / 2 + 0.05 + ((W - 0.1) * i) / nr;
    g.add(piece(rafterT, rafterH, D + 0.5, rafterMat, x, rafterY + rafterH / 2, 0));
  }
  // Thin battens on top, every 25 cm.
  const nb = Math.max(2, Math.round((D + 0.3) / 0.25));
  for (let i = 0; i <= nb; i++) {
    const z = -(D + 0.3) / 2 + ((D + 0.3) * i) / nb;
    g.add(piece(W + 0.2, 0.04, 0.045, battenMat, 0, topY + 0.02, z));
  }
  // One mesh per material (about 107 draws down to 7), so the phone draws it in a few calls.
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const m of g.children as THREE.Mesh[]) {
    m.updateMatrix();
    const geo = m.geometry.clone().applyMatrix4(m.matrix);
    const list = byMat.get(m.material as THREE.Material) ?? [];
    list.push(geo.index ? geo.toNonIndexed() : geo);
    byMat.set(m.material as THREE.Material, list);
  }
  const out = new THREE.Group();
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}

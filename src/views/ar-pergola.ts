import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A realistic wooden pergola for the AR view, built in code (no files to download): larch-coloured timber with its
 * own grain (drawn once on a canvas, the grain running along each piece), posts on steel base plates over concrete
 * footings, double main beams clamping the posts, knee braces, rafters and thin top battens, a few
 * bolts, a shade cloth stretched over the battens with a scalloped valance, and climbing plants with lilac
 * flowers over it. Stands on y = 0, centred, w along x and d along z, h tall (the object's real sizes).
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
  const battenZs = Array.from({ length: nb + 1 }, (_, i) => -(D + 0.3) / 2 + ((D + 0.3) * i) / nb);
  out.add(shadeCloth(W, D, topY, battenZs));
  out.add(climbers(W, D, H, xs, hd, topY));
  return out;
}

/** Tiny seeded random, the same pergola on every device. */
function seeded(n: number) {
  let seed = n;
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

/** The shade cloth's picture: a woven off-white canvas with a faint weave and a few soft stains of weather. */
let clothTex: THREE.Texture | null = null;
function cloth(): THREE.Texture {
  if (clothTex) return clothTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const rnd = seeded(31);
  g.fillStyle = "#ece4d3"; g.fillRect(0, 0, 256, 256);
  // The weave: thin lines both ways, a little uneven.
  for (let i = 0; i < 256; i += 3) {
    g.fillStyle = `rgba(150,135,110,${0.08 + rnd() * 0.08})`; g.fillRect(i, 0, 1, 256);
    g.fillStyle = `rgba(255,255,250,${0.1 + rnd() * 0.1})`; g.fillRect(0, i, 256, 1);
  }
  for (let i = 0; i < 6; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 30 + rnd() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(170,150,115,0.10)"); gr.addColorStop(1, "rgba(170,150,115,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  clothTex = t;
  return t;
}

/**
 * The shade cloth laid over the battens: one sheet a little wider than the roof, sagging softly between the rafters and
 * at its free edges, with a rolled hem round it and a short scalloped valance hanging from the two long sides. Opaque
 * enough to throw its shadow on the floor, a little translucent seen from below.
 */
function shadeCloth(W: number, D: number, topY: number, battenZs: number[]): THREE.Group {
  const g = new THREE.Group();
  const cw = W + 0.28, cd = D + 0.6, y0 = topY + 0.05;
  const sx = Math.max(24, Math.round(cw / 0.1)), sz = Math.max(16, Math.round(cd / 0.12));
  const geo = new THREE.PlaneGeometry(cw, cd, sx, sz).rotateX(-Math.PI / 2);
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // A faint sag between the battens it rests on, deeper at the free ends past the roof.
    let near = Infinity;
    for (const bz of battenZs) near = Math.min(near, Math.abs(z - bz));
    const between = Math.min(1, near / 0.125);
    const edge = Math.min(1, Math.max(0, Math.abs(z) - (D / 2 + 0.26)) / 0.04); // past the rafter ends
    const out = Math.max(0, Math.abs(x) - W / 2 + 0.05) / 0.08;
    pos.setY(i, y0 - 0.006 * Math.sin((between * Math.PI) / 2) - 0.05 * edge * edge - 0.03 * Math.min(1, out));
  }
  geo.computeVertexNormals();
  const tex = cloth().clone(); tex.needsUpdate = true; tex.repeat.set(cw / 1.2, cd / 1.2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: "#f4ecdc", roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.93 });
  g.add(new THREE.Mesh(geo, mat));
  // Rolled hem all round.
  const hemMat = new THREE.MeshStandardMaterial({ color: "#d9cdb4", roughness: 0.9 });
  const hemY = y0 - 0.055;
  for (const z of [-cd / 2, cd / 2]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cw, 6).rotateZ(Math.PI / 2).translate(0, hemY, z), hemMat));
  for (const x of [-cw / 2, cw / 2]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cd, 6).rotateX(Math.PI / 2).translate(x, y0 - 0.03, 0), hemMat));
  // Scalloped valance from the long sides: a strip 18 cm deep with a wavy lower edge, about one wave every 40 cm.
  for (const side of [-1, 1]) {
    const vg = new THREE.PlaneGeometry(cw, 0.2, sx, 4);
    const vp = vg.attributes["position"] as THREE.BufferAttribute;
    for (let i = 0; i < vp.count; i++) {
      const x = vp.getX(i), y = vp.getY(i);
      if (y < 0) vp.setY(i, -0.1 - 0.05 * Math.abs(Math.sin((x / 0.4) * Math.PI)));
    }
    vg.translate(0, hemY - 0.01, 0);
    vg.translate(0, 0, side * (cd / 2 + 0.004));
    vg.computeVertexNormals();
    const vt = cloth().clone(); vt.needsUpdate = true; vt.repeat.set(cw / 1.2, 0.2);
    g.add(new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ map: vt, color: "#efe5d1", roughness: 0.95, side: THREE.DoubleSide })));
  }
  return g;
}

/** A leaf cluster texture: a few overlapping leaves of different greens on transparency, drawn once. */
let leafTex: THREE.Texture | null = null;
function leaves(): THREE.Texture {
  if (leafTex) return leafTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const greens = ["#2f6b2a", "#3f7f32", "#4f9440", "#5f9e46", "#2a5d26"];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 9; i++) {
    const x = 28 + rnd() * 72, y = 28 + rnd() * 72, a = rnd() * Math.PI * 2, l = 22 + rnd() * 14;
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = greens[i % greens.length]!;
    g.beginPath(); g.moveTo(0, -l); g.quadraticCurveTo(l * 0.55, 0, 0, l); g.quadraticCurveTo(-l * 0.55, 0, 0, -l); g.fill();
    g.strokeStyle = "rgba(20,45,15,0.55)"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -l * 0.9); g.lineTo(0, l * 0.9); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  leafTex = t;
  return t;
}

/**
 * Climbing plants (like a wisteria): leaf clusters spread over the roof (on top of the cloth), thicker along the beams, drooping in short
 * curtains from the edges, wound up some of the posts, and a few hanging lilac flower bunches. Instanced: one draw for
 * the leaves, one for the flowers.
 */
function climbers(W: number, D: number, H: number, xs: number[], hd: number, topY: number): THREE.Group {
  const g = new THREE.Group();
  let seed = 23;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const spots: Array<[number, number, number, number]> = []; // x, y, z, size
  // The roof: clusters over about two thirds of it, more along the two beams.
  for (let i = 0; i < 520; i++) {
    const nearBeam = rnd() < 0.45;
    const x = (rnd() - 0.5) * (W + 0.2);
    const z = nearBeam ? (rnd() < 0.5 ? -hd : hd) + (rnd() - 0.5) * 0.9 : (rnd() - 0.5) * (D + 0.2);
    if (!nearBeam && rnd() < 0.35) continue; // gaps where the light comes through
    spots.push([x, topY + 0.09 + rnd() * 0.1, z, 0.32 + rnd() * 0.28]); // over the cloth
  }
  // Curtains drooping from the long edges.
  for (const side of [-1, 1]) for (let i = 0; i < 70; i++) {
    const x = (rnd() - 0.5) * W, drop = rnd() * rnd() * 0.9;
    spots.push([x, topY - 0.1 - drop, side * (D / 2 + 0.2) + (rnd() - 0.5) * 0.12, 0.26 + rnd() * 0.18]);
  }
  // Stems wound up the corner posts and one more, leaves spiralling round them.
  const wound: Array<[number, number]> = [[xs[0]!, -hd], [xs[xs.length - 1]!, hd], [xs[Math.floor(xs.length / 2)]!, -hd]];
  for (const [px, pz] of wound) for (let y = 0.25; y < H - 0.5; y += 0.09) {
    const a = y * 7 + rnd();
    spots.push([px + Math.cos(a) * 0.14, y, pz + Math.sin(a) * 0.14, 0.18 + rnd() * 0.14]);
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshStandardMaterial({ map: leaves(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
  const tint = new THREE.Color();
  spots.forEach(([x, y, z, s], i) => {
    e.set(-Math.PI / 2 + (rnd() - 0.5) * 1.6, rnd() * Math.PI * 2, (rnd() - 0.5) * 1.2);
    q.setFromEuler(e); sc.set(s, s, s); pos.set(x, y, z);
    im.setMatrixAt(i, m.compose(pos, q, sc));
    im.setColorAt(i, tint.setHSL(0.27 + rnd() * 0.06, 0.45, 0.55 + rnd() * 0.25));
  });
  g.add(im);
  // Hanging lilac flower bunches under the roof.
  const fl = 46;
  const fgeo = new THREE.ConeGeometry(0.07, 0.32, 7);
  fgeo.rotateX(Math.PI); // point down
  const fim = new THREE.InstancedMesh(fgeo, new THREE.MeshStandardMaterial({ color: "#b8a2e0", roughness: 0.7 }), fl);
  for (let i = 0; i < fl; i++) {
    pos.set((rnd() - 0.5) * (W - 0.3), topY - 0.28 - rnd() * 0.12, (rnd() - 0.5) * (D - 0.2));
    q.setFromEuler(e.set((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3));
    const k = 0.8 + rnd() * 0.5; sc.set(k, k, k);
    fim.setMatrixAt(i, m.compose(pos, q, sc));
    fim.setColorAt(i, tint.setHSL(0.72 + rnd() * 0.05, 0.45, 0.72 + rnd() * 0.1));
  }
  g.add(fim);
  return g;
}

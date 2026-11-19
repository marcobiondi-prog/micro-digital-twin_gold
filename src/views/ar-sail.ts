import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Shade sails ("vele ombreggianti") for the AR view and the 3D maps, built in code (no files to download): the shade
 * patch is divided into sails of at most 6 m a side, each a sheet of woven fabric stretched between four galvanised
 * steel posts, two corners high and two low so the cloth twists like a real tensioned sail (a hyperbolic paraboloid),
 * its edges cut concave as sails are, a little sag in the middle, a dark hem round it and a steel tension line from
 * each corner to its post. Neighbouring sails share their posts and alternate high and low corners; the colours
 * alternate between off-white and sand. Posts stand on concrete footings flush with the floor, each with a soft
 * round shadow. Stands on y = 0, centred, w along x and d along z, h the sails' mean height (the object's real size).
 */

const SAIL_MAX = 6;          // a sail's longest side
const INSET = 0.35;          // the cloth's corner from its post (the tension line)
const CONCAVE = 0.13;        // how far each edge is cut in at its middle, as a share of the sail
const SAG = 0.1;             // the middle's drop, m

function seeded(n: number) {
  let seed = n;
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

/** The fabric's picture: an HDPE shade weave, fine lines both ways with a few slightly thicker threads. */
let weaveTex: THREE.Texture | null = null;
function weave(): THREE.Texture {
  if (weaveTex) return weaveTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const rnd = seeded(17);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 3) {
    g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.05})`;
    g.fillRect(i, 0, 1, 128);
    g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`;
    g.fillRect(0, i, 128, 1);
  }
  for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(0, rnd() * 128, 128, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  weaveTex = t;
  return t;
}

const FABRICS = ["#f1ebdd", "#dcc59b"];

/** A point of a sail's surface for (u, v) in [0, 1]²: bilinear between its corners, edges cut concave, a little sag. */
function sailPoint(c: THREE.Vector3[], u: number, v: number, out: THREE.Vector3) {
  // Concave edges: near the middle of each edge the cloth is pulled in towards the sail's centre.
  const uu = 0.5 + (u - 0.5) * (1 - CONCAVE * 4 * v * (1 - v));
  const vv = 0.5 + (v - 0.5) * (1 - CONCAVE * 4 * u * (1 - u));
  const [a, b, d, e] = c as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]; // a (0,0) b (1,0) d (1,1) e (0,1)
  out.set(
    a.x * (1 - uu) * (1 - vv) + b.x * uu * (1 - vv) + d.x * uu * vv + e.x * (1 - uu) * vv,
    a.y * (1 - uu) * (1 - vv) + b.y * uu * (1 - vv) + d.y * uu * vv + e.y * (1 - uu) * vv - SAG * Math.sin(Math.PI * uu) * Math.sin(Math.PI * vv),
    a.z * (1 - uu) * (1 - vv) + b.z * uu * (1 - vv) + d.z * uu * vv + e.z * (1 - uu) * vv,
  );
  return out;
}

function sailGeometry(c: THREE.Vector3[], seg = 14): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = new THREE.Vector3();
  const span = Math.max(c[0]!.distanceTo(c[1]!), c[0]!.distanceTo(c[3]!));
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    sailPoint(c, i / seg, j / seg, p);
    pos.push(p.x, p.y, p.z);
    uv.push((i / seg) * span * 2, (j / seg) * span * 2);
  }
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * (seg + 1) + i, b = a + 1, d = a + seg + 1, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A thin tube between two points (posts' tension lines). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r, r, len, 6, 1, true);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  geo.rotateX(Math.PI / 2);
  geo.applyMatrix4(m);
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo.toNonIndexed();
}

export function realSail(def: { w: number; d: number; h: number }): THREE.Group {
  const out = new THREE.Group();
  const W = Math.max(1.5, def.w), D = Math.max(1.5, def.d), H = Math.max(2.6, def.h);
  const nx = Math.max(1, Math.ceil(W / SAIL_MAX)), nz = Math.max(1, Math.ceil(D / SAIL_MAX));
  const cw = W / nx, cd = D / nz;
  // Posts on every node of the grid of sails, high and low in turn so each sail twists.
  const nodeX = (i: number) => -W / 2 + i * cw, nodeZ = (j: number) => -D / 2 + j * cd;
  const postTop = (i: number, j: number) => ((i + j) % 2 === 0 ? H + 0.55 : Math.max(2.4, H - 0.45));

  const steel = new THREE.MeshStandardMaterial({ color: "#a3acb4", roughness: 0.38, metalness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: "#3b4148", roughness: 0.6, metalness: 0.4 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#a7a39b", roughness: 0.95 });
  const shadowMat = new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.3, depthWrite: false });
  const steelGeo: THREE.BufferGeometry[] = [], darkGeo: THREE.BufferGeometry[] = [], concreteGeo: THREE.BufferGeometry[] = [];

  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = nodeX(i), z = nodeZ(j), top = postTop(i, j);
    const post = new THREE.CylinderGeometry(0.055, 0.065, top, 12);
    post.translate(x, top / 2 + 0.06, z);
    steelGeo.push(post.toNonIndexed());
    const cap = new THREE.SphereGeometry(0.07, 10, 6);
    cap.translate(x, top + 0.06, z);
    steelGeo.push(cap.toNonIndexed());
    const plate = new THREE.BoxGeometry(0.24, 0.015, 0.24);
    plate.translate(x, 0.068, z);
    darkGeo.push(plate.toNonIndexed());
    const footing = new THREE.BoxGeometry(0.34, 0.06, 0.34);
    footing.translate(x, 0.03, z);
    concreteGeo.push(footing.toNonIndexed());
    const foot = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), shadowMat);
    foot.rotation.x = -Math.PI / 2; foot.position.set(x, 0.004, z);
    out.add(foot);
  }

  const tex = weave();
  const fabrics = FABRICS.map((color) => new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  const hemGeo: THREE.BufferGeometry[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    // The sail's corners: each set in from its post towards the sail's middle, a little under the post's top.
    const cx = nodeX(i) + cw / 2, cz = nodeZ(j) + cd / 2;
    const nodes: Array<[number, number]> = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const corners = nodes.map(([a, b]) => {
      const px = nodeX(a), pz = nodeZ(b), len = Math.hypot(cx - px, cz - pz) || 1;
      return new THREE.Vector3(px + ((cx - px) / len) * INSET, postTop(a, b) - 0.12, pz + ((cz - pz) / len) * INSET);
    });
    out.add(new THREE.Mesh(sailGeometry(corners), fabrics[(i + j) % 2]!));
    // The hem round the sail's edge and the tension lines to the posts.
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    const edge = (f: (t: number) => [number, number]) => {
      for (let k = 0; k < 12; k++) {
        const [u0, v0] = f(k / 12), [u1, v1] = f((k + 1) / 12);
        hemGeo.push(rod(sailPoint(corners, u0, v0, p).clone(), sailPoint(corners, u1, v1, q).clone(), 0.014));
      }
    };
    edge((t) => [t, 0]); edge((t) => [1, t]); edge((t) => [1 - t, 1]); edge((t) => [0, 1 - t]);
    nodes.forEach(([a, b], k) => {
      const postAt = new THREE.Vector3(nodeX(a), postTop(a, b) - 0.04, nodeZ(b));
      hemGeo.push(rod(corners[k]!, postAt, 0.008));
    });
  }
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
    const merged = list.length ? mergeGeometries(list, false) : null;
    if (merged) out.add(new THREE.Mesh(merged, mat));
  };
  add(steelGeo, steel);
  add([...darkGeo, ...hemGeo], dark);
  add(concreteGeo, concrete);
  return out;
}

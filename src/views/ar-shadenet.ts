import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { drawn } from "@/views/ar-broadleaf";

/**
 * A vineyard shade net («Telo d’ombra») for the AR view, built in code: galvanised round posts every 4 m or less round
 * its edge on small concrete feet, a steel cable along every edge and across between the posts, and the knitted
 * dark green net (raschel weave drawn on a canvas, see-through between the threads) stretched over them, sagging a
 * little between the cables, with a lighter edging tape; at each corner a guy wire down to a ground anchor.
 * Stands on y = 0, centred, w along x and d along z, h tall.
 */

const netTex = drawn("shade-net2", 128, 128, (g, r) => {
  g.clearRect(0, 0, 128, 128);
  // Raschel knit: diagonal threads crossing, thicker warp lines, small open holes between them.
  g.strokeStyle = "rgba(28,48,32,1)";
  for (let i = -128; i < 256; i += 12) {
    g.lineWidth = 2.6; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    g.lineWidth = 1.8; g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke();
  }
  g.strokeStyle = "rgba(40,66,44,1)"; g.lineWidth = 2;
  for (let x = 0; x < 128; x += 32) { g.beginPath(); g.moveTo(x + r() * 0.5, 0); g.lineTo(x, 128); g.stroke(); }
}, true);

/** far: seen from afar (the map's 3D), where the weave's holes vanish in the texture's mipmaps and the net read as a
 * solid slab: drawn see-through instead, so the vines show under it as they do through a real net. */
export function realShadeNet(def: { w: number; d: number; h: number }, opts: { far?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  const W = Math.max(1, def.w), D = Math.max(1, def.d), H = Math.max(1.6, def.h);
  const galv = new THREE.MeshStandardMaterial({ color: "#a9b0b6", roughness: 0.4, metalness: 0.7 });
  const cableMat = new THREE.MeshStandardMaterial({ color: "#8a9096", roughness: 0.35, metalness: 0.8 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#a7a39b", roughness: 0.95 });
  const hw = W / 2, hd = D / 2;
  const nx = Math.max(1, Math.ceil(W / 4)), nz = Math.max(1, Math.ceil(D / 4));
  const xs = Array.from({ length: nx + 1 }, (_, i) => -hw + (W * i) / nx), zs = Array.from({ length: nz + 1 }, (_, i) => -hd + (D * i) / nz);

  // Posts round the edge, each on a concrete foot flush with the floor, a cap on top.
  const metal: THREE.BufferGeometry[] = [], feet: THREE.BufferGeometry[] = [], cables: THREE.BufferGeometry[] = [];
  const edgePosts: Array<[number, number]> = [];
  for (const x of xs) for (const z of zs) if (x === xs[0] || x === xs[nx] || z === zs[0] || z === zs[nz]) edgePosts.push([x, z]);
  for (const [x, z] of edgePosts) {
    metal.push(new THREE.CylinderGeometry(0.035, 0.04, H + 0.05, 10).translate(x, (H + 0.05) / 2, z));
    metal.push(new THREE.SphereGeometry(0.045, 10, 6).translate(x, H + 0.05, z));
    feet.push(new THREE.CylinderGeometry(0.14, 0.15, 0.05, 14).translate(x, 0.0, z));
  }
  // Cables: along every edge and across between opposite posts (both ways).
  const cable = (a: THREE.Vector3, b: THREE.Vector3, r = 0.006) => {
    const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(r, r, len, 5);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    cables.push(geo.translate(mid.x, mid.y, mid.z));
  };
  const top = H - 0.02;
  for (const x of xs) cable(new THREE.Vector3(x, top, -hd), new THREE.Vector3(x, top, hd));
  for (const z of zs) cable(new THREE.Vector3(-hw, top, z), new THREE.Vector3(hw, top, z));
  // Guy wires from the corners out to ground anchors.
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const) {
    const out = new THREE.Vector3(Math.sign(x) * 0.9, 0, Math.sign(z) * 0.9);
    const foot = new THREE.Vector3(x + out.x, 0.05, z + out.z);
    cable(new THREE.Vector3(x, top, z), foot, 0.005);
    metal.push(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8).translate(foot.x, 0.04, foot.z));
  }
  g.add(new THREE.Mesh(mergeGeometries(metal)!, galv));
  g.add(new THREE.Mesh(mergeGeometries(feet)!, concrete));
  g.add(new THREE.Mesh(mergeGeometries(cables)!, cableMat));

  // The net: a sheet over the cables, sagging between them, the weave see-through (alpha-tested so it also casts a
  // dappled shadow rather than a solid one).
  const sx = Math.max(16, Math.round(W / 0.15)), sz = Math.max(16, Math.round(D / 0.15));
  const geo = new THREE.PlaneGeometry(W, D, sx, sz).rotateX(-Math.PI / 2);
  const pos = geo.attributes["position"] as THREE.BufferAttribute;
  const cellX = W / nx, cellZ = D / nz;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const fx = ((x + hw) % cellX) / cellX, fz = ((z + hd) % cellZ) / cellZ;
    const sag = 0.06 * Math.sin(Math.PI * fx) * Math.sin(Math.PI * fz) + 0.015 * Math.sin(Math.PI * fx) + 0.015 * Math.sin(Math.PI * fz);
    pos.setY(i, H + 0.005 - sag);
  }
  geo.computeVertexNormals();
  const tex = netTex().clone(); tex.needsUpdate = true; tex.repeat.set(W / 0.35, D / 0.35); tex.anisotropy = 8;
  g.add(new THREE.Mesh(geo, opts.far
    ? new THREE.MeshStandardMaterial({ color: "#1f3a2a", transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, roughness: 0.85 })
    : new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85, color: "#ffffff" })));
  // Edging tape round the net.
  const tape = new THREE.MeshStandardMaterial({ color: "#3d5a40", roughness: 0.8 });
  for (const z of [-hd, hd]) g.add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.012, 0.05).translate(0, H, z), tape));
  for (const x of [-hw, hw]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, D).translate(x, H, 0), tape));
  return g;
}

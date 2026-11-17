import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { drawn } from "@/views/ar-broadleaf";
import { rng } from "@/views/ar-pine";

/**
 * A vineyard windbreak («Frangivento») for the AR view, built in code: a living hedge of shrubs and small trees in a row
 * (laurel, privet, viburnum-like), w long, d deep, h tall — short trunks showing at the foot, a lumpy uneven dark
 * green body, its top rising and falling from plant to plant, covered in sprays of small glossy leaves (instanced,
 * each its own green) that stick out of it so its outline is never a box. Stands on y = 0, centred along x.
 */

const sprayTex = drawn("hedge-spray", 64, 64, (g, r) => {
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = "rgb(110,90,60)"; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(32, 64); g.lineTo(32, 6); g.stroke();
  for (let i = 0; i < 14; i++) {
    const y = 6 + i * 4, s = i % 2 ? 1 : -1, l = 10 + r() * 6, w = 4 + r() * 2;
    const v = 170 + Math.floor(r() * 80);
    g.save(); g.translate(32, y); g.rotate(s * (0.7 + r() * 0.4));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -l / 2, 0, -l); g.quadraticCurveTo(-w, -l / 2, 0, 0); g.fill();
    g.restore();
  }
});

export function realWindbreak(def: { w: number; d: number; h: number }, seed = 1): THREE.Group {
  const r = rng(seed * 313 + 7);
  const g = new THREE.Group();
  const W = Math.max(1, def.w), D = Math.max(0.6, def.d), H = Math.max(1.2, def.h);
  const n = Math.max(2, Math.round(W / 1.1));             // one plant about every 1,1 m
  const bark = new THREE.MeshStandardMaterial({ color: "#5a4632", roughness: 0.95 });
  const body = new THREE.MeshStandardMaterial({ color: "#1d3a1c", roughness: 0.95 });
  const trunks: THREE.BufferGeometry[] = [], blobs: THREE.BufferGeometry[] = [];
  const plants: Array<{ x: number; z: number; h: number; rw: number }> = [];
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + (W * (i + 0.5)) / n + (r() - 0.5) * 0.3, z = (r() - 0.5) * D * 0.2;
    const h = H * (0.82 + r() * 0.22), rw = (W / n) * (0.75 + r() * 0.3);
    plants.push({ x, z, h, rw });
    for (let k = 0; k < 2; k++) trunks.push(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 6).translate(x + (r() - 0.5) * 0.2, 0.25, z + (r() - 0.5) * 0.2));
    // The plant's body: three lumps stacked, the lower widest, all within the hedge's depth.
    for (let k = 0; k < 3; k++) {
      const y = 0.45 + (h - 0.45) * (0.25 + k * 0.3), sy = (h - 0.45) * (0.32 - k * 0.04);
      const sph = new THREE.IcosahedronGeometry(1, 1);
      const p = sph.attributes["position"] as THREE.BufferAttribute;
      for (let j = 0; j < p.count; j++) { const f = 0.85 + r() * 0.3; p.setXYZ(j, p.getX(j) * f, p.getY(j) * f, p.getZ(j) * f); }
      blobs.push(sph.scale(rw * (0.62 - k * 0.08), sy, (D / 2) * (0.85 - k * 0.07)).translate(x, y, z));
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(trunks)!, bark));
  const bodyGeo = mergeGeometries(blobs.map((b) => b.toNonIndexed()))!;
  bodyGeo.computeVertexNormals();
  g.add(new THREE.Mesh(bodyGeo, body));

  // Leaf sprays over the bodies, pointing outwards, denser on the sides the wind and the eye meet.
  const count = Math.min(5000, Math.round(W * H * 140));
  const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const geo = mergeGeometries([plane.clone(), plane.clone().rotateY(Math.PI / 2)])!;
  const leaves = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: sprayTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55 }), count);
  const o = new THREE.Object3D(), col = new THREE.Color(), dir = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const p = plants[Math.floor(r() * plants.length)]!;
    const t = r() * Math.PI * 2, f = Math.acos(1 - 2 * r()), u = 0.45 + r() * (p.h - 0.45);
    // A point near the surface of the plant's body (an ellipsoid round its lumps).
    const cy = 0.45 + (p.h - 0.45) / 2, ry = (p.h - 0.45) / 2 + 0.05;
    dir.set(Math.sin(f) * Math.cos(t), Math.cos(f), Math.sin(f) * Math.sin(t));
    const y = Math.min(p.h, Math.max(0.4, cy + dir.y * ry));
    const widen = 1 - Math.pow(Math.abs(y - cy) / ry, 2) * 0.35;
    o.position.set(p.x + dir.x * p.rw * 0.55 * widen, y + (u - u), p.z + dir.z * (D / 2) * 0.95 * widen);
    o.lookAt(o.position.x + dir.x, o.position.y + dir.y, o.position.z + dir.z);
    o.rotateX(Math.PI / 2 - 0.4 + r() * 0.6);
    o.rotateY(r() * Math.PI);
    const s = 0.22 + r() * 0.14; o.scale.set(s, s, s);
    o.updateMatrix();
    leaves.setMatrixAt(i, o.matrix);
    leaves.setColorAt(i, col.setHSL(0.27 + r() * 0.06, 0.4 + r() * 0.15, 0.22 + r() * 0.14));
  }
  leaves.frustumCulled = false;
  g.add(leaves);
  return g;
}

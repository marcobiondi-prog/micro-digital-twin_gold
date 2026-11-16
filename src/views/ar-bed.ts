import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * A realistic flower bed for the AR view ("Aiuole e ciottoli"), planted in the ground, built in code with nothing to
 * download: a border of stones half sunk into the floor, a band of round pebbles inside it, dark soil level with the
 * floor and tufts of grass (crossed blades drawn once on a canvas) with small flowers on stems. Stands on y = 0,
 * centred, w along x and d along z; nothing is raised as a slab, so it reads as dug into the real floor.
 */

let seed = 11;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

let grassTex: THREE.Texture | null = null;
let soilTex: THREE.Texture | null = null;

function grassTexture() {
  if (grassTex) return grassTex;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 26; i++) {
    const x = 8 + rnd() * 112, lean = (rnd() - 0.5) * 50, top = 20 + rnd() * 90, w = 3 + rnd() * 4;
    const shade = 90 + Math.floor(rnd() * 70);
    g.fillStyle = `rgb(${40 + Math.floor(rnd() * 30)},${shade + 40},${30 + Math.floor(rnd() * 25)})`;
    g.beginPath();
    g.moveTo(x - w / 2, 256);
    g.quadraticCurveTo(x + lean * 0.4, 140, x + lean, top);
    g.quadraticCurveTo(x + lean * 0.4 + w * 0.4, 140, x + w / 2, 256);
    g.closePath();
    g.fill();
  }
  grassTex = new THREE.CanvasTexture(c);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  return grassTex;
}

function soilTexture() {
  if (soilTex) return soilTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4a3426";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    g.fillStyle = v < 0.5 ? `rgba(30,20,12,${0.25 + rnd() * 0.4})` : `rgba(120,92,66,${0.15 + rnd() * 0.3})`;
    const r = 0.6 + rnd() * 2.2;
    g.beginPath(); g.arc(rnd() * 256, rnd() * 256, r, 0, Math.PI * 2); g.fill();
  }
  soilTex = new THREE.CanvasTexture(c);
  soilTex.colorSpace = THREE.SRGBColorSpace;
  soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping;
  return soilTex;
}

const dummy = new THREE.Object3D();
const col = new THREE.Color();

export function realBed(def: { w: number; d: number }): THREE.Group {
  seed = 11;
  const g = new THREE.Group();
  const W = def.w, D = def.d, hw = W / 2, hd = D / 2;

  // Border stones, half buried: a ring of slightly different blocks along the edge.
  const stoneGeo = new THREE.BoxGeometry(1, 1, 1);
  const stoneMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92 });
  const stones: Array<[number, number, number, number]> = []; // x, z, length, rotation
  const L = 0.22;
  for (let x = -hw + L / 2; x <= hw - L / 2 + 1e-6; x += L) { stones.push([x, -hd + 0.05, L, 0], [x, hd - 0.05, L, 0]); }
  for (let z = -hd + 0.1 + L / 2; z <= hd - 0.1 - L / 2 + 1e-6; z += L) { stones.push([-hw + 0.05, z, L, Math.PI / 2], [hw - 0.05, z, L, Math.PI / 2]); }
  const border = new THREE.InstancedMesh(stoneGeo, stoneMat, stones.length);
  stones.forEach(([x, z, l, r], i) => {
    const h = 0.11 + rnd() * 0.03;
    dummy.position.set(x, h / 2 - 0.05, z); // sunk 5 cm into the floor
    dummy.rotation.set((rnd() - 0.5) * 0.06, r + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.06);
    dummy.scale.set(l - 0.015, h, 0.1);
    dummy.updateMatrix();
    border.setMatrixAt(i, dummy.matrix);
    const v = 0.62 + rnd() * 0.18;
    border.setColorAt(i, col.setRGB(v, v * 0.97, v * 0.92));
  });
  g.add(border);

  // Soil level with the floor, inside the stones.
  const iw = W - 0.2, id = D - 0.2;
  const soilT = soilTexture().clone();
  soilT.repeat.set(iw / 0.6, id / 0.6);
  soilT.needsUpdate = true;
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(iw, id), new THREE.MeshStandardMaterial({ map: soilT, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.008;
  soil.receiveShadow = true;
  g.add(soil);

  // A band of round pebbles inside the border, half sunk.
  const band = 0.14, pebbles: Array<[number, number]> = [];
  const ph = hw - 0.1, pd = hd - 0.1;
  for (let x = -ph; x <= ph; x += 0.045) for (let k = 0; k < 3; k++) {
    pebbles.push([x + (rnd() - 0.5) * 0.03, -pd + rnd() * band], [x + (rnd() - 0.5) * 0.03, pd - rnd() * band]);
  }
  for (let z = -pd + band; z <= pd - band; z += 0.045) for (let k = 0; k < 3; k++) {
    pebbles.push([-ph + rnd() * band, z + (rnd() - 0.5) * 0.03], [ph - rnd() * band, z + (rnd() - 0.5) * 0.03]);
  }
  const peb = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }), pebbles.length);
  const pebColors = ["#e7e2d7", "#cfc5b2", "#a39a8a", "#8c7b66", "#d9cdb4", "#b7b3ac"];
  pebbles.forEach(([x, z], i) => {
    const r = 0.016 + rnd() * 0.014;
    dummy.position.set(x, r * 0.25, z);
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.scale.set(r * (1 + rnd() * 0.4), r * 0.6, r);
    dummy.updateMatrix();
    peb.setMatrixAt(i, dummy.matrix);
    peb.setColorAt(i, col.set(pebColors[Math.floor(rnd() * pebColors.length)]!));
  });
  g.add(peb);

  // Grass tufts: two crossed blades planes each, on the soil inside the pebbles.
  const gw = W - 0.2 - 2 * band - 0.04, gd = D - 0.2 - 2 * band - 0.04;
  const blade = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const tuftGeo = mergeGeometries([blade.clone(), blade.clone().rotateY(Math.PI / 2)])!;
  const n = Math.min(900, Math.round(gw * gd * 150));
  const grass = new THREE.InstancedMesh(
    tuftGeo,
    new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }),
    n,
  );
  for (let i = 0; i < n; i++) {
    const s = 0.14 + rnd() * 0.12;
    dummy.position.set((rnd() - 0.5) * gw, 0, (rnd() - 0.5) * gd);
    dummy.rotation.set(0, rnd() * Math.PI, 0);
    dummy.scale.set(s * 0.9, s * (1 + rnd() * 0.5), s * 0.9);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, col.setHSL(0.25 + rnd() * 0.06, 0.5 + rnd() * 0.2, 0.42 + rnd() * 0.18));
  }
  g.add(grass);

  // Small flowers on stems among the grass.
  const nf = Math.max(8, Math.min(70, Math.round(gw * gd * 14)));
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.004, 0.005, 1, 4).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: "#3f7a2c", roughness: 0.9 }), nf);
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 }), nf);
  const hearts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: "#f5c542", roughness: 0.6 }), nf);
  const petals = ["#f472b6", "#facc15", "#ffffff", "#a78bfa", "#fb923c", "#f87171"];
  for (let i = 0; i < nf; i++) {
    const x = (rnd() - 0.5) * gw, z = (rnd() - 0.5) * gd, h = 0.2 + rnd() * 0.16;
    dummy.rotation.set((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25);
    dummy.position.set(x, 0, z); dummy.scale.set(1, h, 1); dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    const r = 0.025 + rnd() * 0.015;
    dummy.rotation.set(0, rnd() * 3, 0);
    dummy.position.set(x, h, z); dummy.scale.set(r, r * 0.35, r); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, col.set(petals[Math.floor(rnd() * petals.length)]!));
    dummy.position.set(x, h + r * 0.3, z); dummy.scale.setScalar(r * 0.35); dummy.updateMatrix();
    hearts.setMatrixAt(i, dummy.matrix);
  }
  g.add(stems, heads, hearts);
  return g;
}

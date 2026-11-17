import * as THREE from "three";
import { pointsFollowScale } from "@/views/ar-points";

/**
 * A realistic misting pole for the AR view, planted in the ground, built in code: a concrete footing flush with the
 * floor, a steel base flange with four bolts, a brushed-steel pole with its thin water pipe running up beside it, a
 * crown of six arms with brass nozzles at the top, and the mist itself — fine droplets drifting out of each nozzle,
 * falling, spreading and fading (points moved once a frame). Stands on y = 0, h tall.
 */

let dropTex: THREE.Texture | null = null;
function dropTexture() {
  if (dropTex) return dropTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.4, "rgba(235,248,255,0.35)");
  rg.addColorStop(1, "rgba(235,248,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  dropTex = new THREE.CanvasTexture(c);
  return dropTex;
}

const NOZZLES = 6;

export function realMister(def: { h: number }): THREE.Group {
  const g = new THREE.Group();
  const H = def.h;
  const steel = new THREE.MeshStandardMaterial({ color: "#c3c9d1", roughness: 0.35, metalness: 0.45 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: "#4b5259", roughness: 0.45, metalness: 0.75 });
  const brass = new THREE.MeshStandardMaterial({ color: "#c9a14a", roughness: 0.35, metalness: 0.55 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#a8a49c", roughness: 0.95 });

  // Footing: a concrete disc level with the floor (only 1 cm shows), the flange and bolts on it.
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.06, 24), concrete);
  foot.position.y = -0.02;
  g.add(foot);
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 20), darkSteel);
  flange.position.y = 0.017;
  g.add(flange);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6), darkSteel);
    bolt.position.set(Math.cos(a) * 0.08, 0.03, Math.sin(a) * 0.08);
    g.add(bolt);
  }
  // Pole and a collar near its foot.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, H - 0.02, 16), steel);
  pole.position.y = 0.02 + (H - 0.02) / 2;
  g.add(pole);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.08, 16), darkSteel);
  collar.position.y = 0.07;
  g.add(collar);
  // The water pipe running up beside the pole, with clips.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H - 0.1, 6), new THREE.MeshStandardMaterial({ color: "#2f3a46", roughness: 0.6 }));
  pipe.position.set(0.058, 0.05 + (H - 0.1) / 2, 0);
  g.add(pipe);
  for (let y = 0.4; y < H - 0.2; y += 0.6) {
    const clip = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.006, 6, 16), darkSteel);
    clip.rotation.x = Math.PI / 2; clip.position.y = y;
    g.add(clip);
  }
  // Crown: a cap, six arms and the ring with brass nozzles pointing down and out.
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  cap.position.y = H;
  g.add(cap);
  const R = 0.32, ringY = H - 0.06;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.014, 8, 36), steel);
  ring.rotation.x = Math.PI / 2; ring.position.y = ringY;
  g.add(ring);
  const nozzles: THREE.Vector3[] = [];
  for (let k = 0; k < NOZZLES; k++) {
    const a = (k / NOZZLES) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, R, 6), steel);
    arm.rotation.z = Math.PI / 2; arm.rotation.y = -a;
    arm.position.set(Math.cos(a) * R / 2, ringY, Math.sin(a) * R / 2);
    g.add(arm);
    const nz = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 8), brass);
    nz.position.set(Math.cos(a) * R, ringY - 0.025, Math.sin(a) * R);
    nz.rotation.set(0, 0, 0);
    g.add(nz);
    nozzles.push(new THREE.Vector3(Math.cos(a) * R, ringY - 0.05, Math.sin(a) * R));
  }

  // The mist: droplets leaving each nozzle outwards, slowing, falling and widening, fading out.
  const N = 360;
  const pos = new Float32Array(N * 3), colr = new Float32Array(N * 4);
  const age = new Float32Array(N), life = new Float32Array(N), vel = new Float32Array(N * 3), from = new Uint8Array(N);
  const spawn = (i: number, a0 = 0) => {
    const k = Math.floor(Math.random() * NOZZLES);
    from[i] = k;
    const dir = Math.atan2(nozzles[k]!.z, nozzles[k]!.x) + (Math.random() - 0.5) * 0.6;
    const sp = 0.35 + Math.random() * 0.45;
    vel[i * 3] = Math.cos(dir) * sp;
    vel[i * 3 + 1] = -0.15 - Math.random() * 0.2;
    vel[i * 3 + 2] = Math.sin(dir) * sp;
    life[i] = 2.4 + Math.random() * 1.8;
    age[i] = a0;
  };
  for (let i = 0; i < N; i++) spawn(i, Math.random() * 4);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3), colAttr = new THREE.BufferAttribute(colr, 4);
  geo.setAttribute("position", posAttr);
  geo.setAttribute("color", colAttr);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), H + 2);
  const mist = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.32, map: dropTexture(), transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true,
  }));
  mist.frustumCulled = false;
  let last = performance.now();
  const place = () => {
    for (let i = 0; i < N; i++) {
      const t = age[i]!, n = nozzles[from[i]!]!;
      // Air drag slows the sideways move; the droplets settle slowly as they evaporate.
      const drag = (1 - Math.exp(-t * 1.2)) / 1.2;
      pos[i * 3] = n.x + vel[i * 3]! * drag;
      pos[i * 3 + 1] = Math.max(0.15, n.y + vel[i * 3 + 1]! * t - 0.05 * t * t);
      pos[i * 3 + 2] = n.z + vel[i * 3 + 2]! * drag;
      const f = t / life[i]!;
      const a = f < 0.12 ? f / 0.12 : Math.max(0, 1 - (f - 0.12) / 0.88);
      colr[i * 4] = 1; colr[i * 4 + 1] = 1; colr[i * 4 + 2] = 1; colr[i * 4 + 3] = a * 0.55;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };
  place();
  mist.onBeforeRender = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    if (dt <= 0) return;
    last = now;
    for (let i = 0; i < N; i++) { age[i]! += dt; if (age[i]! > life[i]!) spawn(i); }
    place();
  };
  g.add(pointsFollowScale(mist));
  return g;
}

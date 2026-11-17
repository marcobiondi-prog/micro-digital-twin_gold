import * as THREE from "three";
import { pointsFollowScale } from "@/views/ar-points";

/**
 * A garden sprinkler («Innaffiatoio») for the AR view, built in code: a pop-up rotary head set flush in the ground —
 * a dark green body ring with its lid, a grey riser raised 10 cm and a turret with two nozzles turning slowly — and
 * the water: jets thrown in arcs from the turning nozzles, falling over a circle w/2 round, with a darker wet patch
 * on the ground under them (points moved once a frame). Stands on y = 0, centred.
 */

let dropTex: THREE.Texture | null = null;
function dropTexture() {
  if (dropTex) return dropTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.35, "rgba(220,240,255,0.6)");
  rg.addColorStop(1, "rgba(220,240,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  dropTex = new THREE.CanvasTexture(c);
  return dropTex;
}

export function realSprinkler(def: { w: number }): THREE.Group {
  const g = new THREE.Group();
  const R = Math.max(1, def.w / 2);
  const green = new THREE.MeshStandardMaterial({ color: "#1f5130", roughness: 0.6 });
  const grey = new THREE.MeshStandardMaterial({ color: "#6b7178", roughness: 0.5, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: "#22262a", roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: "#c9a14a", roughness: 0.35, metalness: 0.6 });

  // The wet patch: darker ground under the throw, fading at its rim.
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const cg = c.getContext("2d")!;
  const rg = cg.createRadialGradient(64, 64, 6, 64, 64, 64);
  rg.addColorStop(0, "rgba(10,25,35,0.10)"); rg.addColorStop(0.6, "rgba(10,25,35,0.28)"); rg.addColorStop(0.92, "rgba(10,25,35,0.22)"); rg.addColorStop(1, "rgba(10,25,35,0)");
  cg.fillStyle = rg; cg.fillRect(0, 0, 128, 128);
  const wet = new THREE.Mesh(new THREE.CircleGeometry(R * 1.05, 48), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  wet.rotation.x = -Math.PI / 2; wet.position.y = 0.004;
  g.add(wet);

  // The head: body ring flush with the floor, riser, turret with two nozzles.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 24), green);
  body.position.y = 0.012; g.add(body);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 8, 24), green);
  lip.rotation.x = Math.PI / 2; lip.position.y = 0.026; g.add(lip);
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 16), grey);
  riser.position.y = 0.075; g.add(riser);
  const turret = new THREE.Group(); turret.position.y = 0.13; g.add(turret);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.04, 16), black));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), black);
  cap.position.y = 0.02; turret.add(cap);
  for (const s of [1, -1]) {
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.03, 8), brass);
    nz.rotation.z = -s * (Math.PI / 2 - 0.45); nz.position.set(s * 0.032, 0.008, 0);
    turret.add(nz);
  }

  // The water: drops thrown from the two nozzles along their turning direction, in arcs that land over the circle.
  const N = 700, grav = 9.8, up = 0.6;               // ~35° up from the horizon
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 4);
  const age = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N), fl = new Float32Array(N);
  let angle = 0;
  const spawn = (i: number, a0 = 0) => {
    const nozzle = i % 2 ? 0 : Math.PI;
    const dir = angle + nozzle + (Math.random() - 0.5) * 0.08;
    const reach = R * (0.15 + 0.85 * Math.sqrt(Math.random()));  // the stream breaks up all along its throw
    const v = Math.sqrt((reach * grav) / Math.sin(2 * up)) * (0.97 + Math.random() * 0.06);
    vx[i] = Math.cos(dir) * Math.cos(up) * v; vz[i] = Math.sin(dir) * Math.cos(up) * v; vy[i] = Math.sin(up) * v;
    fl[i] = (2 * vy[i]!) / grav + 0.05;
    age[i] = a0;
  };
  for (let i = 0; i < N; i++) { angle = Math.random() * Math.PI * 2; spawn(i, Math.random() * 1.2); }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 4);
  geo.setAttribute("position", pa); geo.setAttribute("color", ca);
  const water = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, map: dropTexture(), transparent: true, depthWrite: false, vertexColors: true, sizeAttenuation: true }));
  water.frustumCulled = false;
  const y0 = 0.15;
  const place = () => {
    for (let i = 0; i < N; i++) {
      const t = Math.min(age[i]!, fl[i]!);
      pos[i * 3] = vx[i]! * t; pos[i * 3 + 1] = Math.max(0.01, y0 + vy[i]! * t - 0.5 * grav * t * t); pos[i * 3 + 2] = vz[i]! * t;
      const f = t / fl[i]!;
      col[i * 4] = 0.92; col[i * 4 + 1] = 0.97; col[i * 4 + 2] = 1; col[i * 4 + 3] = (f < 0.08 ? f / 0.08 : 1) * (age[i]! > fl[i]! ? 0 : 0.85);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;
  };
  place();
  let last = performance.now();
  water.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    if (dt <= 0) return;
    last = now;
    angle += dt * 0.9;                                // about one turn every 7 s
    turret.rotation.y = -angle;
    for (let i = 0; i < N; i++) { age[i]! += dt; if (age[i]! > fl[i]! + 0.05) spawn(i); }
    place();
  };
  g.add(pointsFollowScale(water));
  return g;
}

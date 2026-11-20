import * as THREE from "three";
import type { ArObjectDef } from "@/models/ar-objects";
import { realPapillons } from "@/views/ar-papillon";
import { realBed } from "@/views/ar-bed";
import { realMister } from "@/views/ar-mister";
import { realSprinkler } from "@/views/ar-sprinkler";
import { realShadeNet } from "@/views/ar-shadenet";
import { realWindbreak } from "@/views/ar-windbreak";
import { realDrip } from "@/views/ar-drip";

/**
 * The 3D shapes «Prova» puts in the real world, in metres, standing on y = 0 and centred on x = z = 0: the same simple
 * looks as the app's 3D map (trees as three cones, wooden pergolas, grass beds, misting poles, the vineyard's shade
 * cloth, windbreak and drip line). Light materials, few triangles: they run on the phone over the live camera.
 */
const mat = (color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

export function objectMesh(def: ArObjectDef): THREE.Group {
  const g = new THREE.Group();
  g.name = def.id;
  switch (def.id) {
    case "albero": {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 3, 10), mat("#5b3a21"));
      trunk.position.y = 1.5;
      g.add(trunk);
      const r = def.w / 2;
      ([[r, 2.5, 4.2], [r * 0.78, 4.6, 3.6], [r * 0.52, 6.6, 2.8]] as const satisfies ReadonlyArray<readonly [number, number, number]>).forEach(([rad, y, h], i) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 14), mat(["#2f6b2a", "#3c7d33", "#4b9140"][i]!));
        cone.position.y = y + h / 2;
        g.add(cone);
      });
      break;
    }
    case "pergolato": {
      // Round shade sails on leaning trunks (views/ar-papillon).
      // Two or more joined (a footprint larger than one sail) are one continuous canopy over all their trunks.
      // Built closed: they open by themselves only with light (ArLive shadeAuto).
      g.add(realPapillons({ w: def.w, d: def.d, h: def.h, open: 0, joined: Math.max(def.w, def.d) > 4.6 }));
      break;
    }
    case "aiuola": {
      // A realistic flower bed dug into the floor (views/ar-bed): sunk border stones, pebbles, soil, grass, flowers.
      g.add(realBed(def));
      break;
    }
    case "nebulizzatore": {
      // A realistic misting pole on a footing in the floor (views/ar-mister), with live mist.
      g.add(realMister(def));
      break;
    }
    case "innaffiatoio": {
      // A pop-up rotary sprinkler flush in the ground (views/ar-sprinkler), with turning jets and a wet patch.
      g.add(realSprinkler(def));
      break;
    }
    case "telo": {
      // A realistic shade net on galvanised posts and cables (views/ar-shadenet).
      g.add(realShadeNet(def));
      break;
    }
    case "frangivento": {
      // A realistic living hedge of shrubs (views/ar-windbreak).
      g.add(realWindbreak(def));
      break;
    }
    case "pianta": {
      plantMesh(g, def);
      break;
    }
    case "irrigazione": {
      // A realistic drip line on the soil (views/ar-drip): a main pipe across its start feeding a drip line along it.
      const hw = def.w / 2;
      g.add(realDrip([{ x: -hw, z: -0.6 }, { x: -hw, z: 0.6 }], true));
      g.add(realDrip([{ x: -hw, z: 0 }, { x: hw, z: 0 }]));
      break;
    }
  }
  return g;
}

/** A soft round shadow under an object, so it sits on the real floor. */
export function contactShadow(def: ArObjectDef): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CircleGeometry(Math.max(def.w, def.d) * 0.55, 24), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.28, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.005;
  return m;
}

/** A closed line on the floor through AR points (the area and its zones once aligned). */
export function floorLoop(points: Array<{ x: number; z: number }>, color: string): THREE.LineLoop {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0.02, p.z)));
  return new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color }));
}

/**
 * A recognised plant drawn after its species' shape and size: conical (fir, spruce), columnar (cypress, poplar), round
 * (holm oak, lime), umbrella (stone pine, palm-like), shrub (oleander, laurel), vine (a short row of vines on posts).
 * Evergreens a deeper green, deciduous trees a lighter one.
 */
function plantMesh(g: THREE.Group, def: ArObjectDef) {
  const form = def.plant?.form ?? "round";
  const ever = def.plant?.evergreen ?? true;
  const leaf = (i = 0) => mat(ever ? ["#255a26", "#2f6b2a", "#3a7a32"][i % 3]! : ["#4f8f3a", "#5fa044", "#6cad4c"][i % 3]!);
  const bark = mat("#5b3a21");
  const H = def.h, R = Math.max(0.2, def.w / 2);
  const trunk = (h: number, r: number) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 10), bark); t.position.y = h / 2; g.add(t); };
  switch (form) {
    case "conical": {
      trunk(H * 0.2, Math.max(0.08, R * 0.08));
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const k = i / tiers, h = H * 0.34;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(R * (1 - k * 0.72), h, 16), leaf(i));
        cone.position.y = H * 0.14 + k * H * 0.66 + h / 2;
        g.add(cone);
      }
      break;
    }
    case "columnar": {
      trunk(H * 0.12, Math.max(0.06, R * 0.12));
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), leaf(0));
      body.scale.set(R, H * 0.46, R); body.position.y = H * 0.54;
      g.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(R * 0.55, H * 0.22, 14), leaf(1));
      tip.position.y = H * 0.9; g.add(tip);
      break;
    }
    case "umbrella": {
      trunk(H * 0.72, Math.max(0.1, R * 0.07));
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), leaf(0));
      crown.scale.set(R, Math.max(0.6, H * 0.16), R); crown.position.y = H * 0.82;
      g.add(crown);
      const top = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), leaf(2));
      top.scale.set(R * 0.7, Math.max(0.4, H * 0.1), R * 0.7); top.position.y = H * 0.9;
      g.add(top);
      break;
    }
    case "shrub": {
      const parts: Array<[number, number, number, number]> = [[0, 0, 1, 0.62], [0.42, 0.18, 0.7, 0.5], [-0.38, -0.2, 0.72, 0.52], [0.1, -0.42, 0.6, 0.45]];
      parts.forEach(([x, z, s, y], i) => {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), leaf(i));
        b.scale.set(R * s, H * y, R * s); b.position.set(x * R, H * y * 0.8, z * R);
        g.add(b);
      });
      break;
    }
    case "vine": {
      const post = mat("#6b4a2b"), wood = mat("#4a3020");
      const len = def.w, n = Math.max(3, Math.round(len / 1.1));
      for (const x of [-len / 2, len / 2]) g.add(box(0.08, H + 0.2, 0.08, post, x, 0, 0));
      for (let i = 0; i < n; i++) {
        const x = -len / 2 + (i + 0.5) * (len / n);
        g.add(box(0.07, H * 0.45, 0.07, wood, x, 0, 0));
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), leaf(i));
        leaves.scale.set(len / n * 1.1, H * 0.32, def.d * 0.6); leaves.position.set(x, H * 0.7, 0);
        g.add(leaves);
      }
      break;
    }
    default: {
      trunk(H * 0.38, Math.max(0.1, R * 0.09));
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), leaf(0));
      crown.scale.set(R, H * 0.36, R); crown.position.y = H * 0.62;
      g.add(crown);
      for (const [x, z, s] of [[0.45, 0.2, 0.55], [-0.4, -0.25, 0.5], [0.05, 0.45, 0.45]] as const) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), leaf(1));
        lobe.scale.set(R * s, H * 0.22, R * s); lobe.position.set(x * R, H * 0.68, z * R);
        g.add(lobe);
      }
    }
  }
}

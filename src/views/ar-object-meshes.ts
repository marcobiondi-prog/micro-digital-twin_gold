import * as THREE from "three";
import type { ArObjectDef } from "@/models/ar-objects";

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
      const wood = mat("#7a4a22"), slat = mat("#c99a63");
      const hw = def.w / 2 - 0.1, hd = def.d / 2 - 0.1;
      for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) g.add(box(0.14, def.h - 0.2, 0.14, wood, x, 0, z));
      g.add(box(def.w, 0.18, 0.14, wood, 0, def.h - 0.4, -hd));
      g.add(box(def.w, 0.18, 0.14, wood, 0, def.h - 0.4, hd));
      for (let x = -hw; x <= hw + 1e-6; x += 0.5) g.add(box(0.08, 0.06, def.d, slat, x, def.h - 0.22, 0));
      break;
    }
    case "aiuola": {
      g.add(box(def.w, 0.12, def.d, mat("#c8b99c")));
      g.add(box(def.w - 0.15, def.h, def.d - 0.15, mat("#4f9a3e"), 0, 0.02, 0));
      break;
    }
    case "nebulizzatore": {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, def.h, 8), mat("#9aa4b2", { metalness: 0.6, roughness: 0.4 })).translateY(def.h / 2));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 20), mat("#f8fafc"));
      ring.rotation.x = Math.PI / 2; ring.position.y = def.h;
      g.add(ring);
      const mist = new THREE.Mesh(new THREE.ConeGeometry(1.6, def.h - 0.3, 20, 1, true), new THREE.MeshBasicMaterial({ color: "#bae6fd", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      mist.position.y = (def.h - 0.3) / 2; mist.rotation.x = Math.PI;
      g.add(mist);
      break;
    }
    case "telo": {
      const post = mat("#6b7280");
      const hw = def.w / 2, hd = def.d / 2;
      for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]]) g.add(box(0.06, def.h, 0.06, post, x, 0, z));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.d), new THREE.MeshStandardMaterial({ color: "#1f2937", transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      cloth.rotation.x = -Math.PI / 2; cloth.position.y = def.h;
      g.add(cloth);
      break;
    }
    case "frangivento": {
      g.add(box(def.w, def.h * 0.85, def.d, mat("#2f6b2a")));
      g.add(box(def.w, def.h * 0.15, def.d * 0.8, mat("#4b9140"), 0, def.h * 0.85, 0));
      break;
    }
    case "irrigazione": {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, def.w, 8), mat("#1d4ed8"));
      pipe.rotation.z = Math.PI / 2; pipe.position.y = 0.05;
      g.add(pipe);
      for (let x = -def.w / 2 + 0.3; x < def.w / 2; x += 0.6) {
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat("#e0f2fe"));
        drop.position.set(x, 0.09, 0);
        g.add(drop);
      }
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

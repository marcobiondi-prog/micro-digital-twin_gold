// Browser-only photographed plant placement on a virtual ground plane or ARCore real surfaces.
import * as THREE from "three";
import { isGroundPoint } from "@/lib/ar-orientation";
import { compactPlantHeight, nextPlantHeight } from "@/models/ar-placement";
import type { ArCoreHitPoint, ArCoreManager } from "@/lib/arcore";

type Options = { image: HTMLCanvasElement };
export type ArScene = {
  canvas: HTMLCanvasElement;
  place: (type: "tree" | "vine", nx: number, ny: number, nh: number, opts?: Options) => void;
  target: (nx: number, ny: number) => void;
  add: (type: "tree" | "vine", nx: number, ny: number, nh: number, opts?: Options) => boolean;
  setTilt: (beta: number, gamma: number) => void;
  /** Ancoraggio al movimento: yaw/pitch relativi all'orientamento iniziale, in gradi. */
  setMotion: (yaw: number, pitch: number) => void;
  /** Superficie indicativa del terreno visibile inquadrato, in m². */
  areaM2: () => number;
  removeLast: () => void;
  moveLast: (nx: number, ny: number) => boolean;
  scaleLast: (factor: number) => boolean;
  clear: () => void;
  render: (w: number, h: number, showGrid: boolean) => void;
  dispose: () => void;
  /** Integrazione ARCore: impostazione del manager di sessione o dell'hit reale */
  setRealSurfaceHit?: (hit: ArCoreHitPoint | null) => void;
  setArCoreManager?: (manager: ArCoreManager | null) => void;
  isArCoreTracking?: () => boolean;
};

/** Resolve CSS semantic colours through the browser before giving them to Three.js. */
export function arColorToken(name: string) {
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const ctx = c.getContext("2d");
  probe.remove();
  if (!ctx) return new THREE.Color();
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const pixel = ctx.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB((pixel[0] ?? 0) / 255, (pixel[1] ?? 0) / 255, (pixel[2] ?? 0) / 255, THREE.SRGBColorSpace);
}

export function createArScene(): ArScene {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  renderer.setClearAlpha(0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.1, 120);
  camera.position.set(0, 1.5, 0);
  camera.rotation.x = -Math.PI / 6;
  const ink = arColorToken("--ar-outline");
  // One wide grid reaching the horizon reads as an endless ground plane: 120 divisioni per leggerezza e fluidità.
  const grid = new THREE.GridHelper(160, 120, ink, ink);
  grid.position.z = -40;
  const gm = grid.material as THREE.Material;
  gm.transparent = true;
  gm.opacity = 0.65;
  gm.depthWrite = false;
  scene.add(grid);
  const target = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.25, 48), new THREE.MeshBasicMaterial({ color: ink, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  target.rotation.x = -Math.PI / 2;
  target.visible = false;
  scene.add(target);
  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const plants: THREE.Group[] = [];
  let arCoreManager: ArCoreManager | null = null;
  let realSurfaceHit: ArCoreHitPoint | null = null;

  const snap = (nx: number, ny: number) => {
    // 1. Priorità ad ARCore: superficie reale tracciata da WebXR
    if (realSurfaceHit?.isRealSurface) {
      return new THREE.Vector3(realSurfaceHit.x, realSurfaceHit.y, realSurfaceHit.z);
    }
    if (arCoreManager?.isActive()) {
      const hit = arCoreManager.performHitTest(nx, ny);
      if (hit) return new THREE.Vector3(hit.x, hit.y, hit.z);
    }
    // 2. Fallback su piano matematico orizzontale
    if (!isGroundPoint(ny)) return null;
    ray.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), camera);
    const hit = ray.ray.intersectPlane(ground, new THREE.Vector3());
    if (!hit || camera.position.distanceTo(hit) > 18) return null;
    return hit.set(Math.floor(hit.x) + 0.5, 0, Math.floor(hit.z) + 0.5);
  };
  const release = (obj: THREE.Object3D) => {
    scene.remove(obj);
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => { if (m instanceof THREE.MeshBasicMaterial) m.map?.dispose(); m.dispose(); });
      }
    });
  };
  // Superficie indicativa del terreno visibile: larghezza e profondità del piano inquadrato.
  const MAX_SNAP_DISTANCE = 18;
  const areaM2 = () => {
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * MAX_SNAP_DISTANCE;
    return Math.round(2 * halfHeight * camera.aspect * MAX_SNAP_DISTANCE);
  };
  const add: ArScene["add"] = (type, nx, ny, nh, opts) => {
    const hit = snap(nx, ny);
    if (!hit) return false;
    const root = new THREE.Group();
    if (!opts?.image) return false;
    // Crescita massima legata ai m² dell'ambiente inquadrato: più superficie, più chioma.
    const areaCap = Math.max(0.3, Math.sqrt(areaM2() / 60));
    const requestedHeight = Math.min(areaCap, 0.75, camera.position.distanceTo(hit) * Math.tan(Math.PI / 6) * nh * 0.65);
    const imageAspect = opts.image.width / opts.image.height;
    const height = compactPlantHeight(camera.position.distanceTo(hit), camera.fov, camera.aspect, imageAspect, requestedHeight);
    const texture = new THREE.CanvasTexture(opts.image);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plant = new THREE.Mesh(
      new THREE.PlaneGeometry(height * opts.image.width / opts.image.height, height),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide }),
    );
    plant.position.y = height / 2;
    root.add(plant);
    root.userData = { requestedHeight, imageAspect, initialHeight: height };
    root.position.copy(hit);
    scene.add(root);
    plants.push(root);
    target.visible = false;
    return true;
  };
  return {
    canvas,
    add,
    areaM2,
    place: (...args) => { plants.splice(0).forEach(release); add(...args); },
    target: (nx, ny) => { const hit = snap(nx, ny); target.visible = Boolean(hit); if (hit) target.position.copy(hit).setY(0.02); },
    // Inclinazione contenuta: la griglia resta sempre ancorata in basso, niente rotazioni ampie.
    setTilt: (beta, _gamma) => { camera.rotation.set(THREE.MathUtils.degToRad(Math.max(-40, Math.min(-15, beta - 90))), 0, 0, "YXZ"); },
    // Ancoraggio al movimento: la camera contro-ruota con il giroscopio (smorzata),
    // così le piante scansionate restano ferme sul loro punto mentre il telefono si muove.
    setMotion: (yaw, pitch) => {
      const targetYaw = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(yaw, -60, 60));
      const targetPitch = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(pitch - 90, -40, -15));
      camera.rotation.set(
        THREE.MathUtils.lerp(camera.rotation.x, targetPitch, 0.18),
        THREE.MathUtils.lerp(camera.rotation.y, -targetYaw, 0.18),
        0,
        "YXZ",
      );
    },
    removeLast: () => { const obj = plants.pop(); if (obj) release(obj); },
    moveLast: (nx, ny) => { const obj = plants.at(-1); if (!obj) return false; const hit = snap(nx, ny); if (!hit) return false; obj.position.copy(hit); return true; },
    scaleLast: (factor) => { const obj = plants.at(-1); if (!obj) return false; obj.userData['requestedHeight'] = nextPlantHeight(obj.userData['requestedHeight'], factor); return true; },
    clear: () => { plants.splice(0).forEach(release); target.visible = false; },
    render: (w, h, showGrid) => {
      if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      renderer.clear();
      const targetVisible = target.visible;
      const hasPlants = plants.length > 0;
      if (!showGrid && !hasPlants && !targetVisible) {
        return;
      }
      if (showGrid) {
        grid.visible = true;
        target.visible = false;
        plants.forEach((plant) => { plant.visible = false; });
        renderer.setScissor(0, 0, w, Math.floor(h * 0.52));
        renderer.setScissorTest(true);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);
        grid.visible = false;
      }
      if (hasPlants || targetVisible) {
        target.visible = targetVisible;
        plants.forEach((plant) => {
          plant.visible = true;
          const height = compactPlantHeight(camera.position.distanceTo(plant.position), camera.fov, camera.aspect, plant.userData['imageAspect'], plant.userData['requestedHeight']);
          plant.scale.setScalar(height / plant.userData['initialHeight']);
          plant.rotation.y = Math.atan2(camera.position.x - plant.position.x, camera.position.z - plant.position.z);
        });
        if (showGrid) renderer.autoClear = false;
        renderer.render(scene, camera);
        renderer.autoClear = true;
      }
    },
    dispose: () => { plants.splice(0).forEach(release); release(grid); release(target); renderer.dispose(); },
    setRealSurfaceHit: (hit) => { realSurfaceHit = hit; },
    setArCoreManager: (m) => { arCoreManager = m; },
    isArCoreTracking: () => Boolean(realSurfaceHit || arCoreManager?.isActive()),
  };
}

// Browser-only photographed plant placement on a virtual ground plane or ARCore real surfaces.
import * as THREE from "three";
import { isGroundPoint } from "@/lib/ar-orientation";
import { compactPlantHeight, nextPlantHeight } from "@/models/ar-placement";
import type { ArCoreHitPoint, ArCoreManager } from "@/lib/arcore";

export type PlantPlacementOptions = {
  image?: HTMLCanvasElement | undefined;
  is3D?: boolean | undefined;
  speciesName?: string | undefined;
  scientificName?: string | undefined;
  shadeM2?: number | undefined;
  cooling?: number | undefined;
};
export type ArScene = {
  canvas: HTMLCanvasElement;
  place: (type: "tree" | "vine", nx: number, ny: number, nh: number, opts?: PlantPlacementOptions) => boolean;
  target: (nx: number, ny: number) => boolean;
  add: (type: "tree" | "vine", nx: number, ny: number, nh: number, opts?: PlantPlacementOptions) => boolean;
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
  place3DTree?: (nx?: number, ny?: number, opts?: PlantPlacementOptions) => boolean;
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

/** Reticolo di ancoraggio 3D: doppio anello concentrico ciano con punto centrale e tacche sul terreno */
function createAnchorReticle(inkColor?: THREE.Color): THREE.Group {
  const group = new THREE.Group();
  const cyanColor = inkColor ?? new THREE.Color(0x00f0ff);

  // Anello esterno brillante
  const outerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.46, 0.50, 64),
    new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  outerRing.rotation.x = -Math.PI / 2;
  group.add(outerRing);

  // Anello interno
  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.30, 0.33, 64),
    new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
  );
  innerRing.rotation.x = -Math.PI / 2;
  group.add(innerRing);

  // Punto focale centrale
  const centerDot = new THREE.Mesh(
    new THREE.CircleGeometry(0.045, 32),
    new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
  );
  centerDot.rotation.x = -Math.PI / 2;
  group.add(centerDot);

  // 4 tacche direzionali attorno all'anello
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const tick = new THREE.Mesh(
      new THREE.PlaneGeometry(0.02, 0.10),
      new THREE.MeshBasicMaterial({ color: cyanColor, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = angle;
    tick.position.set(Math.cos(angle) * 0.54, 0, Math.sin(angle) * 0.54);
    group.add(tick);
  }

  return group;
}

/** Card Dati Termici: scheda galleggiante 3D orientata verso la fotocamera con freccia verso il reticolo */
function createThermalCardSprite(commonName: string, scientificName: string, shadeM2: number, cooling: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 640, 240);

    const x = 30, y = 20, w = 580, h = 150, r = 24;
    ctx.save();
    ctx.fillStyle = "rgba(18, 24, 32, 0.92)";
    ctx.strokeStyle = "rgba(0, 240, 255, 0.55)";
    ctx.lineWidth = 3;

    // Card arrotondata con puntatore triangolare rivolto verso il basso
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);

    const cx = x + w / 2;
    ctx.lineTo(cx + 20, y + h);
    ctx.lineTo(cx, y + h + 22);
    ctx.lineTo(cx - 20, y + h);

    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Riga 1: Nome comune (Nome scientifico)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.fillText(`${commonName} (${scientificName})`, x + 30, y + 62);

    // Riga 2: Ombra stimata ≈ X m² · Raffrescamento ≈ -X °C
    ctx.fillStyle = "#00e5ff";
    ctx.font = "500 24px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const coolingVal = Math.abs(cooling);
    ctx.fillText(`Ombra stimata ≈ ${Math.round(shadeM2)} m² · Raffrescamento ≈ -${coolingVal.toFixed(1)} °C`, x + 30, y + 114);

    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 0.43, 1.0);
  return sprite;
}

/** Modello 3D volumetrico dell'albero (Leccio - Quercus ilex) con tronco, chioma organica, ombra al suolo, reticolo e card */
function create3DTreeModel(options: {
  speciesName?: string;
  scientificName?: string;
  shadeM2?: number;
  cooling?: number;
  height?: number;
}): THREE.Group {
  const root = new THREE.Group();
  const scale = options.height ?? 1.8;

  // Tronco e rami con materiale corteccia scura ombreggiata
  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x423328,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
  });

  const trunkH = 0.75 * scale;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045 * scale, 0.075 * scale, trunkH, 10),
    barkMat
  );
  trunk.position.y = trunkH / 2;
  root.add(trunk);

  // Radice allargata al suolo
  const rootFlare = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075 * scale, 0.12 * scale, 0.09 * scale, 10),
    barkMat
  );
  rootFlare.position.y = (0.09 * scale) / 2;
  root.add(rootFlare);

  // Rami principali divergenti
  const bGeom = new THREE.CylinderGeometry(0.024 * scale, 0.04 * scale, 0.45 * scale, 8);
  const b1 = new THREE.Mesh(bGeom, barkMat);
  b1.position.set(0.05 * scale, trunkH * 0.85, 0.04 * scale);
  b1.rotation.set(0.35, 0.4, -0.3);
  root.add(b1);

  const b2 = new THREE.Mesh(bGeom, barkMat);
  b2.position.set(-0.05 * scale, trunkH * 0.9, -0.04 * scale);
  b2.rotation.set(-0.3, 2.1, 0.35);
  root.add(b2);

  const b3 = new THREE.Mesh(bGeom, barkMat);
  b3.position.set(0.04 * scale, trunkH * 0.95, -0.05 * scale);
  b3.rotation.set(0.15, -1.8, -0.4);
  root.add(b3);

  // Chioma a lobi volumetrici sempreverdi tipica del Leccio
  const foliageGroup = new THREE.Group();
  const matDark = new THREE.MeshStandardMaterial({ color: 0x223a1a, roughness: 0.8, flatShading: true });
  const matMid = new THREE.MeshStandardMaterial({ color: 0x2e4e22, roughness: 0.74, flatShading: true });
  const matLight = new THREE.MeshStandardMaterial({ color: 0x3d642d, roughness: 0.68, flatShading: true });

  const clusters: { r: number; pos: [number, number, number]; mat: THREE.Material }[] = [
    { r: 0.42 * scale, pos: [0, trunkH + 0.35 * scale, 0], mat: matMid },
    { r: 0.35 * scale, pos: [0, trunkH + 0.65 * scale, 0], mat: matLight },
    { r: 0.32 * scale, pos: [0.22 * scale, trunkH + 0.3 * scale, 0.15 * scale], mat: matLight },
    { r: 0.30 * scale, pos: [-0.2 * scale, trunkH + 0.35 * scale, -0.18 * scale], mat: matDark },
    { r: 0.28 * scale, pos: [0.15 * scale, trunkH + 0.45 * scale, -0.22 * scale], mat: matMid },
    { r: 0.28 * scale, pos: [-0.18 * scale, trunkH + 0.48 * scale, 0.18 * scale], mat: matMid },
    { r: 0.24 * scale, pos: [0.18 * scale, trunkH + 0.1 * scale, 0.12 * scale], mat: matDark },
    { r: 0.24 * scale, pos: [-0.16 * scale, trunkH + 0.12 * scale, -0.14 * scale], mat: matDark },
    { r: 0.22 * scale, pos: [0.05 * scale, trunkH + 0.85 * scale, 0.02 * scale], mat: matLight },
  ];

  clusters.forEach(({ r, pos, mat }) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    mesh.position.set(...pos);
    foliageGroup.add(mesh);
  });
  root.add(foliageGroup);

  // Ombra calcolata sfumata al suolo
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext("2d");
  if (sctx && typeof sctx.createRadialGradient === "function") {
    const grad = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
    grad.addColorStop(0, "rgba(8, 14, 10, 0.85)");
    grad.addColorStop(0.4, "rgba(10, 16, 12, 0.60)");
    grad.addColorStop(0.75, "rgba(12, 20, 14, 0.25)");
    grad.addColorStop(1, "rgba(12, 20, 14, 0.0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
  }
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4 * scale, 1.2 * scale),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
  );
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0.12 * scale, 0.003, 0.08 * scale);
  root.add(shadowMesh);

  // Reticolo di ancoraggio luminoso alla base
  const reticle = createAnchorReticle(new THREE.Color(0x00f0ff));
  reticle.position.set(0, 0.006, 0);
  root.add(reticle);

  // Card termica galleggiante nello spazio 3D
  const card = createThermalCardSprite(
    options.speciesName || "Leccio",
    options.scientificName || "Quercus ilex",
    options.shadeM2 ?? 18,
    options.cooling ?? 0.4
  );
  card.position.set(0, 0.45 * scale, 0.3 * scale);
  root.add(card);

  return root;
}

export function createArScene(): ArScene {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
  renderer.setClearAlpha(0);
  const scene = new THREE.Scene();

  // Luci per rendere il volume 3D dell'albero e della chioma fotorealistici
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.4);
  dirLight.position.set(4, 10, 5);
  scene.add(dirLight);

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

  // Reticolo di puntamento 3D sul terreno
  const target = createAnchorReticle(ink);
  target.visible = false;
  scene.add(target);

  const ray = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const plants: THREE.Group[] = [];
  const planesGroup = new THREE.Group();
  scene.add(planesGroup);
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

      // Snap sul piano orizzontale reale rilevato più vicino
      const planes = arCoreManager.getDetectedPlanes?.()?.filter((p) => p.orientation === "horizontal") ?? [];
      if (planes.length > 0 && isGroundPoint(ny)) {
        ray.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), camera);
        for (const pl of planes) {
          const planeGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), -pl.center.y);
          const planeHit = ray.ray.intersectPlane(planeGround, new THREE.Vector3());
          if (planeHit && camera.position.distanceTo(planeHit) <= 18) {
            return planeHit;
          }
        }
      }
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
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line || child instanceof THREE.Sprite) {
        child.geometry?.dispose?.();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => {
          if (m && "map" in m && m.map) m.map.dispose?.();
          m?.dispose?.();
        });
      }
    });
  };
  const clearPlanes = () => {
    while (planesGroup.children.length > 0) {
      const child = planesGroup.children[0];
      if (child) {
        planesGroup.remove(child);
        release(child);
      }
    }
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

    // Se richiesto modello 3D, oppure tipo tree senza ritaglio fotografico: posiziona albero 3D
    if (opts?.is3D || !opts?.image || type === "tree") {
      const tree = create3DTreeModel({
        speciesName: opts?.speciesName ?? "Leccio",
        scientificName: opts?.scientificName ?? "Quercus ilex",
        shadeM2: opts?.shadeM2 ?? 18,
        cooling: opts?.cooling ?? 0.4,
        height: 1.8,
      });
      tree.position.copy(hit);
      tree.userData = { is3D: true, hit: hit.clone() };
      scene.add(tree);
      plants.push(tree);
      target.visible = false;
      return true;
    }

    const root = new THREE.Group();
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
    root.userData = { is3D: false, requestedHeight, imageAspect, initialHeight: height };
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
    place: (...args) => { plants.splice(0).forEach(release); return add(...args); },
    place3DTree: (nx = 0.5, ny = 0.65, opts) => {
      plants.splice(0).forEach(release);
      return add("tree", nx, ny, 1, { ...opts, is3D: true });
    },
    target: (nx, ny) => {
      const hit = snap(nx, ny);
      target.visible = Boolean(hit);
      if (hit) target.position.copy(hit).setY(hit.y + 0.015);
      return Boolean(hit);
    },
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
    scaleLast: (factor) => {
      const obj = plants.at(-1);
      if (!obj) return false;
      if (obj.userData['is3D']) {
        obj.scale.multiplyScalar(factor > 1 ? 1.15 : 0.85);
        return true;
      }
      obj.userData['requestedHeight'] = nextPlantHeight(obj.userData['requestedHeight'], factor);
      return true;
    },
    clear: () => { plants.splice(0).forEach(release); target.visible = false; },
    render: (w, h, showGrid) => {
      if (canvas.width !== w || canvas.height !== h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
      renderer.clear();
      const targetVisible = target.visible;
      const hasPlants = plants.length > 0;

      // Aggiornamento geometrie dei piani reali tracciati da ARCore
      const detectedPlanes = arCoreManager?.getDetectedPlanes?.() ?? [];
      const horizontalPlanes = detectedPlanes.filter((p) => p.orientation === "horizontal" && p.polygon.length >= 3);
      if (horizontalPlanes.length > 0) {
        clearPlanes();
        horizontalPlanes.forEach((pl) => {
          try {
            const shape = new THREE.Shape();
            pl.polygon.forEach((pt, i) => {
              if (i === 0) shape.moveTo(pt.x, -pt.z);
              else shape.lineTo(pt.x, -pt.z);
            });
            shape.closePath();
            const geom = new THREE.ShapeGeometry(shape);
            geom.rotateX(-Math.PI / 2);
            const planeMesh = new THREE.Mesh(
              geom,
              new THREE.MeshBasicMaterial({
                color: ink,
                transparent: true,
                opacity: 0.18,
                depthWrite: false,
                side: THREE.DoubleSide,
              })
            );
            planeMesh.position.set(pl.center.x, pl.center.y + 0.005, pl.center.z);
            planesGroup.add(planeMesh);

            const borderPts = pl.polygon.map((pt) => new THREE.Vector3(pt.x, 0.008, pt.z));
            if (borderPts.length > 0 && borderPts[0]) borderPts.push(borderPts[0].clone());
            const lineGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
            const borderLine = new THREE.Line(
              lineGeom,
              new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.75 })
            );
            borderLine.position.set(pl.center.x, pl.center.y, pl.center.z);
            planesGroup.add(borderLine);
          } catch {
            // Geometria non valida o degenere, ignora
          }
        });
      } else if (planesGroup.children.length > 0) {
        clearPlanes();
      }

      if (!showGrid && !hasPlants && !targetVisible && planesGroup.children.length === 0) {
        return;
      }
      if (showGrid) {
        grid.visible = true;
        planesGroup.visible = true;
        target.visible = false;
        plants.forEach((plant) => { plant.visible = false; });
        renderer.setScissor(0, 0, w, Math.floor(h * 0.52));
        renderer.setScissorTest(true);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);
        grid.visible = false;
        planesGroup.visible = false;
      }
      if (hasPlants || targetVisible) {
        target.visible = targetVisible;
        plants.forEach((plant) => {
          plant.visible = true;
          if (!plant.userData['is3D']) {
            const height = compactPlantHeight(
              camera.position.distanceTo(plant.position),
              camera.fov,
              camera.aspect,
              plant.userData['imageAspect'] || 1,
              plant.userData['requestedHeight'] || 0.75
            );
            if (plant.userData['initialHeight']) {
              plant.scale.setScalar(height / plant.userData['initialHeight']);
            }
            plant.rotation.y = Math.atan2(camera.position.x - plant.position.x, camera.position.z - plant.position.z);
          }
        });
        if (showGrid) renderer.autoClear = false;
        renderer.render(scene, camera);
        renderer.autoClear = true;
      }
    },
    dispose: () => { plants.splice(0).forEach(release); clearPlanes(); release(grid); release(target); release(planesGroup); renderer.dispose(); },
    setRealSurfaceHit: (hit) => { realSurfaceHit = hit; },
    setArCoreManager: (m) => { arCoreManager = m; },
    isArCoreTracking: () => Boolean(realSurfaceHit || arCoreManager?.isActive() || (arCoreManager?.getDetectedPlanes?.()?.length ?? 0) > 0),
  };
}

import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { vineRowSegments, type LatLng } from "@/models/area-layout";
import { recognisedPlants } from "@/models/ar-objects";
import { currentScans } from "@/models/ar-scan-log";
import { growPlan, layoutPlan } from "@/views/ar-plan";
import { castShadows } from "@/views/ar-shadow";
import type { SimLayout } from "@/views/v10/map-area";

/**
 * The simulation's objects in the open 3D drawn by three.js inside the maplibre map (a custom 3D layer sharing its
 * WebGL context and depth): the very realistic models of the AR view (views/ar-plan layoutPlan: pergolas with cloth
 * and ivy, aiuole, misting poles with their mist, sprinklers, shade nets, hedges, drip lines, and the trees grown as
 * the species recognised with the AI camera, else the realistic oak), plus the vines plant by plant along their rows —
 * lit by the simulation's sun (its
 * season and hour: direction, warmth and strength) with soft shadows on the ground, instanced so thousands of vines
 * stay fluid. Local frame: metres from the area's origin, x east, y up, z south.
 */
export type Sun = { az: number; alt: number } | null;
export type SimThreeLayer = CustomLayerInterface & { update: (sim: SimLayout | null, sun: Sun) => void };

const MAX_VINES = 24_000, VINE_STEP = 1.1;

export function simThreeLayer(maplibregl: typeof import("maplibre-gl"), origin: [number, number], lite = false): SimThreeLayer {
  const [lng0, lat0] = origin;
  const merc = maplibregl.MercatorCoordinate.fromLngLat({ lng: lng0, lat: lat0 }, 0);
  const s = merc.meterInMercatorCoordinateUnits();
  const model = new THREE.Matrix4().makeTranslation(merc.x, merc.y, merc.z ?? 0).scale(new THREE.Vector3(s, -s, s)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  /** lat/lng → local metres (x east, z south). */
  const xz = ([lat, lng]: LatLng): [number, number] => [(lng - lng0) * kx, -(lat - lat0) * 111_320];

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x4d5a3a, 0.9);
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
  sunLight.castShadow = true;
  // The light version (an iPhone that turned the realistic models on): a smaller shadow map, a slower redraw.
  sunLight.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  scene.add(hemi, sunLight, sunLight.target);
  const content = new THREE.Group();
  scene.add(content);
  let map: MlMap | null = null, renderer: THREE.WebGLRenderer | null = null;

  /** One instanced mesh: a geometry repeated at many places, each with its own colour. */
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, at: Array<{ x: number; y: number; z: number; sx?: number; sy?: number; sz?: number; rot?: number; color?: THREE.Color }>) => {
    if (!at.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, at.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    at.forEach((a, i) => {
      q.setFromAxisAngle(up, a.rot ?? 0);
      m4.compose(new THREE.Vector3(a.x, a.y, a.z), q, new THREE.Vector3(a.sx ?? 1, a.sy ?? 1, a.sz ?? 1));
      mesh.setMatrixAt(i, m4);
      if (a.color) mesh.setColorAt(i, a.color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    content.add(mesh);
  };
  const rnd = (seed: number) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };

  /** The realistic models of a layout (views/ar-plan), placed in the local frame; its trees grow in afterwards. */
  let animated = false;
  const addPlan = (plan: Parameters<typeof layoutPlan>[0]) => {
    const { group } = layoutPlan(plan, (p) => { const [x, z] = xz(p); return { x, z }; }, false, true);
    castShadows(group);
    group.traverse((o) => {
      o.receiveShadow = true;
      const pts = o as THREE.Points;
      if (pts.isPoints) {
        // The map's camera has no view space of its own, so points sized in metres would be lost: a few pixels each.
        const m = pts.material as THREE.PointsMaterial;
        m.sizeAttenuation = false; m.size = 3; m.needsUpdate = true;
      }
      if (pts.isPoints || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) animated = true;
    });
    content.add(group);
    const plants = recognisedPlants(plan.kind, currentScans(plan.kind).map((r) => r.species));
    void growPlan(group, () => group.parent === content, (t) => { castShadows(t); map?.triggerRepaint(); }, plants);
  };
  // Mist, sprinklers and drips move: while some are on the map it is redrawn about 20 times a second (not while hidden).
  let ticker = 0;
  const tick = () => {
    window.clearInterval(ticker);
    if (!animated) return;
    ticker = window.setInterval(() => { if (!document.hidden) map?.triggerRepaint(); }, lite ? 200 : 50);
  };

  const clear = () => {
    animated = false;
    for (const o of [...content.children]) {
      content.remove(o);
      o.traverse((n) => {
        const mesh = n as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
    }
  };

  const build = (sim: SimLayout | null) => {
    clear();
    if (!sim) return;
    const all: Array<[number, number]> = [];
    if (sim.kind === "piazza") {
      // Every intervention as the AR shows it: the same realistic models, on the map's own spots.
      for (const t of sim.data.trees) all.push(xz(t));
      addPlan({ kind: "urban", L: sim.data, open: sim.shadeOpen ?? 1 });
      for (const p of sim.data.patches) for (const q of p.ring) all.push(xz(q));
    } else {
      // Vines plant by plant along their rows: a twisted trunk, the leafy wall over the wires, a post every ~6 m.
      const rows = vineRowSegments(sim.data.patches.filter((p) => p.kind === "zone").map((p) => p.ring), 900);
      const len = rows.reduce((t, [a, b]) => { const [ax, az] = xz(a), [bx, bz] = xz(b); return t + Math.hypot(bx - ax, bz - az); }, 0);
      const step = Math.max(VINE_STEP, len / MAX_VINES);
      const trunks: Parameters<typeof instanced>[2] = [], leaves: Parameters<typeof instanced>[2] = [], posts: Parameters<typeof instanced>[2] = [];
      const wires: THREE.Vector3[] = [];
      let n = 0;
      for (const [a, b] of rows) {
        const [ax, az] = xz(a), [bx, bz] = xz(b), L = Math.hypot(bx - ax, bz - az);
        all.push([ax, az], [bx, bz]);
        const rot = -Math.atan2(bz - az, bx - ax);
        for (let d = step / 2; d < L; d += step, n++) {
          const x = ax + ((bx - ax) * d) / L, z = az + ((bz - az) * d) / L;
          trunks.push({ x, y: 0, z, rot: rnd(n) * 6 });
          // The leaves of neighbouring plants touch, so each row reads as a green wall with a little relief.
          leaves.push({ x, y: 1.38, z, sx: step * (1.2 + rnd(n + 5) * 0.15), sy: 1.0 + rnd(n + 9) * 0.16, sz: 0.6 + rnd(n + 2) * 0.1, rot, color: new THREE.Color().setHSL(0.25 + rnd(n + 11) * 0.06, 0.6, 0.42 + rnd(n + 13) * 0.08) });
        }
        for (let d = 0; d <= L + 0.01; d += Math.max(6, L / Math.ceil(L / 6))) posts.push({ x: ax + ((bx - ax) * d) / L, y: 0, z: az + ((bz - az) * d) / L });
        wires.push(new THREE.Vector3(ax, 1.05, az), new THREE.Vector3(bx, 1.05, bz), new THREE.Vector3(ax, 1.55, az), new THREE.Vector3(bx, 1.55, bz));
      }
      instanced(new THREE.CylinderGeometry(0.035, 0.06, 0.95, 6).translate(0, 0.475, 0), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.95 }), trunks);
      instanced(new THREE.IcosahedronGeometry(0.5, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), leaves);
      instanced(new THREE.BoxGeometry(0.08, 1.8, 0.08).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9 }), posts);
      if (wires.length) content.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wires), new THREE.LineBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.6 })));
      // The shade nets, windbreak hedges and drip lines: the realistic models of the AR.
      addPlan({ kind: "vineyard", L: sim.data });
    }
    // A ground that only catches the shadows, as wide as the objects plus a margin.
    if (all.length) {
      const xs = all.map((p) => p[0]), zs = all.map((p) => p[1]);
      const minX = Math.min(...xs) - 20, maxX = Math.max(...xs) + 20, minZ = Math.min(...zs) - 20, maxZ = Math.max(...zs) + 20;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ).rotateX(-Math.PI / 2).translate((minX + maxX) / 2, 0.02, (minZ + maxZ) / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
      ground.receiveShadow = true;
      content.add(ground);
      const r = Math.hypot(maxX - minX, maxZ - minZ) / 2, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      const cam = sunLight.shadow.camera;
      cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = r * 4 + 200;
      cam.updateProjectionMatrix();
      sunLight.target.position.set(cx, 0, cz);
      center = [cx, cz, r];
    }
  };
  let center: [number, number, number] = [0, 0, 50];
  /** The simulation's sun: direction, warmth and strength; at night a faint cool light and no shadows. */
  const light = (sun: Sun) => {
    const [cx, cz, r] = center;
    if (!sun) {
      sunLight.intensity = 0.7; sunLight.color.set(0xc8d4ff); sunLight.castShadow = false;
      sunLight.position.set(cx + r, r * 2, cz - r);
      hemi.intensity = 1.1;
      return;
    }
    const d = r * 2 + 100, alt = Math.max(0.02, sun.alt);
    // az from north, clockwise: east +x, north −z.
    sunLight.position.set(cx + Math.sin(sun.az) * Math.cos(alt) * d, Math.sin(alt) * d, cz - Math.cos(sun.az) * Math.cos(alt) * d);
    const low = Math.min(1, alt / 0.35);
    sunLight.color.setHSL(0.09 + 0.04 * low, 0.6 - 0.45 * low, 0.6 + 0.2 * low);
    sunLight.intensity = 0.8 + 1.4 * low;
    sunLight.castShadow = true;
    hemi.intensity = 0.55 + 0.4 * low;
  };

  return {
    id: "sim-three",
    type: "custom",
    renderingMode: "3d",
    onAdd(m, gl) {
      map = m;
      renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    },
    onRemove() { window.clearInterval(ticker); clear(); renderer?.dispose(); renderer = null; map = null; },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    update(sim, sun) { build(sim); light(sun); tick(); map?.triggerRepaint(); },
  };
}

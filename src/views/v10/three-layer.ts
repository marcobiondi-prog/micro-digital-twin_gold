import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { bedParts, hedgeParts, netParts, pergolaParts, pergolaRingParts, TREE_RADIUS_M, vineRowSegments, type LatLng, type TreePart } from "@/models/area-layout";
import type { SimLayout } from "@/views/v10/map-area";

/**
 * The simulation's objects in the open 3D drawn by three.js inside the maplibre map (a custom 3D layer sharing its
 * WebGL context and depth): real models instead of extruded slabs — vines plant by plant along their rows, trees with a
 * trunk and a layered crown, pergolas, beds, misting poles, hedge and shade net — lit by the simulation's sun (its
 * season and hour: direction, warmth and strength) with soft shadows on the ground, instanced so thousands of vines
 * stay fluid. Local frame: metres from the area's origin, x east, y up, z south.
 */
export type Sun = { az: number; alt: number } | null;
export type SimThreeLayer = CustomLayerInterface & { update: (sim: SimLayout | null, sun: Sun) => void };

const MAX_VINES = 24_000, VINE_STEP = 1.1;

export function simThreeLayer(maplibregl: typeof import("maplibre-gl"), origin: [number, number]): SimThreeLayer {
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
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.normalBias = 0.04;
  scene.add(hemi, sunLight, sunLight.target);
  const content = new THREE.Group();
  scene.add(content);
  let map: MlMap | null = null, renderer: THREE.WebGLRenderer | null = null;

  /** A TreePart (a ring standing from base to height) as a prism in the local frame. */
  const prism = (p: TreePart): THREE.BufferGeometry | null => {
    if (p.ring.length < 3 || p.height - p.base < 0.005) return null;
    const pts = p.ring.map(xz);
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: p.height - p.base, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, p.base, 0);
    return g;
  };
  /** Many parts merged into one mesh per colour (few draw calls). */
  const addParts = (parts: TreePart[], opts: { opacity?: number; roughness?: number; shadow?: boolean } = {}) => {
    const byColor = new Map<string, THREE.BufferGeometry[]>();
    for (const p of parts) {
      const g = prism(p);
      if (!g) continue;
      const col = p.color.slice(0, 7);
      byColor.set(col, [...(byColor.get(col) ?? []), g]);
    }
    for (const [col, gs] of byColor) {
      const g = mergeGeometries(gs.map((x) => x.toNonIndexed()));
      gs.forEach((x) => x.dispose());
      if (!g) continue;
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: opts.roughness ?? 0.85, metalness: 0, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, side: THREE.DoubleSide }));
      m.castShadow = opts.shadow ?? true;
      m.receiveShadow = true;
      content.add(m);
    }
  };
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

  const clear = () => {
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
      // Trees: a trunk and a crown of three cones, each tree its own green and size.
      const trunks: Parameters<typeof instanced>[2] = [], crowns: Parameters<typeof instanced>[2] = [];
      sim.data.trees.forEach((t, i) => {
        const [x, z] = xz(t); all.push([x, z]);
        const k = 0.92 + rnd(i + 1) * 0.16, c = new THREE.Color().setHSL(0.28 + rnd(i + 7) * 0.06, 0.45, 0.26 + rnd(i + 3) * 0.08);
        trunks.push({ x, y: 0, z, sx: k, sy: k, sz: k });
        [[2.4, 1, 4.2], [4.6, 0.78, 3.6], [6.6, 0.55, 3.2]].forEach(([y, r, h], n) => crowns.push({ x, y: y! * k, z, sx: TREE_RADIUS_M * r! * k, sy: h! * k, sz: TREE_RADIUS_M * r! * k, rot: rnd(i * 3 + n) * 6, color: c.clone().offsetHSL(0, 0, n * 0.04) }));
      });
      const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 3, 8).translate(0, 1.5, 0);
      instanced(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5b4027, roughness: 0.9 }), trunks);
      const coneGeo = new THREE.ConeGeometry(1, 1, 12).translate(0, 0.5, 0);
      instanced(coneGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }), crowns);
      // Pergolas, beds and misting poles from the same parts as the other 3D views.
      addParts(sim.data.patches.filter((p) => p.kind === "shade").flatMap((p) => (p.exact ? pergolaRingParts(p.ring) : pergolaParts(p.ring))), { roughness: 0.7 });
      addParts(bedParts(sim.data.patches.filter((p) => p.kind === "lawn").map((p) => p.ring)).parts.map((p) => ({ ...p, base: p.base - 0.55, height: p.height - 0.55 })), { shadow: false });
      const poles: Parameters<typeof instanced>[2] = [], mist: Parameters<typeof instanced>[2] = [];
      for (const m of sim.data.misters) { const [x, z] = xz(m); poles.push({ x, y: 0, z }); [[2.5, 0.9], [1.8, 1.7], [1.0, 2.5]].forEach(([y, r]) => mist.push({ x, y: y!, z, sx: r!, sy: 1, sz: r! })); }
      instanced(new THREE.CylinderGeometry(0.05, 0.07, 3, 8).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.35 }), poles);
      const mistMat = new THREE.MeshStandardMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.22, depthWrite: false, roughness: 1 });
      instanced(new THREE.CylinderGeometry(1, 1, 0.08, 24), mistMat, mist);
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
      // The windbreak and the shade nets.
      addParts(sim.data.lines.filter((l) => l.kind === "wind").flatMap((l) => hedgeParts(l.line, l.strength ?? 0)), { roughness: 0.95 });
      addParts(sim.data.patches.filter((p) => p.kind === "cloth").flatMap((p) => netParts(p.ring, true)), { opacity: 0.55, shadow: true });
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
    onRemove() { clear(); renderer?.dispose(); renderer = null; map = null; },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer) return;
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    update(sim, sun) { build(sim); light(sun); map?.triggerRepaint(); },
  };
}

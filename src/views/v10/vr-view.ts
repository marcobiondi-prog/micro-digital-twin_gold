import * as THREE from "three";
import { vineLayout, vineRowSegments } from "@/models/area-layout";
import { recognisedPlants, toEN } from "@/models/ar-objects";
import { currentScans } from "@/models/ar-scan-log";
import { zonesOfArea, type DrawnArea } from "@/models/drawn-area";
import { getLab } from "@/models/lab-store";
import { ringCentroid } from "@/models/place-area";
import { getSimWhen } from "@/models/sim-when";
import { sunAt } from "@/models/sun-shadow";
import { vineMixOf, zoneMixOf } from "@/models/vine-interventions";
import { buildPlan, growPlan } from "@/views/ar-plan";
import { castShadows } from "@/views/ar-shadow";

/**
 * The project in a VR headset (WebXR immersive-vr: Windows Mixed Reality, Quest through Link or Air Link, SteamVR,
 * in Edge or Chrome on the computer): the drawn area at real size on a large ground, with the same realistic models as
 * the AR and the open 3D (views/ar-plan buildPlan, its map frame: x east, z south, metres from the area's middle), lit
 * by the simulation's sun. One stands in the middle of the area; the controller's trigger teleports to the spot of the
 * ground it points at (a ray and a ring show where), the thumbstick turns by 30°. Nothing is saved: it is a view.
 */
export async function vrSupported(): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.xr) return false;
    const ua = navigator.userAgent || "";
    const isHeadset = /OculusBrowser|Quest|Pico|ViveFocus/i.test(ua);
    if (!isHeadset && (/Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1))) {
      return false;
    }
    return await navigator.xr.isSessionSupported("immersive-vr");
  } catch { return false; }
}

export async function startVr(kind: "urban" | "vineyard", area: DrawnArea, onEnd: () => void): Promise<void> {
  const xr = navigator.xr!;
  // Asked first, while the tap still counts; the scene is built after.
  const session = await xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "bounded-floor"] });
  const lab = getLab();
  const [clat, clng] = ringCentroid(area.ring);
  const origin = { lat: clat, lng: clng };
  const at = (p: [number, number]) => { const en = toEN(p[0], p[1], origin); return new THREE.Vector3(en.e, 0, -en.n); };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.style.display = "none";
  document.body.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 2000);
  // The simulation's sun: its height colours the sky, sets the light and the shadows.
  const when = getSimWhen(kind);
  const sun = when ? sunAt(clat, clng, when.season, when.hour, when.minute ?? 0, when.dst) : null;
  const alt = sun?.alt ?? 45, day = alt > 0;
  scene.background = new THREE.Color(day ? (alt < 10 ? 0xf0b27a : 0x9ccbf0) : 0x0b1530);
  scene.fog = new THREE.Fog(scene.background as THREE.Color, 120, 700);
  scene.add(new THREE.HemisphereLight(day ? 0xdfefff : 0x40507a, kind === "urban" ? 0x8a8070 : 0x6b5236, day ? 1.1 : 0.35));
  const dir = new THREE.DirectionalLight(alt < 10 ? 0xffc890 : 0xffffff, day ? 2.2 : 0.15);
  const az = ((sun?.az ?? 180) * Math.PI) / 180, el = (Math.max(alt, 8) * Math.PI) / 180;
  dir.position.set(Math.sin(az) * Math.cos(el) * 80, Math.sin(el) * 80, -Math.cos(az) * Math.cos(el) * 80);
  dir.castShadow = day;
  dir.shadow.mapSize.set(2048, 2048);
  Object.assign(dir.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 250 });
  scene.add(dir, dir.target);

  // A wide ground (paving or soil), the drawn area on it a little lighter, its edge white.
  const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: kind === "urban" ? 0x9a948a : 0x7a6143, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const pts = area.ring.map((p) => at(p));
  const shape = new THREE.Shape(pts.map((v) => new THREE.Vector2(v.x, -v.z)));
  const areaMesh = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: kind === "urban" ? 0xb8b2a6 : 0x8d6e4c, roughness: 1 }));
  areaMesh.position.y = 0.01; areaMesh.receiveShadow = true;
  scene.add(areaMesh);
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts.map((v) => v.clone().setY(0.03))), new THREE.LineBasicMaterial({ color: 0xffffff })));

  // The interventions, the very spots of the map's layout.
  const identity = { theta: 0, tx: 0, tz: 0 };
  const { group } = buildPlan(kind, lab, area, origin, identity, true, true);
  castShadows(group);
  group.traverse((o) => { o.receiveShadow = true; });
  scene.add(group);
  void growPlan(group, () => group.parent === scene, castShadows, recognisedPlants(kind, currentScans(kind).map((r) => r.species)));
  if (kind === "vineyard") {
    // Rows of vines as green walls on their zones.
    const v = lab.vineyard, L = vineLayout(area.ring, v.zones.map((z) => zoneMixOf(z, vineMixOf(v))), area.edits ?? {}, zonesOfArea(area));
    const rows = L ? vineRowSegments(L.patches.filter((p) => p.kind === "zone").map((p) => p.ring), 600) : [];
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.3, 0.6).translate(0, 0.95, 0), new THREE.MeshStandardMaterial({ color: 0x4f8a35, roughness: 0.9 }), Math.max(1, rows.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), mid = new THREE.Vector3();
    rows.forEach(([a, b], i) => {
      const A = at(a), B = at(b);
      mid.addVectors(A, B).multiplyScalar(0.5);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(B.z - A.z, B.x - A.x));
      m.compose(mid, q, s.set(Math.max(0.5, A.distanceTo(B)), 1, 1));
      wall.setMatrixAt(i, m);
    });
    wall.count = rows.length;
    wall.castShadow = wall.receiveShadow = true;
    scene.add(wall);
  }

  // Controllers: a ray, a ring on the ground where it points, the trigger teleports there, the stick turns.
  const rig = { x: 0, z: 0, yaw: 0 };
  let baseSpace: XRReferenceSpace | null = null;
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.32, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2dd4bf }));
  marker.visible = false;
  scene.add(marker);
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    c.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x2dd4bf })));
    (c.children[0] as THREE.Line).scale.z = 8;
    scene.add(c);
    return c;
  });
  const hitOf = (c: THREE.Object3D): THREE.Vector3 | null => {
    const m = new THREE.Matrix4().extractRotation(c.matrixWorld);
    ray.ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.ray.direction.set(0, 0, -1).applyMatrix4(m);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(floorPlane, p) && p.distanceTo(ray.ray.origin) < 60 ? p : null;
  };
  const applyRig = () => {
    if (!baseSpace) return;
    // The offset space moves the world the other way: standing at (x, z) turned by yaw.
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rig.yaw);
    const p = new THREE.Vector3(-rig.x, 0, -rig.z).applyQuaternion(q);
    renderer.xr.setReferenceSpace(baseSpace.getOffsetReferenceSpace(new XRRigidTransform({ x: p.x, y: 0, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w })));
  };
  for (const c of ctrls) c.addEventListener("select", () => { const h = hitOf(c); if (h) { rig.x = h.x; rig.z = h.z; applyRig(); } });
  const turned = new WeakSet<XRInputSource>();

  await renderer.xr.setSession(session);
  baseSpace = renderer.xr.getReferenceSpace();
  renderer.setAnimationLoop((_t, frame) => {
    let shown = false;
    for (const c of ctrls) { const h = hitOf(c); if (h && !shown) { marker.position.set(h.x, 0.04, h.z); shown = true; } }
    marker.visible = shown;
    // Snap turn on a thumbstick pushed sideways, once per push.
    for (const src of frame?.session.inputSources ?? []) {
      const ax = src.gamepad?.axes ?? [];
      const x = ax[2] ?? ax[0] ?? 0;
      if (Math.abs(x) > 0.7 && !turned.has(src)) { turned.add(src); rig.yaw += x > 0 ? Math.PI / 6 : -Math.PI / 6; applyRig(); }
      else if (Math.abs(x) < 0.3) turned.delete(src);
    }
    renderer.render(scene, camera);
  });
  session.addEventListener("end", () => {
    renderer.setAnimationLoop(null);
    scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); });
    renderer.dispose();
    canvas.remove();
    onEnd();
  });
}

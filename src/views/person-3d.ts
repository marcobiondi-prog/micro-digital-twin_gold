import * as THREE from "three";
import { firstName, personInitials, type ColleagueSpot } from "@/lib/colleagues";

/**
 * Progetti condivisi in three.js (AR and VR headset): a colleague connected now stands where their phone's GPS puts
 * them — a turquoise ring on the floor, a thin light pole 2 m tall and, on top, their name in a pill (initials in a
 * turquoise disc), the same size on screen at any distance and seen through walls, so one finds them in the piazza.
 */
const TEAL = "#2dd4bf";

function labelTexture(name: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  const W = 512, H = 128;
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const r = H / 2 - 6;
  g.fillStyle = "rgba(11,15,21,0.82)";
  g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, r); g.fill();
  g.strokeStyle = TEAL; g.lineWidth = 5; g.stroke();
  g.fillStyle = TEAL;
  g.beginPath(); g.arc(H / 2, H / 2, r - 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#0b0f15"; g.font = "700 40px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(personInitials(name), H / 2, H / 2 + 2);
  g.fillStyle = "#ffffff"; g.font = "600 46px system-ui, sans-serif"; g.textAlign = "left";
  let label = firstName(name);
  while (g.measureText(label).width > W - H - 30 && label.length > 2) label = label.slice(0, -2) + "…";
  g.fillText(label, H + 6, H / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One colleague: ring, pole and name. `screen` is the label's height as a share of the view (0.04 ≈ 4 %). */
export function personMarker(name: string, screen = 0.045): THREE.Group {
  const g = new THREE.Group();
  g.name = "colleague";
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.9, depthTest: false }));
  ring.position.y = 0.03; ring.renderOrder = 999;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2, 8).translate(0, 1, 0), new THREE.MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.75, depthTest: false }));
  pole.renderOrder = 999;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(name), depthTest: false, transparent: true, sizeAttenuation: false }));
  sprite.center.set(0.5, 0);
  sprite.scale.set(screen * 4, screen, 1);
  sprite.position.y = 2.05; sprite.renderOrder = 1000;
  g.add(ring, pole, sprite);
  g.userData["name"] = name;
  return g;
}

function dispose(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material & { map?: THREE.Texture | null } | undefined;
    mat?.map?.dispose(); mat?.dispose?.();
  });
}

/**
 * Keeps `group` in step with the colleagues: each one placed by `toXZ` (null: not placeable now, e.g. the AR not yet
 * aligned with the map), on the floor at `y`; markers are added, moved or taken away, never all rebuilt.
 */
export function syncPeople(group: THREE.Group, spots: ColleagueSpot[], toXZ: (lat: number, lng: number) => { x: number; z: number } | null, y = 0, screen?: number) {
  const keep = new Set<string>();
  for (const p of spots) {
    const at = toXZ(p.lat, p.lng);
    if (!at) continue;
    keep.add(p.id);
    let m = group.getObjectByName(`person:${p.id}`) as THREE.Group | undefined;
    if (m && m.userData["name"] !== p.name) { group.remove(m); dispose(m); m = undefined; }
    if (!m) { m = personMarker(p.name, screen); m.name = `person:${p.id}`; group.add(m); }
    m.position.set(at.x, y, at.z);
  }
  for (const c of [...group.children]) if (!keep.has(c.name.slice(7))) { group.remove(c); dispose(c); }
}

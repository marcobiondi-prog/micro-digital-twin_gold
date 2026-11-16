import * as THREE from "three";
import type { ArObjectDef } from "@/models/ar-objects";

/**
 * Realistic trees for the AR view (EZ-Tree, MIT, Daniel Greenheck): a procedural tree with branches, bark and leaf
 * textures, chosen by the plant's shape (conical/columnar → pine, umbrella → ash, shrub → bush, round and the plain
 * «Albero» → oak or aspen), grown to the object's real height and set with its foot at y = 0. Loaded only when the AR
 * puts a tree; while it loads (or if it fails) the simple shape stays. Broadleaves keep about 70 % of their leaves for the phone.
 */
type EzTree = typeof import("ez-tree-src");
let lib: Promise<EzTree | null> | null = null;
const loadLib = () => (lib ??= import("ez-tree-src").catch(() => null));

/** Whether this object gets a realistic tree. */
export function wantsRealTree(def: ArObjectDef): boolean {
  if (def.id === "albero") return true;
  if (def.id !== "pianta") return false;
  return def.plant?.form !== "vine";
}

function presetOf(def: ArObjectDef): string {
  const form = def.plant?.form;
  const big = def.h >= 14 ? "Large" : def.h >= 6 ? "Medium" : "Small";
  if (form === "conical" || form === "columnar") return `Pine ${big}`;
  if (form === "umbrella") return `Ash ${big}`;
  if (form === "shrub") return "Bush 1";
  if (def.plant && !def.plant.evergreen) return `Aspen ${big}`;
  return `Oak ${big}`;
}

let seedN = 1;
export async function realTree(def: ArObjectDef): Promise<THREE.Object3D | null> {
  const ez = await loadLib();
  if (!ez) return null;
  try {
    const tree = new ez.Tree();
    tree.loadPreset(presetOf(def));
    tree.options.seed = 1000 + ((seedN++ * 7919) % 90000);
    // Broadleaves keep 70 % of their leaves for the phone; conifers all of them (thinned they looked bare).
    const conifer = presetOf(def).startsWith("Pine");
    if (!conifer) tree.options.leaves.count = Math.max(4, Math.round(tree.options.leaves.count * 0.7));
    tree.generate();
    const box = new THREE.Box3().setFromObject(tree);
    const h = box.max.y - box.min.y;
    if (!(h > 0)) return null;
    const s = def.h / h;
    tree.scale.setScalar(s);
    tree.position.y = -box.min.y * s;
    // The columnar shape (cypress, poplar) is a pine squeezed sideways to its own crown.
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s;
    if (w > 0 && def.w > 0) { const k = Math.min(1.6, Math.max(0.35, def.w / w)); tree.scale.x *= k; tree.scale.z *= k; }
    const g = new THREE.Group();
    g.add(tree);
    return g;
  } catch { return null; }
}

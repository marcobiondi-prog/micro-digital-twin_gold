import * as THREE from "three";
import type { ArObjectDef } from "@/models/ar-objects";
import { customModel, shapeFor } from "@/models/plant-shape";
import { realPlant } from "@/views/ar-plant";
import { realStonePine } from "@/views/ar-pine";
import { realCypress } from "@/views/ar-cypress";
import { realOlive } from "@/views/ar-olive";
import { realLinden } from "@/views/ar-linden";

/**
 * Realistic plants for the AR view. A recognised plant is built from its shape (views/ar-plant on models/plant-shape:
 * the specimen as the AI saw it, its species' card, else its form); the stone pine, the Italian cypress, the olive and
 * the lime tree have models of their own (views/ar-pine, ar-cypress, ar-olive, ar-linden). The plain «Albero», with no species, is a procedural
 * oak (EZ-Tree, MIT, Daniel Greenheck). Each is grown to the object's real height with its foot at y = 0; while it
 * loads (or if it fails) the simple shape stays.
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

let seedN = 1;
export async function realTree(def: ArObjectDef): Promise<THREE.Object3D | null> {
  try {
    const seed = 1000 + ((seedN++ * 7919) % 90000);
    const plant = def.plant;
    if (plant) {
      const custom = customModel(plant.scientificName, plant.form);
      if (custom === "stonePine") return realStonePine({ h: def.h, w: def.w }, seed);
      if (custom === "cypress") return realCypress({ h: def.h, w: def.w }, seed);
      if (custom === "olive") return realOlive({ h: def.h, w: def.w }, seed);
      if (custom === "linden") return realLinden({ h: def.h, w: def.w }, seed);
      const shape = shapeFor(plant.scientificName, plant.form, plant.evergreen, plant.specimen);
      // The crown's width: the specimen's own when the AI judged it, else the species' typical crown for its height.
      if (plant.specimen?.widthRatio === undefined && def.w > 0 && def.h > 0) shape.widthRatio = Math.max(0.15, Math.min(1.6, def.w / def.h));
      return realPlant(shape, { h: def.h, w: def.w }, seed);
    }
    const ez = await loadLib();
    if (!ez) return null;
    const tree = new ez.Tree();
    tree.loadPreset(def.h >= 14 ? "Oak Large" : def.h >= 6 ? "Oak Medium" : "Oak Small");
    tree.options.seed = seed;
    tree.options.leaves.count = Math.max(4, Math.round(tree.options.leaves.count * 0.7));
    tree.generate();
    const box = new THREE.Box3().setFromObject(tree);
    const h = box.max.y - box.min.y;
    if (!(h > 0)) return null;
    const s = def.h / h;
    tree.scale.setScalar(s);
    tree.position.y = -box.min.y * s;
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s;
    if (def.w > 0 && w > 0) { const c = Math.min(1.8, Math.max(0.3, def.w / w)); tree.scale.x *= c; tree.scale.z *= c; }
    const g = new THREE.Group();
    g.add(tree);
    return g;
  } catch { return null; }
}

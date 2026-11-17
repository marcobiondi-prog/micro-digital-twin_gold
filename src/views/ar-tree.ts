import * as THREE from "three";
import type { ArObjectDef } from "@/models/ar-objects";
import { plantProfile, presetName } from "@/models/plant-profile";

/**
 * Realistic trees for the AR view (EZ-Tree, MIT, Daniel Greenheck): a procedural tree with branches, bark and leaf
 * textures. A recognised plant is drawn after its genus (models/plant-profile: base shape, bark, leaves, tints and
 * crown width — a birch white-barked, an olive silver and light, a cypress narrow), an unknown one after its form;
 * grown to the object's real height and set with its foot at y = 0. Loaded only when the AR puts a tree; while it
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

/**
 * EZ-Tree's aspen leaves — the only broad, whole leaf of its four, the right one for plane, lime, maple, birch — are
 * autumn yellow: they are turned green once (hue rotated on a canvas) and shared by every tree.
 */
let greened: THREE.CanvasTexture | null = null;
function greenLeaves(root: THREE.Object3D) {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshPhongMaterial | undefined;
    if (!mat || Array.isArray(mat) || mat.name !== "leaves" || !mat.map) return;
    const map = mat.map;
    // The texture's picture arrives asynchronously (TextureLoader): wait for it, at most 10 s.
    let tries = 0;
    const apply = () => {
      const img = map.image as HTMLImageElement | undefined;
      if (!img || !(img.naturalWidth || img.width)) { if (tries++ < 50) window.setTimeout(apply, 200); return; }
      if (!greened) {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
        const g = c.getContext("2d");
        if (!g) return;
        g.filter = "hue-rotate(62deg) saturate(0.85) brightness(0.8)";
        g.drawImage(img, 0, 0);
        greened = new THREE.CanvasTexture(c);
        greened.colorSpace = map.colorSpace; greened.wrapS = map.wrapS; greened.wrapT = map.wrapT;
        greened.flipY = map.flipY; greened.premultiplyAlpha = map.premultiplyAlpha;
      }
      mat.map = greened;
      mat.needsUpdate = true;
    };
    apply();
  });
}

let seedN = 1;
export async function realTree(def: ArObjectDef): Promise<THREE.Object3D | null> {
  const ez = await loadLib();
  if (!ez) return null;
  try {
    const tree = new ez.Tree();
    const profile = def.id === "albero" && !def.plant ? { base: "Oak" as const } : plantProfile(def.plant?.scientificName, def.plant?.form, def.plant?.evergreen);
    const seed = 1000 + ((seedN++ * 7919) % 90000);
    tree.loadPreset(presetName(profile.base, def.h, seed));
    tree.options.seed = seed;
    if (profile.bark) tree.options.bark.type = profile.bark;
    if (profile.barkTint !== undefined) tree.options.bark.tint = profile.barkTint;
    if (profile.leaves) tree.options.leaves.type = profile.leaves;
    if (profile.leafTint !== undefined) tree.options.leaves.tint = profile.leafTint;
    // Broadleaves keep 70 % of their leaves for the phone (less for a light crown); conifers all of them (thinned they looked bare).
    const conifer = profile.base === "Pine";
    const share = profile.leafShare ?? (conifer ? 1 : 0.7);
    if (share !== 1) tree.options.leaves.count = Math.max(4, Math.round(tree.options.leaves.count * share));
    if (profile.leafSize) tree.options.leaves.size *= profile.leafSize;
    tree.generate();
    if (tree.options.leaves.type === "aspen") greenLeaves(tree);
    const box = new THREE.Box3().setFromObject(tree);
    const h = box.max.y - box.min.y;
    if (!(h > 0)) return null;
    const s = def.h / h;
    tree.scale.setScalar(s);
    tree.position.y = -box.min.y * s;
    // Crown width: the species' own (def.w); without it, the genus' shape (cypress narrow, umbrella pine wide).
    const w = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s;
    const k = def.w > 0 && w > 0 ? def.w / w : profile.squeeze ?? 1;
    if (k !== 1) { const c = Math.min(1.8, Math.max(0.3, k)); tree.scale.x *= c; tree.scale.z *= c; }
    const g = new THREE.Group();
    g.add(tree);
    return g;
  } catch { return null; }
}

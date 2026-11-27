import { useSyncExternalStore } from "react";
import { isIOS, isMobileDevice, iosRealModels, subscribeIosRealModels } from "@/lib/ios";

/** How the 3D maps draw the simulation's objects on this device: "real" (the realistic models on desktop),
 *  "lite" (light realistic models on mobile and tablets) — both are photorealistic 3D models with botanical trees, pergolas, etc. */
export type Models3D = "real" | "lite" | "shapes";
export function models3D(): Models3D {
  if (isMobileDevice()) return "lite";
  return "real";
}
export function useModels3D(): Models3D {
  return useSyncExternalStore(subscribeIosRealModels, models3D, () => "lite");
}


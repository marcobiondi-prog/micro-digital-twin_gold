import { useSyncExternalStore } from "react";
import { isMobileDevice, mobileRealModels, subscribeIosRealModels } from "@/lib/ios";

/** How the 3D maps draw the simulation's objects on this device: "real" (the realistic models on desktop),
 *  "lite" (light realistic models on mobile and tablets) — both are photorealistic 3D models with botanical trees, pergolas, etc. */
export type Models3D = "real" | "lite" | "shapes";
export function models3D(): Models3D {
  // Phones and tablets: plain shapes by default (the realistic models froze Google's 3D a little after it had drawn);
  // the switch under the 3D turns on their light version.
  if (isMobileDevice()) return mobileRealModels() ? "lite" : "shapes";
  return "real";
}
export function useModels3D(): Models3D {
  return useSyncExternalStore(subscribeIosRealModels, models3D, () => "shapes");
}


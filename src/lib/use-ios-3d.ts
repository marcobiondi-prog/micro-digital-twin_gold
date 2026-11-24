import { useSyncExternalStore } from "react";
import { isIOS, isMobileDevice, iosRealModels, subscribeIosRealModels } from "@/lib/ios";

/** How the 3D maps draw the simulation's objects on this device: "real" (the realistic models on desktop),
 *  "lite" (light realistic models on iOS when opted in) or "shapes" (the light performant shapes on mobile and tablets). */
export type Models3D = "real" | "lite" | "shapes";
export function models3D(): Models3D {
  if (isIOS()) return iosRealModels() ? "lite" : "shapes";
  if (isMobileDevice()) return "shapes";
  return "real";
}
export function useModels3D(): Models3D {
  return useSyncExternalStore(subscribeIosRealModels, models3D, () => "shapes");
}


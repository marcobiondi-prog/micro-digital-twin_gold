import { useSyncExternalStore } from "react";
import { iosRealModels, isIOS, subscribeIosRealModels } from "@/lib/ios";

/** How the 3D maps draw the simulation's objects on this device: "real" (the realistic models), "lite" (the light
 *  realistic models, an iPhone that turned them on) or "shapes" (the plain shapes, an iPhone by default). */
export type Models3D = "real" | "lite" | "shapes";
export function models3D(): Models3D {
  if (!isIOS()) return "real";
  return iosRealModels() ? "lite" : "shapes";
}
export function useModels3D(): Models3D {
  return useSyncExternalStore(subscribeIosRealModels, models3D, () => "real");
}


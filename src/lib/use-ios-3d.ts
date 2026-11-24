import { useSyncExternalStore } from "react";
import { isMobileDevice, mobileRealModels, subscribeMobileRealModels } from "@/lib/ios";

/** How the 3D maps draw the simulation's objects on this device: "real" (the realistic models on desktop computers),
 *  "lite" (the light realistic models on mobile devices that turned them on) or "shapes" (the plain shapes, mobile devices by default). */
export type Models3D = "real" | "lite" | "shapes";
export function models3D(): Models3D {
  if (!isMobileDevice()) return "real";
  return mobileRealModels() ? "lite" : "shapes";
}
export function useModels3D(): Models3D {
  return useSyncExternalStore(subscribeMobileRealModels, models3D, () => "real");
}


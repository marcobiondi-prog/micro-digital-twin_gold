import { afterEach, describe, expect, it, vi } from "vitest";
import { models3D } from "@/lib/use-ios-3d";
import { setIosRealModels } from "@/lib/ios";

const ua = (v: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(v);
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("3D models by device", () => {
  it("keeps the realistic models on Android and computers", () => {
    ua("Mozilla/5.0 (Linux; Android 14; XQ-EC54) Chrome/130 Mobile");
    expect(models3D()).toBe("real");
  });
  it("draws plain shapes on iPhone until the light models are turned on", () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1");
    expect(models3D()).toBe("shapes");
    setIosRealModels(true);
    expect(models3D()).toBe("lite");
    setIosRealModels(false);
    expect(models3D()).toBe("shapes");
  });
});

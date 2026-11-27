import { afterEach, describe, expect, it, vi } from "vitest";
import { models3D } from "@/lib/use-ios-3d";
import { setIosRealModels } from "@/lib/ios";

const ua = (v: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(v);
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("3D models by device", () => {
  it("keeps the realistic models on desktop computers", () => {
    ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
    expect(models3D()).toBe("real");
  });
  it("uses plain shapes on phones and tablets until the light models are turned on", () => {
    ua("Mozilla/5.0 (Linux; Android 14; XQ-EC54) Chrome/130 Mobile");
    expect(models3D()).toBe("shapes");
    setIosRealModels(true);
    expect(models3D()).toBe("lite");
  });
  it("does the same on iPhone and iPad", () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1");
    expect(models3D()).toBe("shapes");
    setIosRealModels(true);
    expect(models3D()).toBe("lite");
  });
});

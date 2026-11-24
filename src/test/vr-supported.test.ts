import { afterEach, describe, expect, it, vi } from "vitest";
import { vrSupported } from "@/views/v10/vr-view";

const ua = (v: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(v);

describe("vrSupported", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false on Android phones and tablets", async () => {
    ua("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36");
    vi.stubGlobal("navigator", { ...navigator, xr: { isSessionSupported: () => Promise.resolve(true) } });
    expect(await vrSupported()).toBe(false);
  });

  it("returns false on iPhone and iPad", async () => {
    ua("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1");
    vi.stubGlobal("navigator", { ...navigator, xr: { isSessionSupported: () => Promise.resolve(true) } });
    expect(await vrSupported()).toBe(false);
  });

  it("returns true on compatible VR headset browsers", async () => {
    ua("Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/32.0.0.0 Safari/537.36");
    vi.stubGlobal("navigator", { ...navigator, xr: { isSessionSupported: () => Promise.resolve(true) } });
    expect(await vrSupported()).toBe(true);
  });

  it("returns true on desktop OS when WebXR immersive-vr is available", async () => {
    ua("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
    vi.stubGlobal("navigator", { ...navigator, xr: { isSessionSupported: () => Promise.resolve(true) } });
    expect(await vrSupported()).toBe(true);
  });
});

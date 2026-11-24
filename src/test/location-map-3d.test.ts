import { describe, expect, it, vi } from "vitest";
import { frameCamera, groundElevation, parseElevation } from "@/models/map-3d-camera";

describe("frameCamera", () => {
  it("centres the oblique view on the reference point", () => {
    expect(frameCamera(41.5, 14.2, 144)).toEqual({ center: { lat: 41.5, lng: 14.2, altitude: 0 }, range: 380, tilt: 62, heading: 20 });
  });
  it("sits closer once the panel has grown", () => {
    expect(frameCamera(41.5, 14.2, 288).range).toBeLessThan(frameCamera(41.5, 14.2, 144).range);
  });
});

describe("ground elevation", () => {
  it("centres the camera on the ground, not at sea level", () => {
    expect(frameCamera(41.56, 14.66, 288, 701).center.altitude).toBe(701);
  });
  it("parses the Open-Meteo answer and rejects nonsense", () => {
    expect(parseElevation({ elevation: [701] })).toBe(701);
    expect(parseElevation({ elevation: 12 })).toBe(12);
    expect(parseElevation({ elevation: [] })).toBeUndefined();
    expect(parseElevation({ elevation: ["x"] })).toBeUndefined();
    expect(parseElevation(null)).toBeUndefined();
  });
  it("falls back to sea level when the service fails, and caches answers", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ elevation: [701] })));
    expect(await groundElevation(41.56, 14.66, ok as unknown as typeof fetch)).toBe(701);
    expect(await groundElevation(41.56, 14.66, ok as unknown as typeof fetch)).toBe(701);
    expect(ok).toHaveBeenCalledTimes(1);
    const down = vi.fn(async () => { throw new Error("offline"); });
    expect(await groundElevation(45.1, 9.2, down as unknown as typeof fetch)).toBe(0);
  });
});

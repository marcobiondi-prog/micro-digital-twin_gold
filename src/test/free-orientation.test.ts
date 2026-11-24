import { describe, expect, it, vi } from "vitest";
vi.mock("@/views/ar-tree", () => ({ realTree: async () => null, wantsRealTree: () => false }));
import { rectOf, xzAngleOf } from "@/views/ar-plan";
import { initialRingAngle, rotateZone, type DrawnArea } from "@/models/drawn-area";
import { piazzaLayout, type LatLng } from "@/models/area-layout";

const O = { lat: 41.56, lng: 14.66 };
const kx = 111_320 * Math.cos((O.lat * Math.PI) / 180);
const xz = ([lat, lng]: LatLng) => ({ x: (lng - O.lng) * kx, z: -(lat - O.lat) * 111_320 });
const ll = (e: number, n: number): LatLng => [O.lat + n / 111_320, O.lng + e / kx];

describe("free orientation", () => {
  it("rectOf keeps the direction given instead of the longest edge", () => {
    const sq = [{ x: -2, z: -1 }, { x: 2, z: -1 }, { x: 2, z: 1 }, { x: -2, z: 1 }];
    expect(rectOf(sq).yaw).toBeCloseTo(0, 5);
    const r = rectOf(sq, Math.PI / 4);
    expect(r.yaw).toBeCloseTo(-Math.PI / 4, 5);
  });

  it("xzAngleOf turns a map angle (0 = east, counter-clockwise) into x east / z south", () => {
    const ring = [ll(0, 0), ll(4, 0), ll(4, 4), ll(0, 4)];
    expect(xzAngleOf(ring, 0, xz)).toBeCloseTo(0, 3);
    expect(xzAngleOf(ring, Math.PI / 2, xz)).toBeCloseTo(-Math.PI / 2, 3);
    expect(xzAngleOf(ring, undefined, xz)).toBeUndefined();
  });

  it("rotateZone turns a zone freely round its centre and keeps the angle", () => {
    const area: DrawnArea = { ring: [ll(-30, -30), ll(30, -30), ll(30, 30), ll(-30, 30)], zones: [{ id: "z", kind: "ombra", ring: [ll(-4, -2), ll(4, -2), ll(4, 2), ll(-4, 2)] }] } as DrawnArea;
    expect(initialRingAngle(area.zones![0]!.ring)).toBeCloseTo(0, 5);
    const turned = rotateZone(area, "z", Math.PI / 6).zones![0]!;
    expect(turned.angle).toBeCloseTo(Math.PI / 6, 6);
    const p = xz(turned.ring[1]!);
    // (4, -2) east/north turned by 30° counter-clockwise.
    expect(p.x).toBeCloseTo(4 * Math.cos(Math.PI / 6) + 2 * Math.sin(Math.PI / 6), 1);
  });

  it("piazzaLayout lays the shade block at the angle set by hand", () => {
    const ring = [ll(-25, -25), ll(25, -25), ll(25, 25), ll(-25, 25)];
    const L = piazzaLayout(ring, 0, 0, 20, { shadeAngle: Math.PI / 5 }, [], 0, [], 0)!;
    const shade = L.patches.filter((p) => p.kind === "shade");
    expect(shade.length).toBeGreaterThan(0);
    expect(shade.every((p) => p.angle !== undefined && Math.abs(p.angle - Math.PI / 5) < 1e-9)).toBe(true);
    expect(L.shadeAngle).toBeCloseTo(Math.PI / 5, 9);
  });
});

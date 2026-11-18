import { describe, expect, it } from "vitest";
import { easeTo, FloorTracker, placementFor, surfaceKind } from "@/models/ar-floor";

describe("ar-floor", () => {
  it("tells flat surfaces, slopes and walls apart", () => {
    expect(surfaceKind(0.99)).toBe("flat");
    expect(surfaceKind(0.7)).toBe("slope");
    expect(surfaceKind(0.1)).toBe("wall");
  });

  it("takes the lowest level seen often as the floor, not a table above it nor a lone low hit", () => {
    const f = new FloorTracker();
    let t = 0;
    for (let i = 0; i < 20; i++) f.add(-0.75 + (i % 3) * 0.01, t++); // a table
    expect(f.floorY()).toBeCloseTo(-0.74, 1);
    f.add(-2.4, t++); // a lone noisy hit
    for (let i = 0; i < 8; i++) f.add(-1.5 + (i % 2) * 0.01, t++); // the floor
    expect(f.floorY()).toBeCloseTo(-1.5, 1);
  });

  it("needs a few hits before calling a floor", () => {
    const f = new FloorTracker();
    f.add(-1.4, 0); f.add(-1.41, 1);
    expect(f.floorY()).toBeNull();
  });

  it("puts objects on the floor, on a table only as a model, under a wall's hit on the floor", () => {
    expect(placementFor({ x: 0, y: -1.49, z: -2, up: 1 }, -1.5, false)).toEqual({ kind: "floor", y: -1.5 });
    expect(placementFor({ x: 0, y: -0.75, z: -1, up: 1 }, -1.5, false)).toEqual({ kind: "floor-under", y: -1.5 });
    expect(placementFor({ x: 0, y: -0.75, z: -1, up: 1 }, -1.5, true)).toEqual({ kind: "raised", y: -0.75 });
    expect(placementFor({ x: 0, y: -0.2, z: -1, up: 0.05 }, -1.5, false)).toEqual({ kind: "floor-under", y: -1.5 });
    expect(placementFor(null, null, false)).toBeNull();
  });

  it("eases small moves and jumps on big ones", () => {
    const a = easeTo({ x: 0, y: 0, z: 0 }, { x: 0.1, y: 0, z: 0 });
    expect(a.x).toBeCloseTo(0.035);
    expect(easeTo({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }).x).toBe(2);
  });
});

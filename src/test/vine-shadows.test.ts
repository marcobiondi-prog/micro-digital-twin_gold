import { describe, expect, it } from "vitest";
import { vineLayout, vineShadows } from "@/models/area-layout";

const ring: Array<[number, number]> = [[41.56, 14.66], [41.56, 14.6612], [41.5608, 14.6612], [41.5608, 14.66]];

describe("vineShadows", () => {
  const l = vineLayout(ring, [{ irrigation: 0, shade: 80, windbreak: 0 }, { irrigation: 0, shade: 80, windbreak: 0 }, { irrigation: 0, shade: 80, windbreak: 0 }])!;
  it("casts one shadow per shade cloth, away from the sun", () => {
    const cloths = l.patches.filter((p) => p.kind === "cloth");
    expect(cloths.length).toBeGreaterThan(0);
    const sh = vineShadows(l, { az: Math.PI, alt: 0.6 }); // sun in the south
    expect(sh).toHaveLength(cloths.length);
    // Sun in the south: the shadow falls north (higher latitude).
    expect(sh[0]![0]![0]).toBeGreaterThan(cloths[0]!.ring[0]![0]);
  });
  it("casts nothing with the sun down", () => {
    expect(vineShadows(l, { az: 0, alt: -0.1 })).toEqual([]);
    expect(vineShadows(l, null)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { fromEN, joinFitsZone } from "@/models/ar-objects";
import type { SubArea } from "@/models/drawn-area";

const origin = { lat: 41.56, lng: 14.66 };
const a = { theta: 0, tx: 0, tz: 0 }; // AR x = east, z = −north
const ring = (e0: number, n0: number, e1: number, n1: number) =>
  [fromEN({ e: e0, n: n0 }, origin), fromEN({ e: e1, n: n0 }, origin), fromEN({ e: e1, n: n1 }, origin), fromEN({ e: e0, n: n1 }, origin)];
const zones: SubArea[] = [{ id: "z1", kind: "ombra", ring: ring(0, 0, 10, 10) }];

describe("joinFitsZone", () => {
  it("joins only inside a zone of its kind", () => {
    expect(joinFitsZone({ x: 5, z: -5, w: 8, d: 4, rot: 0 }, "ombra", zones, a, origin)).toBe("fits");
    expect(joinFitsZone({ x: 5, z: -5, w: 12, d: 4, rot: 0 }, "ombra", zones, a, origin)).toBe("out");
  });
  it("says when no zone of that kind exists or the AR is not aligned", () => {
    expect(joinFitsZone({ x: 5, z: -5, w: 2, d: 2, rot: 0 }, "prato", zones, a, origin)).toBe("nozone");
    expect(joinFitsZone({ x: 5, z: -5, w: 2, d: 2, rot: 0 }, "ombra", zones, null, origin)).toBe("noalign");
  });
});

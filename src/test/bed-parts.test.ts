import { describe, expect, it } from "vitest";
import { bedParts } from "@/models/area-layout";
import { ringContains, type Ring } from "@/models/place-area";

const lat = 41.56, lng = 14.66, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const box = (w: number, h: number, dx = 0): Ring => [[lat, lng + dx / k], [lat, lng + (dx + w) / k], [lat + h / 111_320, lng + (dx + w) / k], [lat + h / 111_320, lng + dx / k]];

describe("aiuole e ciottoli in 3D", () => {
  it("puts whole beds inside the patches, with a curb, grass, a shrub and flowers each", () => {
    const { beds, parts } = bedParts([box(20, 12)]);
    expect(beds.length).toBeGreaterThan(4);
    for (const b of beds) for (const [a, c] of b) expect(ringContains(box(20, 12), a, c)).toBe(true);
    expect(parts).toHaveLength(beds.length * 6);
    expect(parts.every((p) => p.height > p.base)).toBe(true);
  });
  it("never draws more than 18 beds, however big the lawn", () => {
    expect(bedParts([box(200, 150)]).beds.length).toBeLessThanOrEqual(18);
  });
  it("spans beds across neighbouring strips and gives a small patch one smaller bed", () => {
    expect(bedParts([box(10, 3), box(10, 3, 10)]).beds.length).toBeGreaterThanOrEqual(3);
    expect(bedParts([box(3, 2)]).beds).toHaveLength(1);
    expect(bedParts([]).parts).toHaveLength(0);
  });
});

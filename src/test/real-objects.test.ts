import { describe, expect, it } from "vitest";
import { realObjectsFrom, realCountText, circleRing } from "@/models/real-objects";
import { piazzaLayout } from "@/models/area-layout";
import { ringContains, type Ring } from "@/models/place-area";

const lat = 41.56, lng = 14.66, k = 111_320 * Math.cos((lat * Math.PI) / 180);
const P = (x: number, y: number): [number, number] => [lat + y / 111_320, lng + x / k];
const area: Ring = [P(0, 0), P(60, 0), P(60, 40), P(0, 40)];

describe("objects already in the area", () => {
  it("reads trees, fountains and buildings inside the area and leaves the rest out", () => {
    const [tLat, tLng] = P(10, 10), [fLat, fLng] = P(30, 20), [oLat, oLng] = P(200, 200);
    const objs = realObjectsFrom([
      { type: "node", lat: tLat, lon: tLng, tags: { natural: "tree" } },
      { type: "node", lat: fLat, lon: fLng, tags: { amenity: "fountain", name: "Fontana" } },
      { type: "node", lat: oLat, lon: oLng, tags: { natural: "tree" } },
      { type: "way", tags: { building: "yes" }, geometry: [P(50, 30), P(58, 30), P(58, 38), P(50, 38), P(50, 30)].map(([a, b]) => ({ lat: a, lon: b })) },
      { type: "node", lat: tLat, lon: tLng, tags: { highway: "street_lamp" } },
    ], area);
    expect(objs.map((o) => o.kind).sort()).toEqual(["albero", "edificio", "fontana"]);
    expect(realCountText(objs)).toBe("1 albero · 1 fontana · 1 edificio");
  });
  it("keeps new trees, beds and pergolas off them", () => {
    const fountain = circleRing(...P(30, 20), 8);
    const l = piazzaLayout(area, 8, 30, 20, {}, [], 4, [fountain])!;
    const inside = ([a, b]: [number, number]) => ringContains(fountain, a, b);
    for (const t of l.trees) expect(inside(t)).toBe(false);
    for (const m of l.misters) expect(inside(m)).toBe(false);
    for (const p of l.patches) {
      const c: [number, number] = [p.ring.reduce((s, q) => s + q[0], 0) / p.ring.length, p.ring.reduce((s, q) => s + q[1], 0) / p.ring.length];
      if (p.ring.length === 4) expect(inside(c)).toBe(false);
    }
  });
});

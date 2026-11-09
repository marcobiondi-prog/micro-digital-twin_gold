import { describe, expect, it } from "vitest";
import { areaCandidates, placeArea, ringAreaM2, ringContains, type Ring } from "@/models/place-area";
import { grouped } from "@/models/intervention-cost";

/** A square of `side` metres around a point, as lat/lng (1° lat ≈ 111 195 m). */
const square = (lat: number, lng: number, side: number): Ring => {
  const dLat = side / 2 / 111_195, dLng = side / 2 / (111_195 * Math.cos((lat * Math.PI) / 180));
  return [[lat - dLat, lng - dLng], [lat - dLat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng - dLng], [lat - dLat, lng - dLng]];
};

describe("place area", () => {
  it("measures a 60 × 60 m square as about 3600 m²", () => {
    expect(ringAreaM2(square(41.558, 14.659, 60))).toBeGreaterThan(3580);
    expect(ringAreaM2(square(41.558, 14.659, 60))).toBeLessThan(3620);
  });

  it("keeps only shapes containing the point, a square before a park, and invents nothing", () => {
    const park = { rings: [square(41.558, 14.659, 200)], kind: "parco" as const };
    const piazza = { rings: [square(41.558, 14.659, 60)], kind: "piazza" as const, name: "Piazza" };
    const far = { rings: [square(41.6, 14.7, 60)], kind: "piazza" as const };
    expect(placeArea([park, piazza, far], 41.558, 14.659)?.name).toBe("Piazza");
    expect(placeArea([far], 41.558, 14.659)).toBeNull();
    expect(ringContains(square(41.558, 14.659, 60), 41.6, 14.7)).toBe(false);
  });

  it("reads closed ways and skips open ones", () => {
    const closed = square(41.558, 14.659, 40).map(([lat, lon]) => ({ lat, lon }));
    const open = closed.slice(0, 4);
    const out = areaCandidates([{ type: "way", tags: { place: "square" }, geometry: closed }, { type: "way", geometry: open }]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("piazza");
  });
});

describe("surface formatting", () => {
  it("groups thousands with a dot", () => {
    expect(grouped(4000)).toBe("4.000");
  });
});

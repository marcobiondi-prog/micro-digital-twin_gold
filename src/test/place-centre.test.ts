import { describe, expect, it } from "vitest";
import { placeArea, ringCentroid } from "@/models/place-area";

describe("the place's centre", () => {
  it("is the middle of the shape, not the mean of its corners", () => {
    // An L-ish shape with many corners crowded on one side: the corners' mean is pulled there, the centroid is not.
    const square: Array<[number, number]> = [[0, 0], [0, 0.001], [0.001, 0.001], [0.001, 0.0009], [0.001, 0.0008], [0.001, 0.0007], [0.001, 0]];
    const [lat, lng] = ringCentroid(square);
    expect(lat).toBeCloseTo(0.0005, 6);
    expect(lng).toBeCloseTo(0.0005, 6);
  });
  it("comes with the mapped square that contains the point", () => {
    const ring: Array<[number, number]> = [[41.56, 14.66], [41.56, 14.6612], [41.5609, 14.6612], [41.5609, 14.66]];
    const area = placeArea([{ rings: [ring], kind: "piazza" }], 41.5601, 14.6601)!;
    expect(area.centre[0]).toBeCloseTo(41.56045, 5);
    expect(area.centre[1]).toBeCloseTo(14.6606, 5);
  });
});

describe("the pin beside the square", async () => {
  const { placeCentre } = await import("@/models/place-area");
  it("goes to the middle of the nearest square when the address falls on the road beside it", () => {
    const ring: Array<[number, number]> = [[41.56, 14.66], [41.56, 14.6612], [41.5609, 14.6612], [41.5609, 14.66]];
    const c = placeCentre([{ rings: [ring], kind: "piazza" }], 41.5603, 14.65985)!;
    expect(c[0]).toBeCloseTo(41.56045, 5);
    expect(c[1]).toBeCloseTo(14.6606, 5);
  });
});

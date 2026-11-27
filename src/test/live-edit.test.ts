import { describe, expect, it } from "vitest";
import { describeChange } from "@/models/live-edit";

describe("describeChange", () => {
  it("names a lever", () => expect(describeChange({ trees: 2 }, { trees: 5 })).toEqual({ what: "Alberi 5", at: null }));
  it("finds a moved tree", () => {
    const ring = [[0, 0], [0, 1], [1, 1]];
    const a = { area: { lat: 0, lng: 0, ring, edits: { trees: [null] } } };
    const b = { area: { lat: 0, lng: 0, ring, edits: { trees: [[0.4, 0.5]] } } };
    expect(describeChange(a, b)).toEqual({ what: "sposta un albero", at: [0.4, 0.5] });
  });
  it("nothing changed", () => expect(describeChange({ trees: 1 }, { trees: 1 })).toBeNull());
});

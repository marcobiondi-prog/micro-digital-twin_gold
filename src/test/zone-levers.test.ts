import { describe, expect, it } from "vitest";
import { leversForZones, type DrawnArea } from "@/models/drawn-area";

// A 100 m × 100 m square (about 10.000 m²) near Campobasso and a 20 m × 20 m zone inside it.
const lat = 41.56, lng = 14.66, dLat = 100 / 111_320, dLng = 100 / (111_320 * Math.cos((lat * Math.PI) / 180));
const sq = (f: number, o = 0): Array<[number, number]> => [[lat + o * dLat, lng + o * dLng], [lat + o * dLat, lng + (o + f) * dLng], [lat + (o + f) * dLat, lng + (o + f) * dLng], [lat + (o + f) * dLat, lng + o * dLng]];
const area = (kind: "ombra" | "prato" | "alberi"): DrawnArea => ({ lat, lng, ring: sq(1), zones: [{ id: "z", kind, ring: sq(0.2, 0.3) }] });

describe("leversForZones", () => {
  it("raises shade to cover a pergola zone, in 10 % steps", () => {
    expect(leversForZones(area("ombra"), { trees: 0, permeable: 0, shade: 0 })).toEqual({ trees: 0, permeable: 0, shade: 10 });
  });
  it("puts about one tree every 60 m² in a trees zone", () => {
    expect(leversForZones(area("alberi"), { trees: 0, permeable: 0, shade: 0 })?.trees).toBe(7);
  });
  it("never lowers a lever and says when nothing changes", () => {
    expect(leversForZones(area("prato"), { trees: 3, permeable: 50, shade: 0 })).toBeNull();
  });
});

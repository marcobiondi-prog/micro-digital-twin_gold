import { describe, expect, it } from "vitest";
import { piazzaLayout } from "@/models/area-layout";
import { ringContains } from "@/models/place-area";
import { piazzaEstimate, SPRINKLER_COOLING } from "@/models/scenarios";
import { interventionCost, UNIT_COST } from "@/models/intervention-cost";
import { mixRows } from "@/models/intervention-history";

const lat = 41.55837, lng = 14.659698;
const dLat = 60 / 111_195, dLng = 80 / (111_195 * Math.cos((lat * Math.PI) / 180));
const ring: Array<[number, number]> = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];

describe("innaffiatoi", () => {
  it("cool a little each and cost per head", () => {
    expect(piazzaEstimate(0, 0, 0, 0, 4).dT).toBeCloseTo(4 * SPRINKLER_COOLING);
    expect(interventionCost(1000, 0, 0, 0, 0, 3).total).toEqual({ lo: 3 * UNIT_COST.sprinkler.lo, hi: 3 * UNIT_COST.sprinkler.hi });
  });
  it("are placed on the aiuole, inside the area, as many as the lever", () => {
    const l = piazzaLayout(ring, 0, 30, 0, {}, [], 0, [], 5)!;
    expect(l.sprinklers).toHaveLength(5);
    for (const p of l.sprinklers) expect(ringContains(ring, p[0], p[1])).toBe(true);
    expect(piazzaLayout(ring, 0, 0, 0, {}, [], 0, [], 3)!.sprinklers).toHaveLength(3);
  });
  it("show in the history rows only when set", () => {
    expect(mixRows({ kind: "piazza", trees: 1, permeable: 0, shade: 0, sprinklers: 2 })[0]!.rows.at(-1)).toEqual({ label: "Innaffiatoi", value: "2" });
    expect(mixRows({ kind: "piazza", trees: 1, permeable: 0, shade: 0 })[0]!.rows.some((r) => r.label === "Innaffiatoi")).toBe(false);
  });
});

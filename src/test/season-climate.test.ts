import { describe, expect, it } from "vitest";
import { coolingShare, estimatedTemp, seasonOfMonth, seasonalProfile } from "@/models/season-climate";

describe("season climate", () => {
  it("maps months to meteorological seasons", () => {
    expect([0, 3, 6, 9, 11].map(seasonOfMonth)).toEqual(["inverno", "primavera", "estate", "autunno", "inverno"]);
  });

  it("averages each season and hour and leaves missing hours empty", () => {
    const p = seasonalProfile(["2025-07-01T15:00", "2025-07-02T15:00", "2025-01-10T03:00", "2025-07-03T15:00"], [30, 34, 2, null]);
    expect(p.estate[15]).toBe(32);
    expect(p.inverno[3]).toBe(2);
    expect(p.primavera[12]).toBeNull();
  });

  it("cools only when it is hot and estimates a daily curve", () => {
    expect(coolingShare(40)).toBe(1);
    expect(coolingShare(30)).toBe(0.5);
    expect(coolingShare(12)).toBe(0);
    expect(estimatedTemp("estate", 15, 40)).toBe(40);
    expect(estimatedTemp("estate", 3, 40)).toBe(29);
  });
});

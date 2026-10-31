import { describe, expect, it } from "vitest";
import { LIBRARIES, SERVICES, logoQuery, logosFrom, needsDarkTile } from "@/models/credit-logos";

describe("credit logos", () => {
  it("gives every service and library a bundled mark or an article to look up, or its name alone", () => {
    for (const c of [...SERVICES, ...LIBRARIES]) expect(c.name.length).toBeGreaterThan(0);
    expect(SERVICES.find((c) => c.id === "osm")?.icon?.path).toBeTruthy();
    expect(SERVICES.find((c) => c.id === "gbif")?.articles).toContain("Global Biodiversity Information Facility");
  });
  it("asks Wikidata only for the articles, once each", () => {
    const q = logoQuery(SERVICES);
    expect(q).toContain('"Copernicus Programme"@en');
    expect(q.match(/"Istat"@en/g)).toHaveLength(1);
    expect(logosFrom(SERVICES, [{ title: { value: "Catalogue of Life" }, img: { value: "c.svg" } }])["col"]).toBe("c.svg");
  });
  it("puts a light mark on a dark tile", () => {
    expect(needsDarkTile("#ECE8D1")).toBe(true);
    expect(needsDarkTile("#4285F4")).toBe(false);
  });
});

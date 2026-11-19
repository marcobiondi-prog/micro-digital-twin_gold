import { describe, expect, it } from "vitest";
import { constraintRows, crowdEstimate, crowdRows, drawsFrom, drawsFromCounts, hourShare, interventionAdvice, siteCenter, siteConstraints, siteContextQuery, type SiteEl } from "@/models/site-context";

const LAT = 41.5603, LNG = 14.6627;
const at = (dLat: number, dLng = 0) => ({ lat: LAT + dLat / 111_320, lon: LNG + dLng / (111_320 * Math.cos((LAT * Math.PI) / 180)) });
const els: SiteEl[] = [
  { type: "node", id: 1, ...at(40), tags: { amenity: "cafe" } },
  { type: "node", id: 2, ...at(60), tags: { amenity: "restaurant" } },
  { type: "node", id: 3, ...at(80), tags: { shop: "clothes" } },
  { type: "node", id: 4, ...at(-90), tags: { highway: "bus_stop" } },
  { type: "way", id: 5, center: at(70), tags: { amenity: "place_of_worship", historic: "church", heritage: "2", name: "Chiesa di San Leonardo" } },
  { type: "node", id: 6, ...at(120), tags: { historic: "monument", name: "Monumento ai Caduti" } },
  { type: "node", id: 7, ...at(2000), tags: { amenity: "bar" } }, // too far, not counted
  { type: "count", tags: { ways: "320", total: "320" } },
];

describe("site context", () => {
  it("asks one query with the places around and the buildings' count", () => {
    const q = siteContextQuery(LAT, LNG);
    expect(q).toContain("around:300");
    expect(q.split("out count").length - 1).toBe(12);
    expect(q).toContain('"heritage"');
    expect(q).toContain("is_in");
  });
  it("reads the counts in their order", () => {
    const counts = [3, 12, 1, 2, 4, 1, 2, 0, 3, 410, 6, 2].map((n) => ({ type: "count", tags: { total: String(n) } }));
    const d = drawsFromCounts(counts);
    expect([d.food, d.shops, d.schools, d.worship, d.transport, d.attractions, d.hotels, d.markets, d.services, d.buildings, d.offices, d.leisure]).toEqual([3, 12, 1, 2, 4, 1, 2, 0, 3, 410, 6, 2]);
  });
  it("counts what draws people within 300 m", () => {
    const d = drawsFrom(els, LAT, LNG);
    expect(d.food).toBe(2);
    expect(d.shops).toBe(1);
    expect(d.transport).toBe(1);
    expect(d.worship).toBe(1);
    expect(d.buildings).toBe(320);
  });
  it("fills a summer evening more than a winter night, never past the area's capacity", () => {
    const d = drawsFrom(els, LAT, LNG);
    const eve = crowdEstimate(d, 4000, "estate", 20), night = crowdEstimate(d, 4000, "inverno", 3);
    expect(eve.people).toBeGreaterThan(night.people);
    expect(eve.low).toBeLessThanOrEqual(eve.people);
    expect(eve.high).toBeGreaterThanOrEqual(eve.people);
    expect(eve.byHour).toHaveLength(24);
    const tiny = crowdEstimate({ ...d, buildings: 5000, food: 200 }, 30, "estate", 20);
    expect(tiny.people).toBeLessThanOrEqual(20);
    expect(tiny.capped).toBe(true);
    expect(hourShare("estate", 15)).toBeLessThan(hourShare("primavera", 15));
    // A small area holds fewer people than a large one with the same surroundings.
    expect(crowdEstimate(d, 400, "primavera", 18).people).toBeLessThan(crowdEstimate(d, 6000, "primavera", 18).people);
  });
  it("finds the cultural goods and the historic square", () => {
    const cs = siteConstraints({ draws: drawsFrom(els, LAT, LNG), els, lat: LAT, lng: LNG, elevation: 700 }, "Piazza Vittorio Emanuele II");
    const ids = cs.map((c) => c.id);
    expect(ids).toContain("culturali");
    expect(ids).toContain("spazio-storico");
    expect(cs.find((c) => c.id === "culturali")?.why).toContain("Chiesa di San Leonardo");
    expect(ids).not.toContain("montagna");
    expect(interventionAdvice(cs, "piazza").join(" ")).toContain("Soprintendenza");
  });
  it("finds the landscape constraints by law and says when none shows", () => {
    const land: SiteEl[] = [
      { type: "way", id: 10, center: at(100), tags: { waterway: "river", name: "Biferno" } },
      { type: "relation", id: 11, tags: { boundary: "protected_area", name: "Parco del Matese" } },
    ];
    const cs = siteConstraints({ draws: drawsFrom(land, LAT, LNG), els: land, lat: LAT, lng: LNG, elevation: 1300 }, "Vigneto");
    expect(cs.map((c) => c.id).sort()).toEqual(["fiumi", "montagna", "parchi"]);
    expect(interventionAdvice(cs, "vigneto").join(" ")).toContain("autorizzazione paesaggistica");
    const none = siteConstraints({ draws: drawsFrom([], LAT, LNG), els: [], lat: LAT, lng: LNG, elevation: 50 }, "Via Roma");
    expect(none).toEqual([]);
    expect(interventionAdvice(none, "piazza")[0]).toContain("non risultano vincoli");
  });
  it("writes the report rows and reads the place where the simulation does", () => {
    const d = drawsFrom(els, LAT, LNG);
    const rows = crowdRows(crowdEstimate(d, 4000, "estate", 20), "estate", 20, 500);
    expect(rows[0]).toEqual(["Quando", "Estate, ore 20:00"]);
    expect(rows.find((r) => r[0] === "Ombra degli interventi")?.[1]).toContain("500");
    const cs = siteConstraints({ draws: d, els, lat: LAT, lng: LNG, elevation: 700 }, "Piazza Garibaldi");
    const cr = constraintRows(cs, "piazza");
    expect(cr[0]![0]).toContain("Beni culturali vicini");
    expect(cr.at(-1)![0]).toBe("Verifica");
    expect(siteCenter({ lat: LAT, lng: LNG }, null)).toEqual([LAT, LNG]);
  });
});

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
    expect(q).toMatch(/\[bbox:[\d.,-]+\]/);
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
    expect(interventionAdvice(none, "piazza")).toEqual([]);
    expect(constraintRows(none, "piazza")).toEqual([]);
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

import { distToPlace, siteKey } from "@/models/site-context";
describe("reading the drawn area", () => {
  const ring: [number, number][] = [[41.5605, 14.6620], [41.5605, 14.6630], [41.5612, 14.6630], [41.5612, 14.6620]];
  it("measures from the area's edge, 0 inside", () => {
    expect(distToPlace([41.5608, 14.6625], 0, 0, ring)).toBe(0);
    const d = distToPlace([41.5608, 14.6640], 41.5608, 14.6625, ring);
    expect(d).toBeGreaterThan(70); expect(d).toBeLessThan(95);
  });
  it("asks on the area's box, cuts long shapes to it, and a redrawn area is read again", () => {
    const q = siteContextQuery(41.5608, 14.6625, ring);
    expect(q).toContain("out tags geom(");
    expect(q).toContain("is_in(41.560500,14.662000)");
    // A river 120 m east of the edge counts (≤ 160 m), measured on its nearest point, not its centre far away.
    const river = { type: "way", tags: { waterway: "river", name: "Biferno" }, center: { lat: 41.58, lon: 14.6645 }, geometry: [{ lat: 41.5608, lon: 14.6644 }, { lat: 41.58, lon: 14.6645 }] };
    const cs = siteConstraints({ draws: drawsFromCounts([]), els: [river], lat: 41.5608, lng: 14.6625, ring, elevation: 300 }, "Vigneto");
    expect(cs.some((c) => c.id === "fiumi")).toBe(true);
    expect(siteKey(1, 2, ring)[3]).not.toBe(siteKey(1, 2, ring.map(([a, b]) => [a + 0.0002, b] as [number, number]))[3]);
  });
});

import { feasibleInterventions, type Constraint } from "@/models/site-context";
describe("interventions possible", () => {
  const c = (id: string) => ({ id, level: "probabile" as const, title: "", law: "", why: "", means: "" }) as unknown as Constraint;
  it("with nothing found everything is free and the mix is sized to the area", () => {
    const r = feasibleInterventions([], "piazza", 3000);
    expect(r.hints.every((h) => h.status === "libero")).toBe(true);
    expect(r.piazza).toMatchObject({ trees: 25 > 20 ? 20 : 25, shade: 30, misters: 6 });
  });
  it("a protected square asks for permission for shade sails and trees, keeping the sails light", () => {
    const r = feasibleInterventions([c("culturali")], "piazza", 3000);
    expect(r.hints.find((h) => h.id === "vele")?.status).toBe("autorizzazione");
    expect(r.hints.find((h) => h.id === "alberi")?.status).toBe("autorizzazione");
    expect(r.piazza?.shade).toBe(10); expect(r.piazza?.misters).toBe(0);
  });
  it("archaeology makes digging need a check", () => {
    expect(feasibleInterventions([c("archeologia")], "piazza", 1000).hints.find((h) => h.id === "aiuole")?.status).toBe("autorizzazione");
  });
  it("a landscape constraint keeps the vineyard's cloth out of the starting mix", () => {
    expect(feasibleInterventions([c("fiumi")], "vigneto", 10000).vine).toEqual({ irrigation: 8, shade: 0, windbreak: 40 });
  });
});

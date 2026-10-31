import { describe, expect, it } from "vitest";
import { GNSS, gnssLogoQuery, gnssLogosFrom } from "@/models/gnss";

describe("gnss logos", () => {
  it("asks for every system's article", () => {
    const q = gnssLogoQuery();
    for (const g of GNSS) for (const a of g.articles) expect(q).toContain(`"${a}"@en`);
    expect(q).toContain("wdt:P154");
  });
  it("maps rows to one logo per system, null when missing, first article first", () => {
    const logos = gnssLogosFrom([
      { title: { value: "GLONASS" }, img: { value: "http://commons.wikimedia.org/wiki/Special:FilePath/G.svg" } },
      { title: { value: "NavIC" }, img: { value: "n2.svg" } },
      { title: { value: "Indian Regional Navigation Satellite System" }, img: { value: "n1.svg" } },
    ]);
    expect(logos['glonass']).toContain("G.svg");
    expect(logos['navic']).toBe("n1.svg");
    expect(logos['gps']).toBeNull();
    expect(Object.keys(logos)).toHaveLength(GNSS.length);
  });
});

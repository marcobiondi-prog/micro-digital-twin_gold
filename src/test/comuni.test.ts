import { describe, expect, it } from "vitest";
import comuni from "@/data/comuni-it.json";
import { crestQuery, crestUrl, findComune, fold, searchComuni, townDomain, type Comune } from "@/models/comuni";

const list = comuni as unknown as Comune[];

describe("comuni", () => {
  it("has every Italian town with its province", () => {
    expect(list.length).toBeGreaterThan(7800);
    expect(findComune(list, "campobasso")).toEqual(["Campobasso", "CB", 48747, "070006"]);
  });
  it("suggests the towns starting with what was typed, most populated first", () => {
    const hits = searchComuni(list, "Campo");
    expect(hits[0]![0]).toBe("Campobasso");
    expect(hits.length).toBe(8);
    expect(searchComuni(list, "c")).toEqual([]);
  });
  it("ignores accents, case and apostrophes", () => {
    expect(fold("Sant'Agata de' Goti")).toBe("sant agata de goti");
    expect(searchComuni(list, "forli")[0]![0]).toMatch(/^Forl/);
    expect(searchComuni(list, "agata de")[0]![0]).toBe("Sant'Agata de' Goti");
  });
  it("suggests the town's email domain", () => {
    expect(townDomain("Reggio nell'Emilia")).toBe("comune.reggionellemilia.it");
  });
});

describe("coat of arms", () => {
  it("asks Wikidata by ISTAT code and makes a small picture of the file", () => {
    expect(crestQuery("070006")).toContain('wdt:P635 "070006"');
    expect(crestQuery('07"; DROP')).toContain('wdt:P635 "07"');
    expect(crestUrl("http://commons.wikimedia.org/wiki/Special:FilePath/Campobasso-Stemma.svg")).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/Campobasso-Stemma.svg?width=160");
  });
});

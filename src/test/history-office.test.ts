import { describe, expect, it } from "vitest";
import { byOf, isHistoryEntry, newEntry, ofOffice } from "@/models/intervention-history";

describe("history by office", () => {
  const by = { comune: "Campobasso", office: "Ambiente e verde pubblico", role: "Istruttore tecnico" };
  const mix = { kind: "piazza" as const, trees: 4, permeable: 20, shade: 10 };
  it("keeps who recorded a piazza entry, also as a copy in the mix", () => {
    const e = newEntry("piazza", "Alberi 4", "Piazza X", new Date(), mix, null, by);
    expect(isHistoryEntry(e)).toBe(true);
    expect(byOf(e)).toEqual(by);
    expect(byOf({ ...e, by: null })).toEqual(by);
  });
  it("tells the office's entries apart; older entries count as its own", () => {
    const mine = newEntry("piazza", "a", "p", new Date(), mix, null, by);
    const other = newEntry("piazza", "b", "p", new Date(), mix, null, { ...by, office: "Lavori pubblici" });
    const old = newEntry("piazza", "c", "p", new Date(), mix);
    const here = { comune: "campobasso", office: "Ambiente e verde pubblico" };
    expect([mine, other, old].map((e) => ofOffice(e, here))).toEqual([true, false, true]);
  });
});

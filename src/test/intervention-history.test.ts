import { beforeEach, describe, expect, it } from "vitest";
import {
  groupByDay,
  mixRows,
  addLocalHistory, clearLocalHistory, groupByMonth, whenLabel, whenOf, isHistoryEntry, isHistoryMix, localHistory, MAX_HISTORY, MAX_TEXT, mergeHistory, newEntry, resetLocalHistory,
  sortNewestFirst, type HistoryEntry,
} from "@/models/intervention-history";

const at = (iso: string, id: string, flow: HistoryEntry["flow"] = "piazza"): HistoryEntry => ({ id, at: iso, flow, place: "Piazza Roma", text: `voce ${id}` });

describe("intervention-history", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k),
    } });
    resetLocalHistory();
  });

  it("builds an entry with trimmed, capped text", () => {
    const e = newEntry("vigneto", `  ${"a".repeat(MAX_TEXT + 50)}  `, " Barolo ", new Date("2026-10-28T10:00:00Z"));
    expect(e.text).toHaveLength(MAX_TEXT);
    expect(e.place).toBe("Barolo");
    expect(e.at).toBe("2026-10-28T10:00:00.000Z");
    expect(isHistoryEntry(e)).toBe(true);
  });

  it("sorts newest first without touching the input", () => {
    const list = [at("2026-10-01T00:00:00Z", "a"), at("2026-10-03T00:00:00Z", "b"), at("2026-10-02T00:00:00Z", "c")];
    expect(sortNewestFirst(list).map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(list.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("merges lists, dropping duplicate ids and capping the total", () => {
    const merged = mergeHistory([at("2026-10-01T00:00:00Z", "a")], [at("2026-10-02T00:00:00Z", "b"), at("2026-10-05T00:00:00Z", "a")]);
    expect(merged.map((e) => e.id)).toEqual(["b", "a"]);
    const many = Array.from({ length: MAX_HISTORY + 20 }, (_, i) => at(new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), `x${i}`));
    expect(mergeHistory(many)).toHaveLength(MAX_HISTORY);
  });

  it("rejects malformed entries", () => {
    expect(isHistoryEntry(null)).toBe(false);
    expect(isHistoryEntry({ id: "a", at: "not a date", flow: "piazza", place: "", text: "x" })).toBe(false);
    expect(isHistoryEntry({ id: "a", at: "2026-10-01T00:00:00Z", flow: "altro", place: "", text: "x" })).toBe(false);
  });

  it("groups by month, newest first", () => {
    const groups = groupByMonth([at("2026-09-15T12:00:00", "a"), at("2026-10-20T12:00:00", "b"), at("2026-10-02T12:00:00", "c")]);
    expect(groups.map((g) => g.key)).toEqual(["2026-10", "2026-09"]);
    expect(groups[0]!.items.map((e) => e.id)).toEqual(["b", "c"]);
    expect(groups[0]!.label).toMatch(/ottobre 2026/i);
  });

  it("gives entries a uuid id, as the account table expects", () => {
    expect(newEntry("piazza", "x", "").id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps a valid mix and refuses a broken one", () => {
    const piazza = { kind: "piazza", trees: 6, permeable: 20, shade: 15 } as const;
    const vigneto = { kind: "vigneto", zones: [{ irrigation: 8, shade: 30, windbreak: 40 }], allZones: true, selected: 0 } as const;
    expect(isHistoryMix(piazza) && isHistoryMix(vigneto)).toBe(true);
    expect(isHistoryMix({ kind: "piazza", trees: "6", permeable: 20, shade: 15 })).toBe(false);
    expect(isHistoryMix({ kind: "vigneto", zones: [], allZones: true, selected: 0 })).toBe(false);
    expect(isHistoryEntry({ ...newEntry("piazza", "x", "", new Date(), piazza) })).toBe(true);
    expect(isHistoryEntry({ ...newEntry("piazza", "x", ""), mix: { kind: "altro" } })).toBe(false);
    expect(isHistoryEntry({ id: "a", at: "2026-10-01T00:00:00Z", flow: "piazza", place: "", text: "x" })).toBe(true);
  });

  it("keeps the simulated season and hour", () => {
    const e = newEntry("piazza", "x", "", new Date(), null, { season: "estate", hour: 15 });
    expect(whenOf(e)).toEqual({ season: "estate", hour: 15 });
    expect(whenLabel(e)).toBe("Estate, ore 15");
    expect(isHistoryEntry(e)).toBe(true);
    expect(whenLabel(newEntry("piazza", "x", ""))).toBe("");
    expect(isHistoryEntry({ ...e, season: "monsone" })).toBe(false);
    expect(isHistoryEntry({ ...e, hour: 24 })).toBe(false);
  });

  it("empties the device history, also after a reload", () => {
    addLocalHistory(at("2026-10-01T00:00:00Z", "a"));
    clearLocalHistory();
    expect(localHistory()).toEqual([]);
    resetLocalHistory();
    expect(localHistory()).toEqual([]);
  });

  it("keeps the device history across reloads", () => {
    addLocalHistory(at("2026-10-01T00:00:00Z", "a"));
    addLocalHistory(at("2026-10-02T00:00:00Z", "b"));
    resetLocalHistory();
    expect(localHistory().map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("mixRows", () => {
  it("reads the piazza's levers", () => {
    expect(mixRows({ kind: "piazza", trees: 7, permeable: 20, shade: 15 })).toEqual([{ title: "Piazza", rows: [
      { label: "Alberi", value: "7" }, { label: "Prato", value: "20 %" }, { label: "Ombra", value: "15 %" }] }]);
  });
  it("lists every zone on Tutte, only the chosen one otherwise", () => {
    const zones = [{ irrigation: 8, shade: 30, windbreak: 40 }, { irrigation: 2, shade: 0, windbreak: 10 }];
    expect(mixRows({ kind: "vigneto", zones, allZones: true, selected: 0 }).map((g) => g.title)).toEqual(["Zona 1", "Zona 2"]);
    const one = mixRows({ kind: "vigneto", zones, allZones: false, selected: 1 });
    expect(one).toHaveLength(1);
    expect(one[0]!.title).toBe("Zona 2");
    expect(one[0]!.rows[0]).toEqual({ label: "Irrigazione", value: "+2 %" });
  });
});

describe("season and hour kept in the mix", () => {
  it("reads them from the mix when the entry's own fields are missing", () => {
    const e = newEntry("piazza", "Alberi 3", "Piazza", new Date(), { kind: "piazza", trees: 3, permeable: 0, shade: 0 }, { season: "autunno", hour: 18 });
    expect(e.mix?.when).toEqual({ season: "autunno", hour: 18 });
    expect(whenOf({ ...e, season: null, hour: null })).toEqual({ season: "autunno", hour: 18 });
    expect(isHistoryEntry({ ...e, season: null, hour: null })).toBe(true);
  });
});

describe("groupByDay", () => {
  it("puts each day's interventions in one group headed gg/mm/aaaa, newest first", () => {
    const at = (iso: string) => ({ ...newEntry("piazza", "x", "p"), at: new Date(iso).toISOString() });
    const g = groupByDay([at("2026-10-28T10:00:00"), at("2026-10-29T19:24:00"), at("2026-10-29T18:51:00")]);
    expect(g.map((d) => [d.label, d.items.length])).toEqual([["29/10/2026", 2], ["28/10/2026", 1]]);
  });
});

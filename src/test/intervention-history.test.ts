import { beforeEach, describe, expect, it } from "vitest";
import {
  addLocalHistory, groupByMonth, isHistoryEntry, localHistory, MAX_HISTORY, MAX_TEXT, mergeHistory, newEntry, resetLocalHistory,
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

  it("keeps the device history across reloads", () => {
    addLocalHistory(at("2026-10-01T00:00:00Z", "a"));
    addLocalHistory(at("2026-10-02T00:00:00Z", "b"));
    resetLocalHistory();
    expect(localHistory().map((e) => e.id)).toEqual(["b", "a"]);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import { urbanMix, vineyardMix } from "@/models/history-summary";
import { getLab, setUrban, setVineyard } from "@/models/lab-store";
import { reopenHistory } from "@/lib/use-history";

describe("Riapri", () => {
  it("puts a piazza intervention back", () => {
    const mix = urbanMix({ ...getLab().urban, trees: 12, permeable: 40, shade: 30 });
    setUrban({ trees: 0, permeable: 0, shade: 0 });
    reopenHistory(mix);
    const u = getLab().urban;
    expect([u.trees, u.permeable, u.shade]).toEqual([12, 40, 30]);
    expect(u.treeCells).toBeNull();
  });

  it("puts every vineyard zone and the scope back", () => {
    const before = getLab().vineyard;
    const mix = vineyardMix({ ...before, allZones: false, selected: 1, zones: before.zones.map((z, i) => ({ ...z, irrigation: 2 * i, shade: 10 * i, windbreak: 20 * i })) });
    setVineyard((v) => ({ allZones: true, selected: 0, zones: v.zones.map((z) => ({ ...z, irrigation: 0, shade: 0, windbreak: 0 })) }));
    reopenHistory(mix);
    const v = getLab().vineyard;
    expect(v.allZones).toBe(false);
    expect(v.selected).toBe(1);
    expect(v.zones.map((z) => [z.irrigation, z.shade, z.windbreak])).toEqual(before.zones.map((_, i) => [2 * i, 10 * i, 20 * i]));
  });
});

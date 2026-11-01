import { beforeEach, describe, expect, it } from "vitest";
import { getLab, setUrban, setVineyard } from "@/models/lab-store";

const A = { label: "Piazza A", lat: 41.5, lng: 14.6 }, B = { label: "Piazza B", lat: 41.6, lng: 14.7 };
const area = (at: { lat: number; lng: number }) => ({ lat: at.lat, lng: at.lng, ring: [[at.lat, at.lng], [at.lat + 1e-4, at.lng], [at.lat, at.lng + 1e-4]] as Array<[number, number]>, edits: { onlyDrawn: true } });

describe("changing place keeps each place's simulation", () => {
  beforeEach(() => setUrban({ location: A }));
  it("brings back the interventions and the area drawn when coming back", () => {
    setUrban({ location: A, trees: 12, permeable: 40, shade: 30, area: area(A) });
    setUrban({ location: B });
    expect(getLab().urban.area).toBeNull();
    expect(getLab().urban.trees).toBe(12);
    setUrban({ trees: 3, permeable: 10, shade: 0, area: area(B) });
    setUrban({ location: { ...A, lat: A.lat + 1e-4 } });
    const u = getLab().urban;
    expect([u.trees, u.permeable, u.shade]).toEqual([12, 40, 30]);
    expect(u.area?.edits?.onlyDrawn).toBe(true);
    expect(u.area?.lat).toBeCloseTo(A.lat + 1e-4);
    setUrban({ location: B });
    expect([getLab().urban.trees, getLab().urban.permeable]).toEqual([3, 10]);
    expect(getLab().urban.area?.lat).toBe(B.lat);
  });
  it("keeps the vineyard's zone mixes per place", () => {
    setVineyard({ location: A });
    setVineyard((v) => ({ zones: v.zones.map((z) => ({ ...z, irrigation: 12 })), area: area(A) }));
    setVineyard({ location: B });
    setVineyard((v) => ({ zones: v.zones.map((z) => ({ ...z, irrigation: 2 })) }));
    setVineyard({ location: A });
    expect(getLab().vineyard.zones.every((z) => z.irrigation === 12)).toBe(true);
    expect(getLab().vineyard.area).not.toBeNull();
  });
});

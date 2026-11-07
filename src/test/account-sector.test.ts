import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {}, from: () => ({}) } }));
import { sectorOf } from "@/lib/use-pro-id";

const a = { kind: "agronomo", name: "Marco", licenceType: "consulente", licence: "X", region: "Molise", expires: "2030-01-01", at: "2026-11-07T10:00:00Z" };
const f = { kind: "funzionario", name: "Marco", comune: "Campobasso", office: "Urbanistica", role: "Funzionario", email: "m@x.it", at: "2026-11-07T11:00:00Z" };

describe("one personal account, one sector", () => {
  it("reads pro_sector first", () => {
    expect(sectorOf({ pro_sector: "agronomo", pro_own: ["funzionario"] })).toBe("agronomo");
  });
  it("takes the only kind owned", () => {
    expect(sectorOf({ pro_own: ["funzionario"] })).toBe("funzionario");
  });
  it("with both owned keeps the one in use, else the most recent", () => {
    expect(sectorOf({ pro_own: ["agronomo", "funzionario"], pro_id: a })).toBe("agronomo");
    expect(sectorOf({ pro_own: ["agronomo", "funzionario"], pro_id: null, pro_last: { agronomo: a, funzionario: f } })).toBe("funzionario");
  });
  it("has no sector before the first profile", () => {
    expect(sectorOf({})).toBeNull();
    expect(sectorOf(null)).toBeNull();
  });
});

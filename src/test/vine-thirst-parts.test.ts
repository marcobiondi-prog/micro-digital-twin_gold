import { describe, expect, it } from "vitest";
import { vineModel, vineThirstParts, type Pheno } from "@/models/data";

describe("vineThirstParts", () => {
  it("adds up to the thirst index vineModel gives", () => {
    const cases: Array<{ moisture: number; temp: number; wind: number; phase: Pheno; rain: boolean }> = [
      { moisture: 18, temp: 31, wind: 12, phase: "Invaiatura", rain: false },
      { moisture: 40, temp: 22, wind: 5, phase: "Germogliamento", rain: true },
      { moisture: 10, temp: 38, wind: 30, phase: "Fioritura", rain: false },
    ];
    for (const c of cases) {
      const p = vineThirstParts(c);
      const s = Math.round(Math.max(0, Math.min(100, (p.soil + p.heat + p.wind) * p.weight - p.rain)));
      expect(s).toBe(vineModel(c).s);
    }
  });
});

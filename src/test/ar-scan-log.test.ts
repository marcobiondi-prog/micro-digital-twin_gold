import { describe, expect, it } from "vitest";
import { clearScans, currentScans, recordScan, scanPhoto, scanReportRows, updateScan } from "@/models/ar-scan-log";

const base = { kind: "urban" as const, target: "Alberi e ombra", context: "Piazza", satellite: null };

describe("ar-scan-log", () => {
  it("keeps every scan per flow and follows the specimen count", () => {
    clearScans("urban"); clearScans("vineyard");
    const id = recordScan({ ...base, result: "Leccio · specie probabile", soil: null, count: 0, totalCooling: 0, totalShade: 0,
      species: { commonName: "Leccio", scientificName: "Quercus ilex", family: "Fagaceae", level: "Specie probabile", cooling: 0.4, shade: 50 } });
    recordScan({ ...base, target: "Suolo e depavimentazione", result: "Terreno analizzato", species: null, count: 0, totalCooling: null, totalShade: null,
      soil: { label: "Asfalto", permeability: "bassa", plantable: false, note: "" } });
    updateScan("urban", id, { count: 3, totalCooling: 1.2, totalShade: 150 });
    expect(currentScans("urban")).toHaveLength(2);
    expect(currentScans("vineyard")).toHaveLength(0);
    const rows = scanReportRows(currentScans("urban"));
    expect(rows[0]![0]).toMatch(/^1\. .* · Alberi e ombra$/);
    expect(rows[0]![1]).toBe("Piazza · Leccio (Quercus ilex, Fagaceae) · specie probabile · per esemplare ≈ −0,4 °C · 3 esemplari ≈ −1,2 °C · ombra ≈ 150 m²");
    expect(rows[1]![1]).toBe("Piazza · suolo Asfalto · permeabilità bassa · non piantabile");
  });

  it("keeps each scan's real photo for Esito, across reloads, until the scans are cleared", () => {
    clearScans("urban");
    const id = recordScan({ ...base, result: "Ficus", soil: null, count: 0, totalCooling: null, totalShade: null, species: null, photo: "data:image/jpeg;base64,AA" });
    const none = recordScan({ ...base, result: "Terreno", soil: null, count: 0, totalCooling: null, totalShade: null, species: null });
    expect(scanPhoto(id)).toBe("data:image/jpeg;base64,AA");
    expect(scanPhoto(none)).toBeNull();
    expect(currentScans("urban")[0]).not.toHaveProperty("photo");
    expect(sessionStorage.getItem(`micro-digital-twin-ar-scan-photo:${id}`)).toBe("data:image/jpeg;base64,AA");
    clearScans("urban");
    expect(scanPhoto(id)).toBeNull();
    expect(sessionStorage.getItem(`micro-digital-twin-ar-scan-photo:${id}`)).toBeNull();
  });
});

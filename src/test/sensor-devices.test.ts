import { describe, expect, it } from "vitest";
import { freshAverage, kindOf, latestByKind, newSensorToken, parseReadings, tokenHash, type SensorRow } from "@/models/sensor-devices";

const NOW = Date.parse("2026-11-05T12:00:00Z");

describe("sensor devices", () => {
  it("reads every message shape and drops bad values", () => {
    expect(parseReadings({ value: 31.2 }, "temperatura", NOW).readings).toEqual([{ kind: "temperatura", value: 31.2, at: "2026-11-05T12:00:00.000Z" }]);
    const many = parseReadings({ temperature: "28,5", humidity: 40, foo: 1 }, "temperatura", NOW);
    expect(many.readings.map((r) => r.kind)).toEqual(["temperatura", "umidita_aria"]);
    expect(many.readings[0]!.value).toBe(28.5);
    expect(many.dropped).toBe(1);
    const list = parseReadings({ readings: [{ kind: "soil_moisture", value: 22, at: NOW / 1000 - 60 }, { value: 999 }, { kind: "vento", value: 10, at: "2030-01-01T00:00:00Z" }] }, "temperatura", NOW);
    expect(list.readings).toHaveLength(1);
    expect(list.readings[0]!.kind).toBe("umidita_suolo");
    expect(list.dropped).toBe(2);
    expect(parseReadings("x", "vento", NOW).readings).toEqual([]);
  });
  it("knows the aliases", () => {
    expect(kindOf("IR")).toBe("superficie");
    expect(kindOf("wind")).toBe("vento");
    expect(kindOf("nope")).toBeNull();
  });
  it("keeps the latest reading per kind and averages only fresh ones", () => {
    const m = latestByKind([
      { sensor_id: "a", kind: "temperatura", value: 30, at: "2026-11-05T11:30:00Z" },
      { sensor_id: "a", kind: "temperatura", value: 25, at: "2026-11-05T09:00:00Z" },
      { sensor_id: "b", kind: "temperatura", value: 20, at: "2026-11-04T09:00:00Z" },
    ]);
    expect(m.get("a")!.temperatura!.value).toBe(30);
    const row = (id: string, zone: number | null): SensorRow => ({ id, flow: "vigneto", name: id, kind: "temperatura", lat: 0, lng: 0, zone, last_seen_at: null, latest: m.get(id) ?? {} });
    expect(freshAverage([row("a", 1), row("b", null)], "temperatura", NOW)).toEqual({ value: 30, count: 1 });
    expect(freshAverage([row("a", 1)], "temperatura", NOW, 0)).toBeNull();
  });
  it("makes keys and hashes them", async () => {
    const t = newSensorToken();
    expect(t).toMatch(/^mdt_[0-9a-f]{40}$/);
    expect(await tokenHash(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

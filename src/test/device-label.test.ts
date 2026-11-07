import { describe, expect, it } from "vitest";
import { deviceLabel } from "@/models/device-label";

describe("device label", () => {
  it("names system and browser in plain words", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", { standalone: true })).toBe("iPhone · app installata");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0")).toBe("Windows · Edge");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; K) Chrome/130.0 Mobile Safari/537.36", { model: "SM-S918B" })).toBe("SM-S918B · Android · Chrome");
  });
});

import { mergeSameDevices } from "@/models/device-label";
describe("same device merged", () => {
  const row = (id: string, device_id: string, label: string, first: string, last: string) => ({ id, device_id, label, first_seen: first, last_seen: last });
  it("keeps one row per label, this device’s own when it is there", () => {
    const rows = [
      row("a", "me", "XQ-FE72 · Android · app installata", "2026-11-07T05:00", "2026-11-07T06:00"),
      row("b", "old1", "XQ-FE72 · Android · app installata", "2026-11-07T03:00", "2026-11-07T05:30"),
      row("c", "old2", "XQ-FE72 · Android · app installata", "2026-11-07T04:00", "2026-11-07T04:28"),
      row("d", "pc", "Windows · Chrome", "2026-11-01T10:00", "2026-11-06T10:00"),
    ];
    const { keep, drop } = mergeSameDevices(rows, "me");
    expect(keep.map((r) => r.id)).toEqual(["a", "d"]);
    expect(keep[0]!.first_seen).toBe("2026-11-07T03:00");
    expect(drop.map((r) => r.id).sort()).toEqual(["b", "c"]);
  });
});

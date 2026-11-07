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

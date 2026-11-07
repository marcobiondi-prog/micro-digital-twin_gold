import { describe, expect, it } from "vitest";
import { curlCode, esp32Code, pythonCode } from "@/models/sensor-code";

const URL = "https://micro-digital-twin-gold.vercel.app/api/public/sensor-readings";
const KEY = "mdt_" + "a".repeat(40);
const balanced = (s: string) => [...s].reduce((n, c) => n + (c === "{" ? 1 : c === "}" ? -1 : 0), 0) === 0;

describe("sensor code", () => {
  it("writes the address and the key into every kind of code", () => {
    for (const code of [curlCode(URL, KEY, "temperatura"), esp32Code(URL, KEY, "vento"), pythonCode(URL, KEY, "pioggia")]) {
      expect(code).toContain(URL);
      expect(code).toContain(KEY);
    }
  });
  it("reads a DHT22 for temperature and sends both values", () => {
    const c = esp32Code(URL, KEY, "temperatura", { name: "Casa", password: "p\"w" });
    expect(c).toContain("#include <DHT.h>");
    expect(c).toContain('"Casa"');
    expect(c).toContain('"p\\"w"');
    expect(c).toContain("\\\"temperature\\\"");
    expect(balanced(c)).toBe(true);
  });
  it("leaves an analogue reading to adapt for the other kinds", () => {
    const c = esp32Code(URL, KEY, "umidita_suolo");
    expect(c).not.toContain("DHT");
    expect(c).toContain("float leggiValore()");
    expect(balanced(c)).toBe(true);
    expect(pythonCode(URL, KEY, "umidita_suolo")).toContain("def leggi_valore()");
  });
});

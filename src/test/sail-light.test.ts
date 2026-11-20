import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { arLightLevel, lightTarget, realPapillons, setShadeTarget } from "@/views/ar-papillon";

describe("sails in the AR open only with light", () => {
  it("opens above the bright threshold, closes in the dark, keeps its state in between", () => {
    expect(lightTarget(0.6, 0)).toBe(1);
    expect(lightTarget(0.1, 1)).toBe(0);
    expect(lightTarget(0.27, 1)).toBe(1);
    expect(lightTarget(0.27, 0)).toBe(0);
  });
  it("reads ARCore's light as a 0–1 level", () => {
    expect(arLightLevel(0, 0)).toBe(0);
    expect(arLightLevel(3, 1)).toBeGreaterThan(0.9);
    expect(arLightLevel(0.05, 0.02)).toBeLessThan(0.15);
  });
  it("joined sails are one canopy over all their trunks and start closed", () => {
    const g = realPapillons({ w: 8, d: 4, open: 0, joined: true });
    const state = g.userData["papillon"] as { open: number };
    expect(state.open).toBe(0);
    expect(setShadeTarget(g, 1)).toBe(1);
    const open = realPapillons({ w: 8, d: 4, open: 1, joined: true });
    const canopy = open.getObjectByName("papillon-canopy")!;
    const box = new THREE.Box3().setFromObject(canopy);
    expect(box.max.x - box.min.x).toBeGreaterThan(7.5);       // one sail over the whole 8 m, not two round ones
    expect(box.max.z - box.min.z).toBeLessThan(4.1);
  });
});

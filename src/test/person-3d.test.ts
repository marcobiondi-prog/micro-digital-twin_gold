import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

// jsdom has no 2D canvas: a stub context is enough for the label texture.
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => new Proxy({ measureText: () => ({ width: 10 }) }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : () => {}) , set: () => true }) as unknown as CanvasRenderingContext2D);

const { syncPeople } = await import("@/views/person-3d");

describe("colleagues in AR / VR", () => {
  const at = (lat: number, lng: number) => ({ x: lng * 1000, z: -lat * 1000 });
  it("adds, moves and removes markers by id", () => {
    const g = new THREE.Group();
    syncPeople(g, [{ id: "a", name: "Laura Bianchi", avatar: null, lat: 1, lng: 2 }, { id: "b", name: "Giulia", avatar: null, lat: 0, lng: 0 }], at);
    expect(g.children.map((c) => c.name).sort()).toEqual(["person:a", "person:b"]);
    const a = g.getObjectByName("person:a")!;
    expect([a.position.x, a.position.z]).toEqual([2000, -1000]);
    syncPeople(g, [{ id: "a", name: "Laura Bianchi", avatar: null, lat: 2, lng: 2 }], at);
    expect(g.children.length).toBe(1);
    expect(g.getObjectByName("person:a")).toBe(a);
    expect(a.position.z).toBe(-2000);
  });
  it("leaves out those it cannot place (AR not aligned)", () => {
    const g = new THREE.Group();
    syncPeople(g, [{ id: "a", name: "Laura", avatar: null, lat: 1, lng: 2 }], () => null);
    expect(g.children.length).toBe(0);
  });
});

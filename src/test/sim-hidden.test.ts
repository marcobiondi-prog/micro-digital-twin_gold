import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: () => ({ remove: async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }) }) },
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

describe("taking files out of a simulation", () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  const item = (id: string) => ({ id, path: id, name: id, size: 1, url: "x", kind: "image" as const });

  it("hides them from the simulation only: the project’s list (the Cronologia) keeps them", async () => {
    const store = await import("@/models/lab-media-store");
    const sim = await import("@/models/sim-hidden");
    const a = item("u/urban/1-a.jpg"), b = item("u/urban/2-b.jpg");
    store.setMedia("urban", () => [a, b]);
    sim.hideFromSim("urban", [a]);
    expect(sim.simOnly("urban", store.getMedia("urban")).map((m) => m.id)).toEqual([b.id]);
    expect(store.getMedia("urban")).toHaveLength(2);
    sim.unhide([sim.simKey("urban", a.id)]);
    expect(sim.simOnly("urban", store.getMedia("urban"))).toHaveLength(2);
  });

  it("drops the mark when the file is deleted for good from the Cronologia", async () => {
    const store = await import("@/models/lab-media-store");
    const sim = await import("@/models/sim-hidden");
    const a = item("u/urban/1-a.jpg");
    store.setMedia("urban", () => [a]);
    sim.hideFromSim("urban", [a]);
    await store.removeMedia("urban", [a]);
    expect(JSON.parse(localStorage.getItem("mdt-sim-hidden-v1") ?? "{}")).toEqual({});
  });
});

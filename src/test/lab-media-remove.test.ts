import { beforeEach, describe, expect, it, vi } from "vitest";

// The storage answers with the files it really deleted: here it lets go of a.jpg only.
const remove = vi.fn(async (paths: string[]) => ({ data: paths.filter((p) => p.endsWith("a.jpg")).map((name) => ({ name })), error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ remove }) }, auth: { getSession: async () => ({ data: { session: null } }) } },
}));

describe("removeMedia", () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it("drops only the files the storage deleted, and their archive marks, then says some stayed", async () => {
    const store = await import("@/models/lab-media-store");
    const archive = await import("@/models/media-archive");
    const a = { id: "u/urban/1-a.jpg", path: "u/urban/1-a.jpg", name: "a.jpg", size: 1, url: "x", kind: "image" as const };
    const b = { id: "u/urban/2-b.jpg", path: "u/urban/2-b.jpg", name: "b.jpg", size: 1, url: "y", kind: "image" as const };
    store.setMedia("urban", () => [a, b]);
    archive.archiveMedia([`piazza-${a.id}`, `piazza-${b.id}`]);
    await expect(store.removeMedia("urban", [a, b])).rejects.toThrow("not-deleted:1");
    expect(store.getMedia("urban").map((m) => m.id)).toEqual([b.id]);
    const marks = JSON.parse(localStorage.getItem("mdt-media-archive-v1") ?? "{}");
    expect(Object.keys(marks)).toEqual([`piazza-${b.id}`]);
  });
});

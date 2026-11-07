import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

/** Falso IndexedDB in memoria: basta per put/getAll/delete usati dallo store. */
const data = new Map<string, unknown>();
class Req<T> {
  result: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  constructor(result: T) { this.result = result; }
}
beforeAll(() => {
  (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
    open() {
      const req = new Req<unknown>(null);
      const db = {
        createObjectStore: () => ({}),
        close: () => {},
        transaction: () => ({
          objectStore: () => ({
            put: (rec: { key: string }) => {
              const r = new Req(rec.key);
              queueMicrotask(() => { data.set(rec.key, rec); r.onsuccess?.(); });
              return r;
            },
            delete: (key: string) => {
              const r = new Req(undefined);
              queueMicrotask(() => { data.delete(key); r.onsuccess?.(); });
              return r;
            },
            getAll: () => {
              const r = new Req([...data.values()]);
              queueMicrotask(() => r.onsuccess?.());
              return r;
            },
          }),
        }),
      };
      queueMicrotask(() => { req.result = db; req.onupgradeneeded?.(); req.onsuccess?.(); });
      return req;
    },
  };
  if (!("createObjectURL" in URL)) {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:mock";
  }
});

/** Ricarica il modulo: simula una pagina che si riavvia con lo stesso IndexedDB. */
async function freshStore() {
  vi.resetModules();
  return import("@/models/lab-media-store");
}

describe("file ospite del Lab (per scheda, persistenti sul dispositivo)", () => {
  beforeEach(() => data.clear());

  it("caricati in Urbano restano dopo una ricarica e non finiscono in Vitivinicolo", async () => {
    const store = await freshStore();
    const blob = new Blob(["foto"]);
    await store.saveGuestFile("urban", blob, { id: "u1", name: "piazza.jpg", size: 4, url: "blob:x", kind: "image" });
    await store.saveGuestFile("vineyard", blob, { id: "v1", name: "vigneto.jpg", size: 4, url: "blob:y", kind: "image" });

    const reopened = await freshStore();
    const urban = await reopened.ensureMedia("urban", null);
    expect(urban).toHaveLength(1);
    expect(urban[0]!.id).toBe("u1");
    expect(urban[0]!.name).toBe("piazza.jpg");

    const vineyard = await reopened.ensureMedia("vineyard", null);
    expect(vineyard).toHaveLength(1);
    expect(vineyard[0]!.id).toBe("v1");
  });

  it("il passaggio a Vitivinicolo non svuota l’elenco di Urbano", async () => {
    const store = await freshStore();
    await store.saveGuestFile("urban", new Blob(["a"]), { id: "u2", name: "a.jpg", size: 1, url: "blob:a", kind: "image" });
    expect(await store.ensureMedia("urban", null)).toHaveLength(1);
    expect(await store.ensureMedia("vineyard", null)).toHaveLength(0);
    expect(await store.ensureMedia("urban", null)).toHaveLength(1);
  });

  it("eliminare un file ospite lo toglie anche dal dispositivo", async () => {
    const store = await freshStore();
    await store.saveGuestFile("urban", new Blob(["a"]), { id: "u3", name: "a.jpg", size: 1, url: "blob:a", kind: "image" });
    expect(await store.ensureMedia("urban", null)).toHaveLength(1);
    await store.deleteGuestFile("urban", "u3");
    const reopened = await freshStore();
    expect(await reopened.ensureMedia("urban", null)).toHaveLength(0);
  });
});

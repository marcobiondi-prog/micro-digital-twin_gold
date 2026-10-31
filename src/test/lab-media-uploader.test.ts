import { describe, expect, it, vi, beforeAll } from "vitest";

/** Falso IndexedDB in memoria: basta per put/getAll/delete usati dallo store ospite. */
const data = new Map<string, unknown>();
class Req<T> {
  result: T;
  error: unknown = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
  constructor(result: T) {
    this.result = result;
  }
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
              queueMicrotask(() => {
                data.set(rec.key, rec);
                r.onsuccess?.();
              });
              return r;
            },
            delete: (key: string) => {
              const r = new Req(undefined);
              queueMicrotask(() => {
                data.delete(key);
                r.onsuccess?.();
              });
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
      queueMicrotask(() => {
        req.result = db;
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  if (!("createObjectURL" in URL)) {
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:mock";
  }
});

/** Nessun componente montato: la coda viene usata direttamente, come farebbe il Lab smontato. */
async function freshModules() {
  vi.resetModules();
  const uploader = await import("@/models/lab-media-uploader");
  const store = await import("@/models/lab-media-store");
  return { uploader, store };
}

describe("caricamento in background dei file del Lab", () => {
  it("i file caricati come ospite finiscono nell'elenco anche senza pannello montato, per scheda", async () => {
    const { uploader, store } = await freshModules();
    const foto = new File(["foto"], "piazza.jpg", { type: "image/jpeg" });
    const clip = new File(["clip"], "vigneto.mp4", { type: "video/mp4" });

    uploader.enqueueUploads("urban", [foto], null);
    uploader.enqueueUploads("vineyard", [clip], null);

    await vi.waitFor(() => {
      expect(store.getMedia("urban")).toHaveLength(1);
      expect(store.getMedia("vineyard")).toHaveLength(1);
    });
    expect(store.getMedia("urban")[0]!.name).toBe("piazza.jpg");
    expect(store.getMedia("urban")[0]!.kind).toBe("image");
    expect(store.getMedia("vineyard")[0]!.kind).toBe("video");
    // Ospite: il blob resta anche ricaricando la pagina.
    expect(data.size).toBe(2);
  });

  it("i file senza formato riconosciuto sono marcati in errore e non entrano nell'elenco", async () => {
    const { uploader, store } = await freshModules();
    const strano = new File(["x"], "appunto.txt", { type: "text/plain" });

    uploader.enqueueUploads("urban", [strano], null);

    await vi.waitFor(() => {
      expect(store.getMedia("urban")).toHaveLength(0);
      expect(uploader.getUploads("urban")[0]!.status).toBe("error");
    });
  });

  it("la coda si svuota da sola dopo il completamento", async () => {
    const { uploader, store } = await freshModules();
    const foto = new File(["foto"], "piazza.jpg", { type: "image/jpeg" });
    uploader.enqueueUploads("urban", [foto], null);

    await vi.waitFor(() => {
      expect(store.getMedia("urban")).toHaveLength(1);
      expect(uploader.getUploads("urban")[0]!.status).toBe("done");
    });
    await new Promise((r) => setTimeout(r, 1700));
    expect(uploader.getUploads("urban")).toEqual([]);
  });
});

describe("caricamento multiplo in parallelo", () => {
  it("invia più file insieme, al massimo 4 foto o 2 con video, senza percorsi duplicati", async () => {
    vi.resetModules();
    let active = 0;
    let peak = 0;
    const paths: string[] = [];
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        storage: {
          from: () => ({
            upload: async (path: string) => {
              paths.push(path);
              active++;
              peak = Math.max(peak, active);
              await new Promise((r) => setTimeout(r, 20));
              active--;
              return { error: null };
            },
            createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://x/${path}` } }),
          }),
        },
      },
    }));
    const uploader = await import("@/models/lab-media-uploader");
    const store = await import("@/models/lab-media-store");
    const photos = Array.from({ length: 8 }, (_, i) => new File(["x"], "foto.jpg", { type: "image/jpeg", lastModified: i }));
    uploader.enqueueUploads("urban", photos, "user-1");
    await vi.waitFor(() => expect(store.getMedia("urban").length).toBe(8));
    expect(peak).toBe(uploader.UPLOAD_PARALLEL);
    expect(new Set(paths).size).toBe(8);

    peak = 0;
    const mixed = [new File(["v"], "clip.mp4", { type: "video/mp4" }), ...photos.slice(0, 4)];
    uploader.enqueueUploads("vineyard", mixed, "user-1");
    await vi.waitFor(() => expect(store.getMedia("vineyard").length).toBe(5));
    expect(peak).toBe(uploader.UPLOAD_PARALLEL_WITH_VIDEO);
    vi.doUnmock("@/integrations/supabase/client");
  });
});

describe("senza rete con l'accesso", () => {
  it("una foto che non riesce a salire per la rete resta sul telefono, in elenco, invece di andare persa", async () => {
    vi.resetModules();
    data.clear();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: { storage: { from: () => ({ upload: async () => { throw new TypeError("Failed to fetch"); } }) } },
    }));
    const uploader = await import("@/models/lab-media-uploader");
    const store = await import("@/models/lab-media-store");
    uploader.enqueueUploads("urban", [new File(["x"], "foto.jpg", { type: "image/jpeg" })], "user-1");
    await vi.waitFor(() => expect(store.getMedia("urban").length).toBe(1));
    expect(store.getMedia("urban")[0]!.path).toBeUndefined();
    await vi.waitFor(() => expect([...data.keys()].some((k) => k.startsWith("urban:"))).toBe(true));
    expect(uploader.getUploads("urban").every((u) => u.status === "done")).toBe(true);
    vi.doUnmock("@/integrations/supabase/client");
  });
});

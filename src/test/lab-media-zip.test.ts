import { describe, expect, it } from "vitest";
import { ZIP_THRESHOLD, zipEntryNames } from "@/models/lab-media-sender";

describe("lab media zip", () => {
  it("raggruppa in ZIP con più di un file", () => {
    expect(ZIP_THRESHOLD).toBe(1);
  });
  it("nomi duplicati restano distinti", () => {
    expect(zipEntryNames(["a.jpg", "a.jpg"])).toEqual(["001-a.jpg", "002-a.jpg"]);
  });
});

describe("lab media share key", () => {
  it("cambia quando cambia l’elenco", async () => {
    const { shareKey } = await import("@/models/lab-media-sender");
    expect(shareKey([{ id: "a", url: "u1" }])).not.toBe(shareKey([{ id: "a", url: "u1" }, { id: "b", url: "u2" }]));
  });
});

describe("lab media secondo tocco su Condividi", () => {
  it("riusa la condivisione già pronta senza ripreparare", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const calls: ShareData[] = [];
    let first = true;
    const share = vi.fn((d: ShareData) => {
      calls.push(d);
      if (first) {
        first = false;
        return Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" }));
      }
      return Promise.resolve();
    });
    Object.assign(navigator, { share, canShare: () => true, userActivation: { isActive: false } });
    const s = await import("@/models/lab-media-sender");
    const f = new File(["a"], "a.jpg", { type: "image/jpeg" });
    await s.shareSelectedNow("urban", [f]);
    await vi.waitFor(() => expect(s.getShareProgress("urban")?.armed).toBe("all"));
    expect(s.retryArmedShare("urban", "all")).toBe(true);
    expect(share).toHaveBeenCalledTimes(2);
    expect(calls[1]).toBe(calls[0]);
  });
});

describe("lab media app Android installata", () => {
  it("riconosce la WebView dell’app ma non Chrome", async () => {
    const { isAndroidWebView } = await import("@/models/lab-media-sender");
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 15; Pixel; wv) AppleWebKit/537.36 Version/4.0 Chrome/130 Mobile")).toBe(true);
    expect(isAndroidWebView("Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")).toBe(false);
  });
  it("l’intent Condividi porta testo e link al selettore di sistema", async () => {
    const { androidShareIntent } = await import("@/models/lab-media-sender");
    const u = androidShareIntent("ZIP: https://x.y/a b", "Foto");
    expect(u.startsWith("intent:#Intent;action=android.intent.action.SEND;type=text/plain;")).toBe(true);
    expect(u).toContain("S.android.intent.extra.TEXT=ZIP%3A%20https%3A%2F%2Fx.y%2Fa%20b;");
    expect(u.endsWith(";end")).toBe(true);
  });
});

describe("lab media avviso di download", () => {
  it("avvisa che il download delle foto è in corso, poi conferma il salvataggio", async () => {
    const { vi } = await import("vitest");
    vi.resetModules();
    const loading = vi.fn();
    const success = vi.fn();
    vi.doMock("sonner", () => ({ toast: { loading, success } }));
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:foto"), revokeObjectURL: vi.fn() });
    const { downloadBlob } = await import("@/models/lab-media-sender");
    vi.useFakeTimers();
    downloadBlob(new File(["a"], "foto-1.jpg", { type: "image/jpeg" }), "foto-1.jpg");
    expect(loading).toHaveBeenCalledWith("Download foto in corso…", expect.objectContaining({ id: "lab-media-download" }));
    expect(success).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(success).toHaveBeenCalledWith("Foto salvata sul dispositivo", expect.objectContaining({ id: "lab-media-download" }));
    vi.useRealTimers();
  });

  it("distingue video e archivio ZIP da una foto", async () => {
    const { downloadNotice } = await import("@/models/lab-media-sender");
    expect(downloadNotice(new Blob(["x"], { type: "video/webm" }), "v.webm").running).toBe("Download video in corso…");
    expect(downloadNotice(new Blob(["x"], { type: "application/zip" }), "rilievo-piazza.zip").done).toBe("Archivio salvato sul dispositivo");
    expect(downloadNotice(new Blob(["x"], { type: "image/jpeg" }), "f.jpg").done).toBe("Foto salvata sul dispositivo");
  });
});

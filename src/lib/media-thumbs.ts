/**
 * Light thumbnails for the history's piles and rows: a photo of up to 12 megapixels (or a video) is made once into a
 * small JPEG (THUMB_PX on its long side) kept in memory for the session, so the Cronologia decodes small pictures
 * instead of whole photos — and plays no video — however many there are. Made two at a time, the scaling done by
 * createImageBitmap off the main thread; a failure falls back to the original (photos) or to nothing (videos).
 */
export const THUMB_PX = 360;
const done = new Map<string, string | null>();
const waiting = new Map<string, Promise<string | null>>();
const queue: Array<() => Promise<void>> = [];
let running = 0;
const PARALLEL = 2;

function pump() {
  while (running < PARALLEL && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => { running--; pump(); });
  }
}

const toJpeg = (canvas: HTMLCanvasElement) => new Promise<string | null>((resolve) =>
  canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), "image/jpeg", 0.8));

function fitCanvas(w: number, h: number) {
  const scale = Math.min(1, THUMB_PX / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * scale));
  c.height = Math.max(1, Math.round(h * scale));
  return c;
}

async function photoThumb(url: string): Promise<string | null> {
  const blob = await (await fetch(url)).blob();
  // Scaled while decoding (off the main thread in Chromium): only the small picture ever reaches the page.
  const probe = await createImageBitmap(blob, { resizeWidth: THUMB_PX, resizeQuality: "medium" });
  const tall = probe.height > probe.width;
  const bmp = tall ? (probe.close(), await createImageBitmap(blob, { resizeHeight: THUMB_PX, resizeQuality: "medium" })) : probe;
  const c = fitCanvas(bmp.width, bmp.height);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return toJpeg(c);
}

function videoThumb(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    let settled = false;
    const end = (out: string | null) => { if (settled) return; settled = true; window.clearTimeout(timer); v.removeAttribute("src"); v.load(); resolve(out); };
    const timer = window.setTimeout(() => end(null), 10_000);
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.crossOrigin = "anonymous";
    const draw = () => {
      try {
        const c = fitCanvas(v.videoWidth, v.videoHeight);
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        void toJpeg(c).then(end, () => end(null));
      } catch { end(null); }
    };
    // A seek to the same time fires no "seeked": a very short or unknown-length video draws its first frame at once.
    v.onloadeddata = () => { if ((v.duration || 0) > 0.2) v.currentTime = 0.1; else draw(); };
    v.onseeked = draw;
    v.onerror = () => end(null);
    v.src = url;
  });
}

/** The thumbnail of this photo or video (cached by id): a small object URL, the original photo if it cannot be made, null for a video without one. */
export function mediaThumb(id: string, url: string, kind: "image" | "video"): Promise<string | null> {
  if (done.has(id)) return Promise.resolve(done.get(id)!);
  const pending = waiting.get(id);
  if (pending) return pending;
  const p = new Promise<string | null>((resolve) => {
    queue.push(async () => {
      let out: string | null;
      // Never longer than 12 s: a slow file gives way (the original photo, or the video's dark tile) so the queue goes on.
      const late = new Promise<"late">((r) => window.setTimeout(() => r("late"), 12_000));
      try {
        const made = await Promise.race([kind === "video" ? videoThumb(url) : photoThumb(url), late]);
        out = made === "late" ? (kind === "video" ? null : url) : made;
      } catch { out = kind === "video" ? null : url; }
      done.set(id, out);
      waiting.delete(id);
      resolve(out);
    });
    pump();
  });
  waiting.set(id, p);
  return p;
}

/** A thumbnail already made, at once (so a pile drawn again never flashes its loading ring). */
export const readyThumb = (id: string): string | null | undefined => done.get(id);

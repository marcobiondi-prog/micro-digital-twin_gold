/**
 * A few seconds of the live camera, muted, recorded while a scan runs: the "mini video" of the scanned
 * plant shown in Esito. Uses the raw camera track (the preview canvas is frozen during the scan) and a low
 * bitrate (~200 kB). Resolves to an object URL, or null where MediaRecorder is missing or fails.
 */
export const SCAN_CLIP_MS = 2500;

export function recordScanClip(stream: MediaStream | null, ms = SCAN_CLIP_MS): Promise<string | null> {
  const track = stream?.getVideoTracks().find((t) => t.readyState === "live");
  if (!track || typeof MediaRecorder === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const type = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
      const rec = new MediaRecorder(new MediaStream([track]), { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 700_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = () => resolve(null);
      rec.onstop = () => resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || type || "video/webm" })) : null);
      rec.start();
      window.setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, ms);
    } catch {
      resolve(null);
    }
  });
}

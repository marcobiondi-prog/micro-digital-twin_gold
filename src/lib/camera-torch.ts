type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
export function supportsCameraTorch(track: MediaStreamTrack | undefined) {
  try { return !!track && (track.getCapabilities() as TorchCapabilities).torch === true; }
  catch { return false; }
}
type PhotoCaps = { fillLightMode?: string[] };
type ImageCaptureLike = { getPhotoCapabilities(): Promise<PhotoCaps> };
// Some phones (Chrome on Android) list the torch only once the video is running, or only through
// ImageCapture's photo capabilities: ask a few times before saying there is none.
export async function probeCameraTorch(track: MediaStreamTrack | undefined, tries = 8, waitMs = 300) {
  if (!track) return false;
  for (let i = 0; i < tries; i++) {
    if (track.readyState === "ended") return false;
    if (supportsCameraTorch(track)) return true;
    const IC = (globalThis as { ImageCapture?: new (t: MediaStreamTrack) => ImageCaptureLike }).ImageCapture;
    if (IC) {
      try {
        const caps = await new IC(track).getPhotoCapabilities();
        if (caps.fillLightMode?.some((m) => m === "flash" || m === "torch")) return true;
      } catch { /* not ready yet */ }
    }
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return false;
}
// force: try even when the capabilities do not list the torch (found through ImageCapture).
export async function setCameraTorch(track: MediaStreamTrack | undefined, enabled: boolean, force = false) {
  if (!track || track.readyState === "ended" || (!force && !supportsCameraTorch(track))) return false;
  try {
    await track.applyConstraints({ advanced: [{ torch: enabled } as MediaTrackConstraintSet] });
    return true;
  } catch {
    try { await track.applyConstraints({ torch: enabled } as MediaTrackConstraints); return true; }
    catch { return false; }
  }
}

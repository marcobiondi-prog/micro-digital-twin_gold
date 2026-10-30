import { useEffect, useRef, useState } from "react";
import { Images, Lock, MapPin, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CameraCaptureControl } from "@/views/CameraCaptureControl";
import { CameraCloseGestures } from "@/views/CameraCloseGestures";
import { playCameraSound } from "@/lib/camera-sounds";
import { hapticTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import aiLogo from "@/assets/ai-logo.png";

export type QuickMode = "video" | "photo" | "ai" | "gallery";
const MODES: Array<[QuickMode, string]> = [["video", "Video"], ["photo", "Foto"], ["ai", "AI"], ["gallery", "Galleria"]];

/**
 * The camera of the central button for an identified user: it opens straight on the live camera, like a phone's own,
 * with the project's place on top and the modes in a row to swipe or tap (Video · Foto · AI · Galleria). Foto and
 * Video shoot here and hand each file to the project's photos (onFile) without closing, the last one shown as a
 * thumbnail that opens them; AI and Galleria offer one big button that opens the AI camera or the phone's gallery.
 */
export function QuickCamera({ open, place, aiReady, signedIn, lastShot, onFile, onAi, onGallery, onLogin, onShowShots, onClose }: {
  open: boolean; place: string; aiReady: boolean; signedIn: boolean;
  /** The project's latest photo or video, for the thumbnail. */
  lastShot: { url: string; video: boolean } | null;
  onFile: (file: File) => void; onAi: () => void; onGallery: () => void; onLogin: () => void; onShowShots: () => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<QuickMode>("photo");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(0);
  const [local, setLocal] = useState<{ url: string; video: boolean } | null>(null);
  // Video asks for the microphone too: the stream restarts when going in or out of it.
  const wantsAudio = mode === "video";

  useEffect(() => { if (open) setMode("photo"); }, [open]);
  useEffect(() => () => { if (local) URL.revokeObjectURL(local.url); }, [local]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false); setError("");
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: wantsAudio });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch (cause) {
        if (cancelled) return;
        const name = cause instanceof DOMException ? cause.name : "";
        setError(name === "NotAllowedError" ? "Consenti l’accesso alla fotocamera nelle impostazioni del telefono o del browser." : "Fotocamera non disponibile su questo dispositivo.");
      }
    })();
    return () => {
      cancelled = true;
      const r = recorderRef.current;
      if (r && r.state !== "inactive") r.stop();
      recorderRef.current = null;
      setRecording(false);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, wantsAudio]);

  const keep = (file: File, video: boolean) => {
    onFile(file);
    setLocal({ url: URL.createObjectURL(file), video });
  };

  const shoot = () => {
    const video = videoRef.current, stream = streamRef.current;
    if (!ready || !video || !stream) return;
    if (mode === "photo") {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const g = canvas.getContext("2d");
      if (!g || !canvas.width) return;
      g.drawImage(video, 0, 0);
      playCameraSound("shutter");
      setFlash((n) => n + 1);
      canvas.toBlob((blob) => { if (blob) keep(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }), false); }, "image/jpeg", 0.92);
      return;
    }
    if (recording) { recorderRef.current?.stop(); playCameraSound("video-stop"); setRecording(false); return; }
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("unavailable");
      const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        if (!chunks.length) return;
        const type = recorder.mimeType || "video/webm";
        keep(new File(chunks, `video-${Date.now()}.${type.includes("mp4") ? "mp4" : "webm"}`, { type }), true);
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      playCameraSound("video-start");
      setRecording(true);
    } catch { setError("Questo browser non registra video: aggiornalo e riprova."); }
  };

  const choose = (m: QuickMode) => { if (m === mode || recording) return; hapticTick(); setMode(m); };
  const step = (dir: 1 | -1) => { const i = MODES.findIndex(([m]) => m === mode); const next = MODES[i + dir]; if (next) choose(next[0]); };
  // A sideways swipe on the preview turns the mode, like a phone's camera.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const thumb = local ?? lastShot;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }} modal>
      <DialogContent data-no-ui-click aria-describedby={undefined}
        className="camera-hud inset-0 left-0 top-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-camera-surface p-0 text-camera-ink shadow-none duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-h-none sm:overflow-hidden sm:rounded-none [&>button]:hidden">
        <DialogTitle className="sr-only">Fotocamera</DialogTitle>
        <CameraCloseGestures onClose={onClose}>
          <div className="absolute inset-0"
            onTouchStart={(e) => { const t = e.touches[0]; swipe.current = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }}
            onTouchEnd={(e) => { const s = swipe.current, t = e.changedTouches[0]; swipe.current = null; if (!s || !t) return; const dx = t.clientX - s.x, dy = t.clientY - s.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1); }}>
            <video ref={videoRef} autoPlay muted playsInline className={cn("h-full w-full object-cover transition-[filter] duration-300", (mode === "ai" || mode === "gallery") && "blur-sm brightness-50")} />
            {!ready && !error && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground" role="status">Apertura fotocamera…</p>}
            {flash > 0 && <span key={flash} className="pointer-events-none absolute inset-0 animate-out fade-out-0 bg-white duration-300 fill-mode-forwards motion-reduce:hidden" aria-hidden="true" />}
          </div>
        </CameraCloseGestures>
        <div className="camera-topbar">
          <button type="button" onClick={onClose} aria-label="Chiudi fotocamera" className="camera-tool grid size-11 place-items-center"><X className="size-5" aria-hidden="true" /></button>
          {place && <span className="camera-title max-w-[70%] rounded-full"><MapPin className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{place}</span></span>}
        </div>
        {error && <p role="alert" className="absolute inset-x-6 top-24 mx-auto max-w-lg rounded-xl bg-background/90 p-4 text-center text-sm">{error}</p>}
        {(mode === "ai" || mode === "gallery") && (
          <div className="absolute inset-x-6 top-1/2 mx-auto flex max-w-sm -translate-y-1/2 flex-col items-center gap-3 text-center">
            {mode === "ai" ? (
              <>
                <span className="relative grid size-20 place-items-center rounded-full border-[3px] border-brand-turquoise bg-black/50 shadow-[0_0_28px_color-mix(in_oklch,var(--brand-turquoise)_50%,transparent)]">
                  <img src={aiLogo} alt="" aria-hidden="true" className="size-10" />
                  {!aiReady && <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-white text-black"><Lock className="size-4" aria-hidden="true" /></span>}
                </span>
                <p className="text-lg font-bold">Fotocamera AI</p>
                <p className="text-sm text-white/75">{aiReady ? "Inquadra una pianta: la riconosce e calcola il fresco." : signedIn ? "Disponibile nell’app installata sul telefono." : "Accedi per riconoscere le piante e calcolarne il fresco."}</p>
                {aiReady ? <button type="button" onClick={onAi} className="mt-1 h-12 rounded-full bg-white px-6 text-sm font-bold text-black">Apri la fotocamera AI</button>
                  : !signedIn && <button type="button" onClick={onLogin} className="mt-1 h-12 rounded-full bg-white px-6 text-sm font-bold text-black">Accedi per usarla</button>}
              </>
            ) : (
              <>
                <span className="grid size-20 place-items-center rounded-full bg-ok text-white"><Images className="size-9" aria-hidden="true" /></span>
                <p className="text-lg font-bold">Galleria</p>
                <p className="text-sm text-white/75">Aggiungi foto e video già sul telefono.</p>
                <button type="button" onClick={onGallery} className="mt-1 h-12 rounded-full bg-white px-6 text-sm font-bold text-black">Apri la galleria</button>
              </>
            )}
          </div>
        )}
        <div className="camera-bottom">
          <div role="radiogroup" aria-label="Modalità" className="mb-3 flex justify-center gap-5 text-[13px] font-bold uppercase tracking-[0.06em] [text-shadow:0_1px_4px_rgb(0_0_0/0.8)]">
            {MODES.map(([m, label]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => choose(m)} disabled={recording && m !== mode}
                className={cn("rounded-full px-1 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white", mode === m ? "text-[#ffd54a]" : "text-white/75")}>{label}</button>
            ))}
          </div>
          {mode === "photo" || mode === "video" ? (
            <CameraCaptureControl mode={mode} recording={recording} disabled={!ready || !!error} onCapture={shoot}
              left={<button type="button" onClick={onShowShots} disabled={!thumb} aria-label="Vedi foto e video del progetto"
                className="size-12 overflow-hidden rounded-xl border-2 border-white bg-white/10 disabled:opacity-40">
                {thumb && (thumb.video ? <video src={thumb.url} muted playsInline className="h-full w-full object-cover" /> : <img src={thumb.url} alt="" className="h-full w-full object-cover" />)}
              </button>} />
          ) : <div className="h-[136px]" aria-hidden="true" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

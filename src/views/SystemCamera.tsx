import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { releaseSystemCamera } from "@/lib/system-camera";
import { CameraCloseGestures } from "@/views/CameraCloseGestures";
import { CameraCenterCapture } from "@/views/CameraCenterCapture";
import { CameraCaptureControl } from "@/views/CameraCaptureControl";
import { playCameraSound } from "@/lib/camera-sounds";
import { hapticTick } from "@/lib/haptics";

/**
 * Live capture for hosts without native HTML capture, such as Windows tablets, and for the multiple shot ("burst"):
 * the camera stays open, every tap on the shutter keeps one more photo, and "Fine" (or closing) adds them all at once.
 */
export function SystemCamera({ mode, onCapture, onClose: close }: {
  mode: "photo" | "video" | "burst" | null;
  onCapture: (files: File[]) => void;
  onClose: () => void;
}) {
  // Each shot of the multiple shot: the frame grabbed at the tap at once, swapped for the camera's full-resolution
  // photo when that arrives (sharp = true).
  type Shot = { id: number; file: File; url: string; sharp: boolean };
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const [flash, setFlash] = useState(0);
  const [pending, setPending] = useState(0);
  const [asking, setAsking] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const finish = useCallback((keep: boolean) => {
    const taken = shotsRef.current;
    if (taken.length && keep) onCapture(taken.map((s) => s.file));
    taken.forEach((s) => URL.revokeObjectURL(s.url));
    shotsRef.current = [];
    setShots([]);
    setAsking(false);
    close();
  }, [close, onCapture]);
  // Closing a multiple shot by Back or a swipe keeps what was taken: nothing shot is ever lost.
  const onClose = useCallback(() => finish(true), [finish]);
  const dropShot = (id: number) => setShots((p) => { const gone = p.find((s) => s.id === id); if (gone) URL.revokeObjectURL(gone.url); return p.filter((s) => s.id !== id); });
  useEffect(() => { const el = stripRef.current; if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" }); }, [shots.length]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const activeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mode) return;
    let wasFullscreen = Boolean(document.fullscreenElement);
    const changed = () => {
      const fullscreen = Boolean(document.fullscreenElement);
      if (wasFullscreen && !fullscreen) onClose();
      wasFullscreen = fullscreen;
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [mode, onClose]);

  useEffect(() => {
    if (!mode) releaseSystemCamera();
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    activeRef.current = true;
    setError("");
    setReady(false);
    setRecording(false);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
        // Photos ask for the camera's sharpest stream (the phone gives the closest it has).
        const stream = await navigator.mediaDevices.getUserMedia({
          video: mode === "video" ? { facingMode: { ideal: "environment" } } : { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } },
          audio: mode === "video",
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setReady(true);
      } catch (cause) {
        if (cancelled) return;
        const name = cause instanceof DOMException ? cause.name : "";
        setError(name === "NotAllowedError"
          ? "Consenti l’accesso alla fotocamera nelle impostazioni del dispositivo o del browser."
          : "Fotocamera non disponibile. Apri l’app nel browser e riprova.");
      }
    }
    void start();
    return () => {
      cancelled = true;
      activeRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [mode]);

  function capture() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!ready || !video || !stream) return;
    if (mode === "photo" || mode === "burst") {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) return;
      context.drawImage(video, 0, 0);
      playCameraSound("shutter");
      if (mode === "burst") {
        setFlash((n) => n + 1);
        hapticTick(30);
        const id = Date.now();
        const track = stream.getVideoTracks()[0];
        setPending((n) => n + 1);
        canvas.toBlob((blob) => {
          if (!blob || !activeRef.current) { setPending((n) => n - 1); return; }
          const file = new File([blob], `foto-${id}.jpg`, { type: "image/jpeg" });
          setShots((p) => [...p, { id, file, url: URL.createObjectURL(file), sharp: false }]);
          // The camera's own photo, at full resolution where the phone offers it (Chrome on Android), replaces the frame.
          const Capture = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
          const done = () => setPending((n) => n - 1);
          if (!Capture || !track) { done(); return; }
          Promise.race([new Capture(track).takePhoto(), new Promise<never>((_, no) => window.setTimeout(() => no(new Error("slow")), 4000))])
            .then((photo) => {
              if (!activeRef.current || photo.size <= blob.size) return;
              const sharp = new File([photo], `foto-${id}.jpg`, { type: photo.type || "image/jpeg" });
              setShots((p) => p.map((s) => (s.id === id ? (URL.revokeObjectURL(s.url), { id, file: sharp, url: URL.createObjectURL(sharp), sharp: true }) : s)));
            })
            .catch(() => undefined)
            .finally(done);
        }, "image/jpeg", 0.92);
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob || !activeRef.current) return;
        onCapture([new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" })]);
        onClose();
      }, "image/jpeg", 0.92);
      return;
    }
    if (recording) {
      recorderRef.current?.stop();
      playCameraSound("video-stop");
      setRecording(false);
      setReady(false);
      return;
    }
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("unavailable");
      const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (!activeRef.current || !chunks.length) return;
        const type = recorder.mimeType || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        onCapture([new File(chunks, `video-${Date.now()}.${extension}`, { type })]);
        onClose();
      };
      recorder.onerror = () => { setError("Registrazione non riuscita. Riprova."); setRecording(false); };
      recorderRef.current = recorder;
      recorder.start(1000);
      playCameraSound("video-start");
      setRecording(true);
    } catch {
      setError("Questo browser non supporta la registrazione video. Usa un browser aggiornato.");
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) onClose(); }} modal>
      <DialogContent data-no-ui-click className="camera-hud inset-0 left-0 top-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-camera-surface p-0 text-camera-ink shadow-none duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-h-none sm:overflow-hidden sm:rounded-none [&>button]:hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{mode === "video" ? "Registra video" : mode === "burst" ? "Scatto multiplo" : "Scatta foto"}</DialogTitle>
        <CameraCloseGestures onClose={onClose}>
        <div className="absolute inset-0">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
          {!ready && !error && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground" role="status">Apertura fotocamera…</p>}
        </div>
        {error && <p role="alert" className="absolute inset-x-6 top-20 mx-auto max-w-lg rounded-md bg-background/90 p-4 text-center text-sm text-destructive">{error}</p>}
        {/* A short white flash says each shot of the multiple shot was taken. */}
        {flash > 0 && <div key={flash} className="burst-flash pointer-events-none absolute inset-0 bg-white" aria-hidden="true" />}
        <CameraCenterCapture onCapture={capture} disabled={!ready || !!error} label={mode === "video" ? (recording ? "Termina e salva" : "Avvia registrazione") : "Scatta foto"} />
        <div className="camera-topbar">
          <span className="camera-title"><Camera className="size-4" /> {mode === "burst" ? "Scatto multiplo" : "Fotocamera"}</span>
          <span className="ml-auto flex items-center gap-2">
            {mode === "burst" && shots.length > 0 && (
              <button type="button" onClick={() => finish(true)} disabled={pending > 0} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-80">
                {pending > 0 ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />} Fine · {shots.length} foto
              </button>
            )}
            <Button variant="ghost" size="icon" onClick={() => (mode === "burst" && shots.length ? setAsking(true) : onClose())} aria-label="Chiudi fotocamera" title="Chiudi fotocamera" className="camera-tool"><X /></Button>
          </span>
        </div>
        {asking && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-black/60 p-6 backdrop-blur-sm" role="alertdialog" aria-labelledby="burst-ask">
            <div className="w-full max-w-xs rounded-3xl bg-[oklch(0.25_0.016_258)] p-5 text-white shadow-2xl ring-1 ring-white/15">
              <p id="burst-ask" className="text-lg font-semibold">Hai scattato {shots.length} foto</p>
              <p className="mt-1 text-sm text-white/70">Le aggiungo alla simulazione o le scarto?</p>
              <div className="mt-4 grid gap-2">
                <button type="button" onClick={() => finish(true)} className="h-11 rounded-full bg-white font-semibold text-black">Aggiungi {shots.length}</button>
                <button type="button" onClick={() => setAsking(false)} className="h-11 rounded-full bg-white/10 font-semibold">Continua a scattare</button>
                <button type="button" onClick={() => finish(false)} className="h-11 rounded-full font-semibold text-red-400">Scarta tutte</button>
              </div>
            </div>
          </div>
        )}
        <div className="camera-bottom">
          {mode === "burst" && (
            <p className="mb-2 text-center text-xs text-white/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]" role="status" aria-live="polite">
              {shots.length ? `${shots.length} ${shots.length === 1 ? "foto scattata" : "foto scattate"} · il cestino ne toglie una` : "Scatta quante foto vuoi, poi tocca Fine"}
            </p>
          )}
          {mode === "burst" && shots.length > 0 && (
            <div ref={stripRef} data-map-gestures className="mx-auto mb-3 flex max-w-md touch-pan-x snap-x gap-2 overflow-x-auto px-1 pt-2 [scrollbar-width:none]">
              {shots.map((s, i) => (
                <span key={s.id} className="relative shrink-0 snap-end">
                  <img src={s.url} alt={`Foto ${i + 1}`} className="size-14 rounded-lg object-cover ring-1 ring-white/50" />
                  <span className="absolute bottom-0.5 left-1 text-[10px] font-semibold text-white [text-shadow:0_1px_2px_black]">{i + 1}</span>
                  <button type="button" onClick={() => dropShot(s.id)} aria-label={`Togli la foto ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/40"><Trash2 className="size-3" aria-hidden="true" /></button>
                </span>
              ))}
            </div>
          )}
          <CameraCaptureControl mode={mode === "video" ? "video" : "photo"} recording={recording} disabled={!ready || !!error} onCapture={capture} />
        </div>
        </CameraCloseGestures>
      </DialogContent>
    </Dialog>
  );
}
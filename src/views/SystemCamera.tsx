import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { releaseSystemCamera } from "@/lib/system-camera";
import { CameraCloseGestures } from "@/views/CameraCloseGestures";
import { CameraCenterCapture } from "@/views/CameraCenterCapture";
import { CameraCaptureControl } from "@/views/CameraCaptureControl";
import { playCameraSound } from "@/lib/camera-sounds";

/**
 * Live capture for hosts without native HTML capture, such as Windows tablets, and for the multiple shot ("burst"):
 * the camera stays open, every tap on the shutter keeps one more photo, and "Fine" (or closing) adds them all at once.
 */
export function SystemCamera({ mode, onCapture, onClose: close }: {
  mode: "photo" | "video" | "burst" | null;
  onCapture: (files: File[]) => void;
  onClose: () => void;
}) {
  const [shots, setShots] = useState<{ file: File; url: string }[]>([]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const [flash, setFlash] = useState(0);
  // Closing a multiple shot keeps what was taken: nothing shot is ever lost.
  const onClose = useCallback(() => {
    const taken = shotsRef.current;
    if (taken.length) { onCapture(taken.map((s) => s.file)); taken.forEach((s) => URL.revokeObjectURL(s.url)); shotsRef.current = []; setShots([]); }
    close();
  }, [close, onCapture]);
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } }, audio: mode === "video",
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
      canvas.toBlob((blob) => {
        if (!blob || !activeRef.current) return;
        const file = new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (mode === "burst") { setShots((p) => [...p, { file, url: URL.createObjectURL(file) }]); setFlash((n) => n + 1); return; }
        onCapture([file]);
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
          {mode === "burst" && shots.length > 0 ? (
            <button type="button" onClick={onClose} className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black">
              <Check className="size-4" aria-hidden="true" /> Fine · {shots.length} foto
            </button>
          ) : (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Chiudi fotocamera" title="Chiudi fotocamera" className="camera-tool"><X /></Button>
          )}
        </div>
        <div className="camera-bottom">
          {mode === "burst" && (
            <p className="mb-2 text-center text-xs text-white/80" role="status" aria-live="polite">
              {shots.length ? `${shots.length} ${shots.length === 1 ? "foto scattata" : "foto scattate"} · continua a scattare` : "Scatta quante foto vuoi, poi tocca Fine"}
            </p>
          )}
          {mode === "burst" && shots.length > 0 && (
            <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
              {shots.slice(-5).map((s) => <img key={s.url} src={s.url} alt="" className="size-11 rounded-md object-cover ring-1 ring-white/40" />)}
            </div>
          )}
          <CameraCaptureControl mode={mode === "video" ? "video" : "photo"} recording={recording} disabled={!ready || !!error} onCapture={capture} />
        </div>
        </CameraCloseGestures>
      </DialogContent>
    </Dialog>
  );
}
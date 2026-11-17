import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, Zap, ZapOff } from "lucide-react";
import { probeCameraTorch, setCameraTorch, supportsCameraTorch } from "@/lib/camera-torch";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { releaseSystemCamera } from "@/lib/system-camera";
import { CameraCloseGestures } from "@/views/CameraCloseGestures";
import { CameraCenterCapture } from "@/views/CameraCenterCapture";
import { CameraCaptureControl } from "@/views/CameraCaptureControl";
import { playCameraSound } from "@/lib/camera-sounds";
import { hapticTick } from "@/lib/haptics";
import { useHoldBurst } from "@/lib/hold-burst";
import { createTrackZoomer, pinchZoom, splitZoom, trackZoomRange, zoomHaptic, ZOOM_MAX, ZOOM_MIN } from "@/lib/camera-zoom";
import { ZoomDial } from "@/views/ZoomDial";
import { BurstReviewSheet, BurstThumb } from "@/views/BurstReview";

/**
 * Live capture for hosts without native HTML capture, such as Windows tablets, and for the multiple shot:
 * a tap takes one photo; holding the shutter shoots a series until the finger lifts (the camera stays open). The series
 * shows as a thumbnail beside the shutter; a tap on it opens the same review sheet as the AI camera (a tap sets a photo
 * aside, "Aggiungi n" hands the rest over). Closing the camera, or taking a single photo, hands the kept ones over too.
 */
export function SystemCamera({ mode, onCapture, onClose: close }: {
  mode: "photo" | "video" | "burst" | null;
  onCapture: (files: File[]) => void;
  onClose: () => void;
}) {
  // Each shot of the multiple shot: the frame grabbed at the tap, its JPEG encoded off the main thread.
  type Shot = { id: number; file: Promise<File | null>; thumb: string };
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  // Review sheet of the series: shots tapped there are set aside and left out when the rest is added.
  const [reviewing, setReviewing] = useState(false);
  const [discarded, setDiscarded] = useState<Set<number>>(() => new Set());
  const discardedRef = useRef(discarded);
  discardedRef.current = discarded;
  const [flash, setFlash] = useState(0);
  const [pending, setPending] = useState(0);
  // mode "burst" (asked by name) keeps every tap in the series; otherwise only a held shutter does.
  const burstMode = mode === "burst";

  /** Hands the kept shots over (waiting for those still encoding: nothing shot is lost) and empties the series. */
  const handOver = useCallback(() => {
    const kept = shotsRef.current.filter((s) => !discardedRef.current.has(s.id));
    if (kept.length) {
      void Promise.all(kept.map((s) => s.file)).then((files) => {
        const ready = files.filter((f): f is File => !!f);
        if (ready.length) onCapture(ready);
      });
    }
    shotsRef.current = [];
    setShots([]);
    setDiscarded(new Set());
    setReviewing(false);
  }, [onCapture]);
  // Closing the camera by ✕, Back or a swipe keeps the series: nothing shot is ever lost.
  const onClose = useCallback(() => { handOver(); close(); }, [handOver, close]);
  const discardAll = () => {
    shotsRef.current = [];
    setShots([]);
    setDiscarded(new Set());
    setReviewing(false);
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const activeRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  // Flash: the camera's own light (torch) where the phone offers it, never a simulated one; it goes off with the camera.
  const [torch, setTorch] = useState<"none" | "off" | "on">("none");
  const torchOnRef = useRef(false);
  torchOnRef.current = torch === "on";
  const torchTimer = useRef<number | undefined>(undefined);
  const [torchNote, setTorchNote] = useState("");
  const toggleTorch = async () => {
    const next = torch !== "on";
    const ok = await setCameraTorch(streamRef.current?.getVideoTracks()[0], next, true);
    if (ok) { setTorch(next ? "on" : "off"); setTorchNote(""); }
    else setTorchNote("Impossibile accendere il flash su questo telefono.");
  };  // Zoom like the AI camera: pinch on the preview or the lens chips 1·2·3·5; the camera's own (hardware) zoom first,
  // the rest a centred digital crop shown on the preview and kept in the photos. Videos zoom only in hardware (a crop
  // would not reach the recording), so without it they have no zoom.
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const digitalRef = useRef(1);
  const [digital, setDigital] = useState(1);
  const zoomRangeRef = useRef<ReturnType<typeof trackZoomRange>>(null);
  const zoomerRef = useRef<((value: number) => void) | null>(null);
  const pinchFrom = useRef(1);
  const [canZoom, setCanZoom] = useState(false);

  const setZoom = (value: number) => {
    const range = zoomRangeRef.current;
    const max = mode === "video" ? (range ? range.max / range.min : 1) : ZOOM_MAX;
    const next = Math.min(max, Math.max(ZOOM_MIN, Math.round(value * 10) / 10));
    const { hardware, digital: rest } = splitZoom(next, range);
    if (hardware !== null) {
      zoomerRef.current?.(hardware);
      // Some phones drop the torch when the zoom constraint is applied: turn it back on once the zoom settles.
      if (torchOnRef.current) { window.clearTimeout(torchTimer.current); torchTimer.current = window.setTimeout(() => void setCameraTorch(streamRef.current?.getVideoTracks()[0], true, true), 350); }
    }
    const d = mode === "video" ? 1 : rest;
    digitalRef.current = d;
    setDigital(d);
    const haptic = zoomHaptic(zoomRef.current, next);
    if (haptic) hapticTick([...haptic]);
    zoomRef.current = next;
    setZoomState(next);
  };
  const onPinch = (ratio: number, start: boolean) => {
    if (start) pinchFrom.current = zoomRef.current;
    else setZoom(pinchZoom(pinchFrom.current, 1, ratio));
  };

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
    // While the camera is open the page behind it stops drawing (no paint, animations paused): nothing competes with
    // the camera for the phone's power.
    if (mode) document.documentElement.setAttribute("data-sys-camera", "");
    else document.documentElement.removeAttribute("data-sys-camera");
    return () => document.documentElement.removeAttribute("data-sys-camera");
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
          // A light live stream (about 2,8 MP at most 30 fps): a 12 MP preview kept phones busy and warm. A single photo is
          // still the camera's own full-resolution picture (takePhoto); the multiple shot keeps the stream's frames.
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 }, frameRate: { ideal: 30, max: 30 } },
          audio: mode === "video",
        });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        zoomRangeRef.current = trackZoomRange(track);
        zoomerRef.current = zoomRangeRef.current ? createTrackZoomer(track) : null;
        zoomRef.current = 1; digitalRef.current = 1; setZoomState(1); setDigital(1);
        setCanZoom(mode !== "video" || !!zoomRangeRef.current);
        setTorch(supportsCameraTorch(track) ? "off" : "none"); setTorchNote("");
        if (!supportsCameraTorch(track)) void probeCameraTorch(track).then((ok) => { if (!cancelled && ok) setTorch((t) => (t === "none" ? "off" : t)); });
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

  const { holding, onHold } = useHoldBurst(() => capture());
  function capture() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!ready || !video || !stream) return;
    if (mode === "photo" || mode === "burst") {
      // The digital part of the zoom is a centred crop of the frame, as the preview shows it.
      const d = digitalRef.current;
      const sw = Math.round(video.videoWidth / d), sh = Math.round(video.videoHeight / d);
      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) return;
      playCameraSound("shutter");
      context.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, sw, sh);
      if (burstMode || holding.current) {
        // The multiple shot answers at once: flash, sound and tick first, its thumbnail beside the shutter right away,
        // while the full frame encodes off the main thread. No full-resolution photo per shot: on phones it pauses
        // the preview each time and made the shots lag.
        setFlash((n) => n + 1);
        hapticTick(30);
        const id = Date.now() + Math.random();
        const thumbCanvas = document.createElement("canvas");
        const scale = 160 / Math.max(canvas.width, canvas.height);
        thumbCanvas.width = Math.round(canvas.width * scale);
        thumbCanvas.height = Math.round(canvas.height * scale);
        thumbCanvas.getContext("2d")?.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumb = thumbCanvas.toDataURL("image/jpeg", 0.7);
        setPending((n) => n + 1);
        const file = new Promise<File | null>((resolve) => canvas.toBlob((blob) => {
          setPending((n) => n - 1);
          resolve(blob ? new File([blob], `multiplo-${Math.floor(id)}.jpg`, { type: "image/jpeg" }) : null);
        }, "image/jpeg", 0.9));
        setShots((p) => [...p, { id, file, thumb }]);
        return;
      }
      // A single photo: the camera's own full-resolution photo where the phone offers it, else the frame.
      const track = stream.getVideoTracks()[0];
      const Capture = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
      setPending((n) => n + 1);
      canvas.toBlob((blob) => {
        const save = (photo: Blob | null) => {
          setPending((n) => n - 1);
          const best = photo && (!blob || photo.size > blob.size) ? photo : blob;
          if (!best || !activeRef.current) return;
          onCapture([new File([best], `foto-${Date.now()}.jpg`, { type: best.type || "image/jpeg" })]);
          onClose();
        };
        // A digital zoom is not in the camera's own photo: the cropped frame is kept then.
        if (!Capture || !track || digitalRef.current > 1.01) { save(null); return; }
        Promise.race([new Capture(track).takePhoto(), new Promise<never>((_, no) => window.setTimeout(() => no(new Error("slow")), 4000))])
          .then(save, () => save(null));
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

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);


  return (
    <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) onClose(); }} modal>
      <DialogContent
        ref={surfaceRef}
        data-landscape={landscape}
        data-no-ui-click
        data-sys-camera-root
        className="camera-hud inset-0 left-0 top-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-camera-surface p-0 text-camera-ink shadow-none duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-h-none sm:overflow-hidden sm:rounded-none [&>button]:hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{mode === "video" ? "Registra video" : burstMode ? "Scatto multiplo" : "Scatta foto"}</DialogTitle>
        <CameraCloseGestures onClose={onClose} onPinch={canZoom ? onPinch : undefined}>
        <div className="absolute inset-0">
          <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" style={digital > 1 ? { transform: `scale(${digital})` } : undefined} />
          {!ready && !error && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground" role="status">Apertura fotocamera…</p>}
        </div>
        {error && <p role="alert" className="absolute inset-x-6 top-20 mx-auto max-w-lg rounded-md bg-background/90 p-4 text-center text-sm text-destructive">{error}</p>}
        {/* A short white flash says each shot of the multiple shot was taken. */}
        {flash > 0 && <div key={flash} className="burst-flash pointer-events-none absolute inset-0 bg-white" aria-hidden="true" />}
        <CameraCenterCapture onCapture={capture} disabled={!ready || !!error} label={mode === "video" ? (recording ? "Termina e salva" : "Avvia registrazione") : "Scatta foto"} />
        <div className="camera-topbar">
          <span className="camera-title"><Camera className="size-4" /> {burstMode ? "Scatto multiplo" : "Fotocamera"}</span>
          <span className="ml-auto flex items-center gap-2">
            {/* The same flash button as the AI camera's: a round glass tool, lit like a pressed tool while on. */}
            {torch !== "none" && <Button variant="ghost" size="icon" className="camera-tool size-11 aria-pressed:border-camera-ink aria-pressed:bg-camera-surface" aria-pressed={torch === "on"} aria-label={torch === "on" ? "Disattiva flash" : "Attiva flash"} title={torch === "on" ? "Disattiva flash" : "Attiva flash"} onClick={() => void toggleTorch()}>{torch === "on" ? <Zap className="size-4" /> : <ZapOff className="size-4" />}</Button>}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Chiudi fotocamera" title="Chiudi fotocamera" className="camera-tool size-11"><X className="size-4" /></Button>
          </span>
        </div>
        {torchNote && <p role="status" className="absolute inset-x-6 top-20 z-10 mx-auto max-w-sm rounded-full bg-black/70 px-4 py-2 text-center text-sm text-white">{torchNote}</p>}
        {reviewing && shots.length > 0 && (
          <BurstReviewSheet shots={shots} discarded={discarded} onClose={() => setReviewing(false)} onAdd={handOver} onDiscardAll={discardAll}
            onToggleShot={(id) => setDiscarded((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
        )}
        <div className={`camera-bottom absolute z-20 flex flex-col items-center ${landscape ? "gap-1.5" : "gap-2"}`}>
          <span className="sr-only" role="status" aria-live="polite">{shots.length ? `${shots.length} foto nel multiplo` : ""}</span>
          {canZoom && ready && (
            <ZoomDial
              zoom={zoom}
              max={mode === "video" && zoomRangeRef.current ? zoomRangeRef.current.max / zoomRangeRef.current.min : ZOOM_MAX}
              onZoom={setZoom}
            />
          )}
          <CameraCaptureControl mode={mode === "video" ? "video" : "photo"} recording={recording} disabled={!ready || !!error || (!burstMode && !shots.length && pending > 0)} onCapture={capture}
            {...(mode !== "video" ? { onHold } : {})}
            left={mode !== "video" && shots.length > 0 ? <BurstThumb shots={shots} open={reviewing} onToggle={() => setReviewing((r) => !r)} /> : undefined} />
        </div>
        </CameraCloseGestures>
      </DialogContent>
    </Dialog>
  );
}
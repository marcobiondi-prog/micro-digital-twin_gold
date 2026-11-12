import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Star, Trash2, X, Zap, ZapOff } from "lucide-react";
import { setCameraTorch, supportsCameraTorch } from "@/lib/camera-torch";
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
import { useBurstDock } from "@/lib/use-burst-dock";

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
  type Shot = { id: number; file: Promise<File | null>; thumb: string };
  const [shots, setShots] = useState<Shot[]>([]);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const [bestShotId, setBestShotId] = useState<number | null>(null);
  const bestShotIdRef = useRef(bestShotId);
  bestShotIdRef.current = bestShotId;
  const [flash, setFlash] = useState(0);
  const [pending, setPending] = useState(0);
  const [asking, setAsking] = useState(false);
  // The photo camera turns into the multiple shot without closing: the Singolo | Multiplo switch, or holding the shutter.
  const [multi, setMulti] = useState(mode === "burst");
  useEffect(() => { setMulti(mode === "burst"); }, [mode]);
  const burst = mode !== "video" && mode !== null && multi;

  const { carouselRef, updateDockEffect } = useBurstDock(Boolean(burst), shots.length);

  useEffect(() => {
    if (burst && shots.length > 0) {
      const el = carouselRef.current;
      if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }
  }, [burst, shots.length, carouselRef]);

  const finish = useCallback((keep: boolean) => {
    const taken = shotsRef.current;
    // Shots still encoding are waited for, then handed over together: nothing shot is lost.
    if (taken.length && keep) {
      const bestId = bestShotIdRef.current;
      const ordered = bestId
        ? [...taken.filter((s) => s.id === bestId), ...taken.filter((s) => s.id !== bestId)]
        : taken;
      void Promise.all(ordered.map((s) => s.file)).then((files) => {
        const ready = files.filter((f): f is File => !!f);
        if (ready.length) onCapture(ready);
      });
    }
    shotsRef.current = [];
    setShots([]);
    setBestShotId(null);
    setAsking(false);
    close();
  }, [close, onCapture]);
  // Closing a multiple shot by Back or a swipe keeps what was taken: nothing shot is ever lost.
  const onClose = useCallback(() => finish(true), [finish]);
  // Back to Singolo at any time: the shots of the multiple shot go to the simulation at once (none is lost) and the
  // camera stays open for single photos.
  const backToSingle = () => {
    const taken = shotsRef.current;
    if (taken.length) {
      const bestId = bestShotIdRef.current;
      const ordered = bestId
        ? [...taken.filter((s) => s.id === bestId), ...taken.filter((s) => s.id !== bestId)]
        : taken;
      void Promise.all(ordered.map((s) => s.file)).then((files) => { const ready = files.filter((f): f is File => !!f); if (ready.length) onCapture(ready); });
      shotsRef.current = [];
      setShots([]);
      setBestShotId(null);
    }
    setMulti(false);
  };
  const dropShot = (id: number) => {
    setShots((p) => {
      const next = p.filter((s) => s.id !== id);
      if (bestShotIdRef.current === id) {
        setBestShotId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };
  const pickBestShot = (id: number, el?: HTMLElement | null) => {
    setBestShotId(id);
    hapticTick(25);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setTimeout(updateDockEffect, 200);
    }
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
    const ok = await setCameraTorch(streamRef.current?.getVideoTracks()[0], next);
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
      if (torchOnRef.current) { window.clearTimeout(torchTimer.current); torchTimer.current = window.setTimeout(() => void setCameraTorch(streamRef.current?.getVideoTracks()[0], true), 350); }
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

  const { holding, onHold } = useHoldBurst(() => capture(), () => setMulti(true));
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
      if (burst || holding.current) {
        // The multiple shot answers at once: flash, sound and tick first, a small preview in the strip right away,
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
        setBestShotId((prev) => prev ?? id);
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

  return (
    <Dialog open={mode !== null} onOpenChange={(open) => { if (!open) onClose(); }} modal>
      <DialogContent data-no-ui-click data-sys-camera-root className="camera-hud inset-0 left-0 top-0 block h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 bg-camera-surface p-0 text-camera-ink shadow-none duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-h-none sm:overflow-hidden sm:rounded-none [&>button]:hidden" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{mode === "video" ? "Registra video" : burst ? "Scatto multiplo" : "Scatta foto"}</DialogTitle>
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
          <span className="camera-title"><Camera className="size-4" /> {burst ? "Scatto multiplo" : "Fotocamera"}</span>
          <span className="ml-auto flex items-center gap-2">
            {burst && shots.length > 0 && (
              <button type="button" onClick={() => finish(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-80">
                <Check className="size-4" aria-hidden="true" /> Fine · {shots.length} foto
              </button>
            )}
            {/* The same flash button as the AI camera's: a round glass tool, lit like a pressed tool while on. */}
            {torch !== "none" && <Button variant="ghost" size="icon" className="camera-tool size-11 aria-pressed:border-camera-ink aria-pressed:bg-camera-surface" aria-pressed={torch === "on"} aria-label={torch === "on" ? "Disattiva flash" : "Attiva flash"} title={torch === "on" ? "Disattiva flash" : "Attiva flash"} onClick={() => void toggleTorch()}>{torch === "on" ? <Zap className="size-4" /> : <ZapOff className="size-4" />}</Button>}
            <Button variant="ghost" size="icon" onClick={() => (burst && shots.length ? setAsking(true) : onClose())} aria-label="Chiudi fotocamera" title="Chiudi fotocamera" className="camera-tool size-11"><X className="size-4" /></Button>
          </span>
        </div>
        {torchNote && <p role="status" className="absolute inset-x-6 top-20 z-10 mx-auto max-w-sm rounded-full bg-black/70 px-4 py-2 text-center text-sm text-white">{torchNote}</p>}
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
          {burst && shots.length === 0 && (
            <p className="mb-2 text-center text-xs text-white/85 [text-shadow:0_1px_3px_rgb(0_0_0/0.7)]" role="status" aria-live="polite">
              Tocca per una foto o tieni premuto per scattarne di fila, poi Fine
            </p>
          )}
          {burst && shots.length > 0 && (
            <div className="flex w-full flex-col items-center gap-1 mb-2">
              <div className="flex w-full max-w-[min(26rem,92vw)] items-center justify-between px-2 text-[10.5px] font-semibold text-white/90 [text-shadow:0_1px_2px_black]">
                <span>{shots.length} {shots.length === 1 ? "foto scattata" : "foto scattate"}</span>
                <span className="flex items-center gap-1 font-bold text-[#00d296]">
                  <Star className="size-2.5 fill-current" /> Tocca per scegliere la migliore
                </span>
              </div>
              <div
                ref={carouselRef}
                onScroll={updateDockEffect}
                data-map-gestures
                className="ar-burst-carousel w-full max-w-full"
              >
                {shots.map((s, i) => {
                  const isBest = s.id === (bestShotId ?? shots[0]?.id);
                  return (
                    <div
                      key={s.id}
                      data-burst-item
                      data-burst-id={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => pickBestShot(s.id, e.currentTarget)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickBestShot(s.id, e.currentTarget as HTMLElement); } }}
                      aria-label={`Foto ${i + 1}${isBest ? " (Scatto migliore selezionato)" : " (Tocca per scegliere come migliore)"}`}
                      className={`relative shrink-0 snap-center rounded-lg p-0.5 cursor-pointer ${
                        isBest
                          ? "ring-2 ring-[#00d296] shadow-[0_0_14px_rgba(0,210,150,0.85)]"
                          : "ring-1 ring-white/40 hover:ring-white/80 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={s.thumb}
                        alt={`Foto ${i + 1}`}
                        className="size-12 rounded-md object-cover"
                      />
                      <span className="absolute bottom-1 left-1.5 rounded-full bg-black/75 px-1 text-[8.5px] font-bold text-white [text-shadow:0_1px_2px_black]">
                        {i + 1}
                      </span>
                      {isBest && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-[#00d296] px-1.5 py-0.2 text-[8.5px] font-extrabold text-[#042017] shadow-sm whitespace-nowrap">
                          <Star className="size-2 fill-current" /> Migliore
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dropShot(s.id);
                        }}
                        aria-label={`Togli la foto ${i + 1}`}
                        className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black/85 text-white ring-1 ring-white/40 hover:bg-destructive hover:scale-110 transition-transform"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {canZoom && ready && <ZoomDial className="mb-2" zoom={zoom} max={mode === "video" && zoomRangeRef.current ? zoomRangeRef.current.max / zoomRangeRef.current.min : ZOOM_MAX} onZoom={setZoom} />}
          {mode !== "video" && (
            <div className="mx-auto mb-2 flex w-fit rounded-full bg-black/55 p-1 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur" role="radiogroup" aria-label="Tipo di scatto">
              <button type="button" role="radio" aria-checked={!burst} onClick={backToSingle}
                  // Off once the multiple shot has photos (no switching by mistake mid-series): "Fine" hands them over first.
                  disabled={burst && shots.length > 0} title={burst && shots.length > 0 ? "Prima tocca Fine per tenere gli scatti" : undefined}
                  className={`h-8 rounded-full px-3 ${!burst ? "bg-white text-black" : ""} disabled:opacity-40`}>Singolo</button>
              <button type="button" role="radio" aria-checked={burst} onClick={() => setMulti(true)} className={`h-8 rounded-full px-3 ${burst ? "bg-white text-black" : ""}`}>Multiplo</button>
            </div>
          )}
          <CameraCaptureControl mode={mode === "video" ? "video" : "photo"} recording={recording} disabled={!ready || !!error || (!burst && pending > 0)} onCapture={capture} {...(mode !== "video" ? { onHold } : {})} />
        </div>
        </CameraCloseGestures>
      </DialogContent>
    </Dialog>
  );
}
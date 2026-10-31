import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Activity, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flame, Info, Grid2X2, Minus, Plus, ScanSearch, SlidersHorizontal, Square, Trash2, Undo2, X, Zap, ZapOff } from "lucide-react";
import { supportsCameraTorch, setCameraTorch } from "@/lib/camera-torch";
import { detectArObject, getReferencePhoto, type Detection, type Soil } from "@/controllers/ar-detect.functions";
import { gbifPhotoSearchUrl, pickGbifPhoto, type ReferencePhoto } from "@/models/ar-reference-photo";
import { findSubject, frameUsable, SEARCH_BOX, smoothBox, type SubjectBox } from "@/lib/ar-subject-tracker";
import { extractPlantPhoto } from "@/views/ar-plant-photo";

type D = NonNullable<Detection>;
const BIN_EMPTY_MS = 1100;
/** Scan uploads: main frame, leaf close-up and the smaller retry frame (longest side, px). */
const SCAN_IMAGE_PX = 1280, SCAN_DETAIL_PX = 768, SCAN_RETRY_PX = 960;
/** Long side of the light scan photo stored with each report record (Esito on a swiped-back scan). */
const SCAN_PHOTO_PX = 400;
/** The server-fn client turns an HTTP error with an empty body into an Error with an empty message. */
const isEmptyHttpError = (error: unknown) => error instanceof Error && !error.message.trim();
/** JPEG of the frame, scaled down so its longest side is at most `maxSide`. */
function encodeFrame(frame: HTMLCanvasElement, maxSide: number, quality: number) {
  const scale = Math.min(1, maxSide / Math.max(frame.width, frame.height));
  if (scale === 1) return frame.toDataURL("image/jpeg", quality);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(frame.width * scale));
  out.height = Math.max(1, Math.round(frame.height * scale));
  out.getContext("2d")?.drawImage(frame, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", quality);
}
/** Native fullscreen rotation: wait this long for the reported size to settle before re-laying out. */
const NATIVE_SETTLE_MS = 120;
type SpeciesInfo = NonNullable<D["species"]> & { cooling: D["cooling"]; identification: D["identification"] };
/** One camera section's scan, set aside while another section is open. */
type TabResult = {
  found: string | null; soil: Soil; survey: GroundSurvey | null; species: SpeciesInfo | null; count: number;
  taps: { x: number; y: number }[]; cooling: PlacementCooling[]; last: Parameters<ArScene["place"]> | null;
  plantPhoto: HTMLCanvasElement | null; photoPreview: string | null; realPhoto: string | null; recordId: string | null; thermalMin: boolean;
};
import { type GroundSurvey } from "@/models/ar-recognition";
import { AR_FOCUS, arFocusOption, defaultArFocus, scanMissing, scanPrecheck, type ArFocus } from "@/models/ar-focus";
import type { ArScene } from "@/views/ar-scene";
import { Button } from "@/components/ui/button";
import { drawCameraVideo, freezeCameraFrame, paintArFrame } from "@/lib/ar-frame";
import { startArFrameLoop } from "@/lib/ar-frame-loop";
import { captureSummaryLines } from "@/models/ar-capture-summary";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cameraViewport, groundTilt, setArOrientationActive, shortestRotationDelta } from "@/lib/ar-orientation";
import { CameraCloseGestures } from "@/views/CameraCloseGestures";
import { tutorialSwipeStep } from "@/lib/ar-tutorial-swipe";
import { CameraCenterCapture } from "@/views/CameraCenterCapture";
import { CameraCaptureControl } from "@/views/CameraCaptureControl";
import { playAiShutter, playCameraSound, preloadAiShutter, startScanLoop } from "@/lib/camera-sounds";
import { useLab } from "@/models/lab-store";
import { createTrackZoomer, pinchZoom, splitZoom, trackZoomRange, zoomHaptic, zoomLabel, ZOOM_LENSES, ZOOM_MAX, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";
import { satelliteContext, satelliteLine, type SatelliteContext } from "@/models/copernicus";
import { loadCopernicus } from "@/views/copernicus-client";
import { coolingAmount, coolingLabel, coolingReadout, scannedSpecimenThermal, scannedSpecimenCount, MAX_SCANNED_SPECIMENS, type PlacementCooling } from "@/models/ar-placement";
import { loadAirTemperature } from "@/views/air-temp-client";
import { clearScans, recordScan, scanPhoto, setScanSpeciesPhoto, updateScan, useArScans, type ScanRecord } from "@/models/ar-scan-log";
import { cameraRotatesNatively, enterCameraChrome, exitCameraChrome, fullscreenExitIsBack } from "@/lib/camera-chrome";

type Mode = "photo" | "video";
type Layer = "heat" | "objects" | "grid";
/** How long the scan runs visibly before stopping when the frame has nothing to analyse. */
const PRECHECK_SCAN_MS = 1200;
const FOCUS_LABELS = { tree: "Vegetazione", ground: "Suolo", leaf: "Foglia", canopy: "Chioma", interrow: "Interfila" };

const URBAN_TUTORIAL = [
  { title: "1 · Scegli l'obiettivo", text: "In alto scegli «Alberi e ombra» per un albero della piazza o «Suolo e depavimentazione» per la pavimentazione." },
  { title: "2 · Scansiona", text: "Inquadra chioma e tronco, oppure il suolo davanti a te, e avvia la scansione: specie, ombra e permeabilità." },
  { title: "3 · Bilancia termica", text: "Usa − / + o trascina la bilancia Caldo/Fresco per simulare più alberi e vedere ombra e gradi percepiti in meno." },
  { title: "4 · Scatta", text: "Scatta foto o video: la griglia non compare e la stima va nel Lab e nei report della piazza." },
] as const;

const TUTORIAL = [
  { title: "1 · Inquadra", text: "Avvicinati a 20–30 cm da una foglia o dalla chioma: il mirino si aggancia da solo alla vegetazione." },
  { title: "2 · Scansiona", text: "Avvia la scansione: prima la forma della foglia, poi il confronto botanico e la stima del terreno." },
  { title: "3 · Bilancia termica", text: "Usa − / + o trascina la bilancia Caldo/Fresco per vedere i gradi di raffrescamento e l'ombra." },
  { title: "4 · Scatta", text: "Scatta foto o video: la griglia non compare e la stima botanico-termica va nel Lab e nei report." },
] as const;

/**
 * Fotocamera con realtà aumentata (solo utenti registrati): l'anteprima è disegnata su un canvas
 * con sopra dati, mappa termica e oggetti posizionati col tocco; foto e video includono gli strati.
 * Il Dialog resta montato con open controllato dallo stato (StrictMode + useBackClose).
 */
export function ArCamera({
  mode,
  kind,
  context,
  onCapture,
  onClose: closeCamera,
  onFallback,
}: {
  mode: Mode | null;
  kind: "urban" | "vineyard";
  /** Contesto del flusso: scenario urbano o zona/fase vitivinicola, mostrato e salvato col file. */
  context?: string | undefined;
  onCapture: (files: File[]) => void;
  onClose: () => void;
  onFallback: (mode: Mode) => void;
}) {
  // Multiple shot (Multiplo): the AI camera stays open, each shutter tap keeps one more captioned photo, and "Fine"
  // (or closing, Back included) adds them all at once — nothing shot is lost.
  const [burst, setBurst] = useState(false);
  const [burstShots, setBurstShots] = useState<Array<{ id: number; file: File; url: string }>>([]);
  const burstRef = useRef(burstShots);
  burstRef.current = burstShots;
  const [burstFlash, setBurstFlash] = useState(0);
  const onClose = useCallback(() => {
    const taken = burstRef.current;
    if (taken.length) { onCapture(taken.map((s) => s.file)); taken.forEach((s) => URL.revokeObjectURL(s.url)); burstRef.current = []; setBurstShots([]); }
    setBurst(false);
    closeCamera();
  }, [closeCamera, onCapture]);
  const dropBurstShot = (id: number) => setBurstShots((p) => { const gone = p.find((s) => s.id === id); if (gone) URL.revokeObjectURL(gone.url); return p.filter((s) => s.id !== id); });
  // Copernicus area context (signed-in camera): read once per place, shared with the Lab panel.
  const lab = useLab();
  const place = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const [satellite, setSatellite] = useState<SatelliteContext | null>(null);
  useEffect(() => {
    if (!mode) return;
    let alive = true;
    loadCopernicus(place.lat, place.lng).then((r) => { if (alive) setSatellite(r.configured ? satelliteContext(r) : null); }, () => { if (alive) setSatellite(null); });
    return () => { alive = false; };
  }, [mode, place.lat, place.lng]);
  const satelliteText = satelliteLine(satellite);
  // Base air temperature for the balance readout: the Lab's imported weather, else the place's current Open-Meteo value.
  const [airTemp, setAirTemp] = useState<number | null>(null);
  useEffect(() => {
    if (!mode) return;
    let alive = true;
    loadAirTemperature(place.lat, place.lng).then((t) => { if (alive) setAirTemp(t); });
    return () => { alive = false; };
  }, [mode, place.lat, place.lng]);
  const baseTemp = (kind === "urban" ? lab.urban.realTemp : null) ?? airTemp;
  // Zoom: pinch on the preview or − / + buttons; hardware where the camera allows it, the rest digital.
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const digitalZoomRef = useRef(1);
  const zoomRangeRef = useRef<ReturnType<typeof trackZoomRange>>(null);
  const zoomerRef = useRef<((value: number) => void) | null>(null);
  const pinchFrom = useRef(1);
  const setZoom = (value: number) => {
    const { hardware, digital } = splitZoom(value, zoomRangeRef.current);
    if (hardware !== null) zoomerRef.current?.(hardware);
    digitalZoomRef.current = digital;
    const prev = zoomRef.current;
    zoomRef.current = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 10) / 10));
    // Lens-dial feel on phones/tablets: ticks, detents on 1·2·3·5, a bump at the limits.
    const haptic = zoomHaptic(prev, zoomRef.current);
    if (haptic) hapticTick([...haptic]);
    setZoomState(zoomRef.current);
  };
  const onPinch = (ratio: number, start: boolean) => {
    if (start) pinchFrom.current = zoomRef.current;
    else setZoom(pinchZoom(pinchFrom.current, 1, ratio));
  };
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const taps = useRef<{ x: number; y: number }[]>([]);
  const plantedCooling = useRef<PlacementCooling[]>([]);
  // The report entry of the scan on screen (its specimen count follows the balance).
  const scanRecordId = useRef<string | null>(null);
  const tabMemory = useRef(new Map<ArFocus, TabResult>());
  const layersRef = useRef<Set<Layer>>(new Set(["objects"]));
  const [layers, setLayers] = useState<Set<Layer>>(new Set(["objects"]));
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sceneRef = useRef<ArScene | null>(null);
  // Composizione del fotogramma: l'anteprima mostra la griglia, lo scatto no.
  const paintRef = useRef<((showGrid: boolean) => boolean) | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  scanningRef.current = scanning;
  const scanVersion = useRef(0);
  const scanBusy = useRef(false);
  const [found, setFound] = useState<string | null>(null);
  const [soil, setSoil] = useState<Soil>(null);
  const [survey, setSurvey] = useState<GroundSurvey | null>(null);
  const plantPhoto = useRef<HTMLCanvasElement | null>(null);
  const tutorial = kind === "urban" ? URBAN_TUTORIAL : TUTORIAL;
  const [target, setTarget] = useState<ArFocus>(() => defaultArFocus(kind));
  useEffect(() => { setTarget(defaultArFocus(kind)); }, [kind]);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // The real photograph of the scanned plant (the frozen frame cropped to its box): Esito's main picture.
  const [realPhoto, setRealPhoto] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"analysis" | "manage" | null>(null);
  const [species, setSpecies] = useState<SpeciesInfo | null>(null);
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  // La stima termica si può minimizzare in una barra compatta riapribile.
  const [thermalMin, setThermalMin] = useState(false);
  const [thermalInfoOpen, setThermalInfoOpen] = useState(false);
  const [panelMin, setPanelMin] = useState(false);
  // L'esito dell'analisi si può chiudere senza perdere i dati: si riapre con un tocco.
  const [panelOpen, setPanelOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [torchError, setTorchError] = useState<string | null>(null);
  // Only the scanned photographic cutout can be placed; no geometric tree templates.

  const last = useRef<Parameters<ArScene["place"]> | null>(null);
  // Nessuna schermata di posizionamento: la fotocamera AI resta l'unica vista.
  const xrActive = false;
  // Eye tracking del soggetto: il mirino cerca e segue la pianta dal primo fotogramma.
  const [subject, setSubject] = useState<SubjectBox>(SEARCH_BOX);
  const [subjectLocked, setSubjectLocked] = useState(false);
  const [framingHint, setFramingHint] = useState(false);
  const [swipeHint, setSwipeHint] = useState(false);
  useEffect(() => {
    if (!mode || !ready) { setSwipeHint(false); return; }
    setSwipeHint(true);
    const timer = window.setTimeout(() => setSwipeHint(false), 4500);
    return () => window.clearTimeout(timer);
  }, [mode, ready]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const guideSwipe = useRef<{ id: number; x: number; y: number; rotation: number } | null>(null);
  const closeGuide = () => {
    setGuideOpen(false); setGuideStep(0);
    try { localStorage.setItem((kind === "urban" ? "ar-tutorial-seen-urban" : "ar-tutorial-seen-v2"), "1"); } catch { /* storage non disponibile */ }
  };
  useEffect(() => {
    if (!mode || !ready) return;
    try { if (!localStorage.getItem((kind === "urban" ? "ar-tutorial-seen-urban" : "ar-tutorial-seen-v2"))) { setGuideStep(0); setGuideOpen(true); } } catch { setGuideOpen(true); }
  }, [mode, ready]);
  const [scanPhase, setScanPhase] = useState<"leaf" | "catalogue">("leaf");
  useEffect(() => {
    if (!mode || !ready) { setFramingHint(false); return; }
    setFramingHint(true);
    const timer = window.setTimeout(() => setFramingHint(false), 2500);
    return () => window.clearTimeout(timer);
  }, [mode, ready]);
  useEffect(() => {
    if (subjectLocked || scanning) setFramingHint(false);
  }, [subjectLocked, scanning]);
  useEffect(() => {
    if (!scanning) { setScanPhase("leaf"); return; }
    const timer = window.setTimeout(() => setScanPhase("catalogue"), 400);
    return () => window.clearTimeout(timer);
  }, [scanning]);
  // Each section names its own scan steps (urban trees/ground, vineyard leaf/canopy/interrow).
  const phaseText = arFocusOption(kind, target).phases[scanPhase === "leaf" ? 0 : 1];
  const scanStatus = phaseText.status;
  const summaryText = arFocusOption(kind, target).summary;
  const toggleTorch = async () => {
    if (torchBusy || !torchSupported || scanning) return;
    setTorchBusy(true); setTorchError(null);
    const next = !torchOn;
    const enabled = await setCameraTorch(streamRef.current?.getVideoTracks()[0], next);
    if (enabled) setTorchOn(next);
    else setTorchError("Impossibile attivare il flash su questo dispositivo.");
    setTorchBusy(false);
  };
  // The reticle follows greens and bark browns (trunks); the scan gate for vine leaf/canopy
  // counts green alone, so wooden furniture moves the reticle but never unlocks the AI.
  const greenLockRef = useRef(false);
  // Whether the latest frame shows anything (not black or flat): an unlocked scan still goes to the AI then.
  const frameUsableRef = useRef(false);
  useEffect(() => {
    if (!mode || !ready) return;
    const sample = document.createElement("canvas");
    const g = sample.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    let box = SEARCH_BOX;
    let hits = 0, misses = 0, locked = false;
    let greenHits = 0, greenMisses = 0;
    greenLockRef.current = false;
    const tick = () => {
      const video = videoRef.current, view = canvasRef.current;
      if (document.hidden || scanningRef.current || !video?.videoWidth || !view?.clientWidth) return;
      const W = 48, H = Math.max(24, Math.round(48 * view.clientHeight / view.clientWidth));
      if (sample.width !== W || sample.height !== H) { sample.width = W; sample.height = H; }
      // Stesso ritaglio "a riempimento" dell'anteprima: il mirino coincide con ciò che si vede.
      drawCameraVideo(g, video, W, H, -rotationRef.current, digitalZoomRef.current);
      const pixels = g.getImageData(0, 0, W, H).data;
      frameUsableRef.current = frameUsable(pixels, W, H);
      const found = findSubject(pixels, W, H, locked ? box : null);
      if (found) { hits++; misses = 0; } else { misses++; hits = 0; }
      if (findSubject(pixels, W, H, null, { bark: false })) { greenHits++; greenMisses = 0; } else { greenMisses++; greenHits = 0; }
      if (!greenLockRef.current && greenHits >= 2) greenLockRef.current = true;
      if (greenLockRef.current && greenMisses >= 4) greenLockRef.current = false;
      if (!locked && hits >= 2) locked = true;
      if (locked && misses >= 4) locked = false;
      box = smoothBox(box, found && (locked || hits > 0) ? found : locked ? box : SEARCH_BOX, locked ? 0.45 : 0.3);
      setSubject(box);
      setSubjectLocked(locked);
    };
    tick();
    const id = window.setInterval(tick, 110);
    return () => { window.clearInterval(id); setSubject(SEARCH_BOX); setSubjectLocked(false); greenLockRef.current = false; };
  }, [mode, ready]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rotationRef = useRef(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0, rotation: 0, landscape: false });
  const landscape = viewport.landscape;
  useEffect(() => {
    if (!mode) return;
    let beta: number | null = null, gamma: number | null = null;
    let current = { width: 0, height: 0, rotation: 0, landscape: false };
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let transition: { skipTransition: () => void; finished: Promise<void> } | undefined;
    let nativeTimer: ReturnType<typeof setTimeout> | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    // While Android rotates natively it reports in-between sizes: apply only the settled one, once.
    const sync = () => {
      if (!cameraRotatesNatively()) { clearTimeout(nativeTimer); nativeTimer = undefined; syncNow(); return; }
      clearTimeout(nativeTimer);
      nativeTimer = setTimeout(() => { nativeTimer = undefined; syncNow(); }, NATIVE_SETTLE_MS);
    };
    const syncNow = () => {
      const rect = surfaceRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect.height) return;
      const angle = screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0;
      // In fullscreen Android rotates the screen itself: follow its layout, never add a CSS turn on top.
      const native = cameraRotatesNatively();
      const next = native
        ? { width: rect.width, height: rect.height, rotation: 0, landscape: rect.width > rect.height }
        : cameraViewport(rect.width, rect.height, angle, beta, gamma, current.rotation, screen.orientation?.type);
      if (next.width === current.width && next.height === current.height && next.rotation === current.rotation) return;
      const turn = shortestRotationDelta(current.rotation, next.rotation);
      const animate = !native && current.width > 0 && !reducedMotion.matches && (turn !== 0 || next.landscape !== current.landscape);
      const flipped = current.width > 0 && next.landscape !== current.landscape;
      const apply = () => { rotationRef.current = next.rotation; current = next; setViewport(next); };
      transition?.skipTransition();
      if (native) {
        apply();
        // A short fade makes the new panel layout arrive softly after Android's own turn.
        if (flipped && !reducedMotion.matches) surfaceRef.current?.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 220, easing: "ease-out" });
        return;
      }
      if (animate && document.startViewTransition) {
        document.documentElement.style.setProperty("--ar-rotation-turn", `${turn}deg`);
        transition = document.startViewTransition(() => flushSync(apply));
        void transition.finished.catch(() => { /* Rapid turns may skip snapshots. */ });
      } else {
        apply();
        if (animate) surfaceRef.current?.animate([
          { opacity: 0.8, transform: "scale(1.035)" },
          { opacity: 1, transform: "scale(1)" },
        ], { duration: 360, easing: "cubic-bezier(0.2, 0, 0, 1)" });
      }
    };
    const onDevice = (event: DeviceOrientationEvent) => {
      beta = event.beta; gamma = event.gamma;
      // Native rotation ignores the sensors; letting them call sync would keep postponing the settle timer.
      if (cameraRotatesNatively()) return;
      if (settleTimer === undefined) settleTimer = setTimeout(() => { settleTimer = undefined; sync(); }, 120);
    };
    const observer = new ResizeObserver(sync);
    const onResize = () => {
      sync();
      clearTimeout(resizeTimer);
      // Mobile viewport units/dialog bounds may settle after the resize event.
      resizeTimer = setTimeout(sync, 180);
    };
    if (surfaceRef.current) observer.observe(surfaceRef.current);
    sync();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    window.addEventListener("ar-orientation-change", onResize);
    screen.orientation?.addEventListener("change", onResize);
    window.addEventListener("deviceorientation", onDevice);
    window.addEventListener("deviceorientationabsolute", onDevice as EventListener);
    return () => {
      observer.disconnect();
      clearTimeout(settleTimer);
      clearTimeout(resizeTimer);
      clearTimeout(nativeTimer);
      transition?.skipTransition();
      document.documentElement.style.removeProperty("--ar-rotation-turn");
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      window.removeEventListener("ar-orientation-change", onResize);
      screen.orientation?.removeEventListener("change", onResize);
      window.removeEventListener("deviceorientation", onDevice);
      window.removeEventListener("deviceorientationabsolute", onDevice as EventListener);
    };
  }, [mode]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    if (!mode) return;
    setArOrientationActive(true);
    // No white system bars: fullscreen where allowed, else dark bars (lib/camera-chrome).
    void enterCameraChrome();
    return () => { setArOrientationActive(false); exitCameraChrome(); };
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    // Android Back first leaves native fullscreen without firing popstate: that exit closes the camera,
    // so one Back is enough. An exit caused by a rotation keeps it open (dark bars).
    let wasFullscreen = Boolean(document.fullscreenElement);
    const onFullscreenChange = () => {
      const fullscreen = Boolean(document.fullscreenElement);
      if (wasFullscreen && !fullscreen && fullscreenExitIsBack(performance.now())) onClose();
      wasFullscreen = fullscreen;
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [mode, onClose]);

  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    let stopFrameLoop: (() => void) | undefined;
    let previewReady = false;
    scanVersion.current += 1;
    scanBusy.current = false;
    setScanning(false);
    setError(null);
    setReady(false);
    setTorchSupported(false); setTorchOn(false); setTorchBusy(false); setTorchError(null);
    setRecording(false);
    taps.current = [];
    plantedCooling.current = [];
    tabMemory.current.clear(); scanRecordId.current = null;
    countRef.current = 0;
    setCount(0);
    setPanelMin(false);
    setThermalMin(false);

    last.current = null;
    setFound(null);
    setSoil(null);
    setSurvey(null); plantPhoto.current = null; setPhotoPreview(null); setRealPhoto(null);
    setSpecies(null);
    setPanelOpen(true);
    setToolsOpen(false); setActiveTool(null);
    setLayers(new Set(["objects"]));
    void import("@/views/ar-scene").then((m) => {
      if (!cancelled) sceneRef.current = m.createArScene();
    }).catch(() => {
      if (!cancelled) setError("Anteprima AR non disponibile su questo dispositivo.");
    });
    // Riconoscimento del terreno: il piano della griglia segue l'inclinazione reale del telefono.
    // Inclinazione corretta anche in orizzontale: gli assi beta/gamma ruotano con lo schermo,
    // quindi li riallineiamo all'angolo di orientamento prima di inclinare la griglia.
    // Ancoraggio al movimento: il primo orientamento letto fa da riferimento; gli oggetti
    // scansionati restano fermi sul loro punto mentre il telefono ruota attorno ad esso.
    let baseAlpha: number | null = null;
    let baseBeta: number | null = null;
    const onTilt = (ev: DeviceOrientationEvent) => {
      if (ev.beta == null) return;
      const angle = rotationRef.current || (window.screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);
      const { beta, gamma } = groundTilt(ev.beta, ev.gamma ?? 0, angle);
      // Alcuni WebView non espongono alpha: usiamo la bussola di Safari come riserva.
      const alpha = ev.alpha ?? (ev as unknown as { webkitCompassHeading?: number }).webkitCompassHeading ?? null;
      if (alpha != null) {
        if (baseAlpha == null) { baseAlpha = alpha; baseBeta = beta; }
        let yaw = alpha - baseAlpha;
        if (yaw > 180) yaw -= 360;
        if (yaw < -180) yaw += 360;
        sceneRef.current?.setMotion(yaw, beta - (baseBeta ?? beta) + 90);
      } else {
        sceneRef.current?.setTilt(beta, gamma);
      }
    };
    // iOS concede il giroscopio solo dopo un tocco dell'utente: la richiesta al mount viene
    // rifiutata in silenzio, quindi la ripetiamo al primo contatto con lo schermo.
    const DOE = window.DeviceOrientationEvent as unknown as
      | { requestPermission?: () => Promise<string> }
      | undefined;
    const askTiltPermission = () => {
      if (DOE?.requestPermission) void DOE.requestPermission().catch(() => "denied");
    };
    askTiltPermission();
    window.addEventListener("pointerdown", askTiltPermission, { once: true });
    // Alcuni Android/WebView emettono solo l'evento "absolute": ascoltiamo entrambi.
    window.addEventListener("deviceorientation", onTilt);
    window.addEventListener("deviceorientationabsolute", onTilt as EventListener);
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    videoRef.current = v;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("La fotocamera AR non è disponibile su questo dispositivo.");
    } else navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1440 }, frameRate: { ideal: 30, max: 30 } },
        audio: mode === "video",
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setTorchSupported(supportsCameraTorch(stream.getVideoTracks()[0]));
        zoomRangeRef.current = trackZoomRange(stream.getVideoTracks()[0]);
        zoomerRef.current = zoomRangeRef.current ? createTrackZoomer(stream.getVideoTracks()[0]) : null;
        digitalZoomRef.current = 1; zoomRef.current = 1; setZoomState(1);
        v.srcObject = stream;
        void v.play().catch(() => {});
        const paint = (showGrid: boolean) => {
          const c = canvasRef.current;
          if (!c) return false;
          const painted = paintArFrame(
            c,
            {
              video: v,
              rotation: -rotationRef.current,
              zoom: digitalZoomRef.current,
              scene: sceneRef.current,
              heat: layersRef.current.has("heat") ? (g, w, h) => thermal(g, w, h, taps.current, plantedCooling.current) : undefined,
            },
            showGrid,
          );
          if (painted && !previewReady) { previewReady = true; setReady(true); }
          return painted;
        };
        paintRef.current = paint;
        stopFrameLoop = startArFrameLoop(() => {
          // Same full-resolution composition, capped at 30 fps and paused while hidden.
          // Durante la scansione il fotogramma resta congelato: il video non viene ridipinto.
          if (!scanningRef.current) paint(layersRef.current.has("grid"));
        }, {
          request: callback => requestAnimationFrame(callback),
          cancel: id => cancelAnimationFrame(id),
          hidden: () => document.hidden,
          listen: callback => {
            document.addEventListener("visibilitychange", callback);
            return () => document.removeEventListener("visibilitychange", callback);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setError("Permesso fotocamera negato o telecamera non disponibile.");
      });
    return () => {
      cancelled = true;
      scanVersion.current += 1;
      window.removeEventListener("pointerdown", askTiltPermission);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("deviceorientationabsolute", onTilt as EventListener);
      stopFrameLoop?.();
      paintRef.current = null;
      if (recRef.current?.state === "recording") recRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [mode, kind]);

  const toggle = (l: Layer) =>
    setLayers((s) => {
      const n = new Set(s);
      if (n.has(l)) n.delete(l);
      else n.add(l);
      return n;
    });

  // Scan loop sound: runs only while an analysis is in progress in an open camera, and always stops.
  useEffect(() => (scanning && mode ? startScanLoop(1.8) : undefined), [scanning, mode]);
  // Decode the shutter as soon as the camera opens, so the first photo clicks without delay.
  useEffect(() => { if (mode) preloadAiShutter(); }, [mode]);

  // Clears the previous result (species, soil, survey, specimens, cut-out photo) for a fresh scan.
  const resetResults = () => {
    countRef.current = 0; setCount(0);
    taps.current = []; plantedCooling.current = [];
    last.current = null; scanRecordId.current = null;
    setSpecies(null);
    setSoil(null);
    setSurvey(null); plantPhoto.current = null; setPhotoPreview(null); setRealPhoto(null);
    setFound(null);
  };
  // Switching section keeps each section's own scan: the current one is set aside and the other's comes back
  // (empty the first time). A running scan stops; completed scans are also in the report log.
  const snapshotResults = (): TabResult => ({
    found, soil, survey, species, count: countRef.current, taps: taps.current, cooling: plantedCooling.current,
    last: last.current, plantPhoto: plantPhoto.current, photoPreview, realPhoto, recordId: scanRecordId.current, thermalMin,
  });
  const restoreResults = (r: TabResult) => {
    countRef.current = r.count; setCount(r.count);
    taps.current = r.taps; plantedCooling.current = r.cooling;
    last.current = r.last; scanRecordId.current = r.recordId;
    setSpecies(r.species); setSoil(r.soil); setSurvey(r.survey);
    plantPhoto.current = r.plantPhoto; setPhotoPreview(r.photoPreview); setRealPhoto(r.realPhoto);
    setFound(r.found); setThermalMin(r.thermalMin);
  };
  const selectTarget = (next: ArFocus) => {
    const current = arFocusOption(kind, target).id;
    if (next === current) return;
    cancelScan();
    tabMemory.current.set(current, snapshotResults());
    const saved = tabMemory.current.get(next);
    if (saved) restoreResults(saved); else resetResults();
    setTarget(next);
  };
  // Every completed scan goes to the report log, photo or not.
  const logScan = (result: string, sp: SpeciesInfo | null, ground: Soil, photo: string | null = null) => {
    scanRecordId.current = recordScan({
      kind, photo, target: arFocusOption(kind, target).label, context: context ?? "", result,
      species: sp ? {
        commonName: sp.commonName, scientificName: sp.scientificName, family: sp.family ?? null,
        level: sp.identification?.level === "species" ? "Specie probabile" : sp.identification?.level === "genus" ? "Genere probabile" : "Identificazione incerta",
        cooling: sp.cooling?.deltaT ?? null, shade: sp.cooling?.shadeM2 ?? null, photo: sp.photo,
      } : null,
      soil: ground ? { label: ground.label, permeability: ground.permeability, plantable: ground.plantable, note: ground.note } : null,
      count: 0, totalCooling: sp?.cooling ? 0 : null, totalShade: sp?.cooling ? 0 : null, satellite: satelliteText,
    });
  };

  const scan = async () => {
    const c = canvasRef.current;
    if (!c || scanBusy.current || !ready) return;
    const version = scanVersion.current;
    scanBusy.current = true;
    scanningRef.current = true;
    resetResults();
      setScanning(true);
      setPanelOpen(true);
      setToolsOpen(false); setActiveTool(null);
    try {
      // A vegetation target with no vegetation in the frame never calls the AI: a short visible scan
      // (sweep and sound) confirms the tap, then it stops with the section's message.
      const nothingToScan = scanPrecheck(kind, target, arFocusOption(kind, target).id === "tree" ? subjectLocked : greenLockRef.current, frameUsableRef.current);
      if (nothingToScan) {
        playCameraSound("scan-start", 1.8);
        await new Promise((resolve) => window.setTimeout(resolve, PRECHECK_SCAN_MS));
        if (version !== scanVersion.current) return;
        playCameraSound("scan-fail", 1.8);
        setFound(nothingToScan);
        return;
      }
      const video = videoRef.current;
      if (!video?.videoWidth) return;
      // Recognition and frozen preview preserve the live crop and rotation.
      const small = freezeCameraFrame(c, video, -rotationRef.current, digitalZoomRef.current);
      if (!small) return;
      // Lighter upload (≤1280 px, q0.85): large tablet frames could fail as an empty HTTP error.
      const image = encodeFrame(small, SCAN_IMAGE_PX, 0.85);
      playCameraSound("scan-start", 1.8);
      // Same frozen frame, with a second close-up preserving leaf edges and veins.
      const detail = document.createElement("canvas");
      const focus = subjectLocked ? subject : SEARCH_BOX;
      const x = Math.max(0, focus.x - 0.08), y = Math.max(0, focus.y - 0.08);
      const w = Math.min(1 - x, focus.w + 0.16), h = Math.min(1 - y, focus.h + 0.16);
      const scale = Math.min(1, SCAN_DETAIL_PX / Math.max(w * small.width, h * small.height));
      detail.width = Math.max(1, Math.round(w * small.width * scale));
      detail.height = Math.max(1, Math.round(h * small.height * scale));
      detail.getContext("2d")?.drawImage(small, x * small.width, y * small.height, w * small.width, h * small.height, 0, 0, detail.width, detail.height);
      const detailImage = detail.toDataURL("image/jpeg", 0.85);
      const request = { kind, target: arFocusOption(kind, target).id, ...(subjectLocked ? { focus: subject } : {}), ...(satellite ? { satellite } : {}) };
      let r: Awaited<ReturnType<typeof detectArObject>>;
      try {
        r = await detectArObject({ data: { ...request, image, ...(detailImage.length <= 1_000_000 ? { detailImage } : {}) } });
      } catch (first) {
        // An HTTP error with an empty body (oversized or too slow): one retry, smaller and without the close-up.
        if (version !== scanVersion.current || !isEmptyHttpError(first)) throw first;
        r = await detectArObject({ data: { ...request, image: encodeFrame(small, SCAN_RETRY_PX, 0.8) } });
      }
      if (version !== scanVersion.current) return;
      const d = r.detection;
      setSoil(r.soil ?? null);
      setSurvey(r.survey ?? null);
      if (r.error) {
        playCameraSound("scan-fail", 1.8);
        setFound(r.error);
        return;
      }
      // Each branch target stops when the result lacks what it looks for (a plant, or the ground).
      const missing = scanMissing(kind, target, { plant: Boolean(d && (d.type !== "object" || d.species)), ground: Boolean(r.soil || r.survey?.regions.length) });
      if (missing) {
        playCameraSound("scan-fail", 1.8);
        setFound(missing);
        return;
      }
      if (!d) {
        playCameraSound("scan-done", 1.8);
        setFound("Terreno analizzato · nessuna specie identificata");
        logScan("Terreno analizzato · nessuna specie identificata", null, r.soil ?? null);
        return;
      }
      // Only a recognized species keeps the scan's photo (Esito, report); an unrecognized plant records nothing.
      if (d.species) setRealPhoto(cropRealPhoto(small, d.box));
      const cutout = d.outline ? await extractPlantPhoto(image, d.outline) : null;
      if (version !== scanVersion.current) return;
      plantPhoto.current = cutout;
      setPhotoPreview(cutout?.toDataURL("image/png") ?? null);
      const type =
        d.type === "vine" || (d.type === "object" && kind === "vineyard") ? "vine" : "tree";
      const args: Parameters<ArScene["place"]> = [
        type,
        d.box.x + d.box.w / 2,
        Math.min(0.98, d.box.y + d.box.h),
        Math.max(0.15, d.box.h),
        cutout ? { image: cutout } : undefined,
      ];
      // Nessun modello automatico: la specie riconosciuta viene usata solo ai tocchi sulla griglia.
      last.current = cutout ? args : null;
      // Nessun aggancio automatico: le copie compaiono solo con il pulsante +.
      setLayers((s) => new Set(s).add("objects"));
      const identified = d.species ? { ...d.species, cooling: d.cooling, identification: d.identification } : null;
      setSpecies(identified);
      playCameraSound("scan-done", 1.8);
      const outcome = d.species
        ? `${d.species.commonName} · ${d.identification?.level === "genus" ? "genere probabile" : "specie probabile"}`
        : `${d.label} · specie incerta, inquadra una foglia da vicino`;
      setFound(outcome);
      // The report keeps a lighter copy (about 20-30 kB), so a reload keeps each scan's photo in Esito. An
      // unrecognized plant is not a scan: no record, so the counter does not move and no photo is kept.
      if (identified) logScan(outcome, identified, r.soil ?? null, cropRealPhoto(small, d.box, SCAN_PHOTO_PX, 0.72));
      // The reference photo comes after the scan (the scan, and its sound, never wait on the databases): the
      // server asks Kew/GBIF, the phone retries GBIF if that finds none; it then fills Esito and the record.
      if (identified) {
        const recordId = scanRecordId.current;
        const gbifKey = identified.gbifKey;
        const fromPhone = async () => {
          if (!gbifKey) return null;
          const res = await fetch(gbifPhotoSearchUrl(gbifKey));
          return res.ok ? pickGbifPhoto(await res.json()) : null;
        };
        void getReferencePhoto({ data: { name: identified.scientificName, gbifKey } })
          .catch(() => null)
          .then((photo) => photo ?? fromPhone())
          .then((photo) => {
            if (!photo) return;
            if (recordId) setScanSpeciesPhoto(kind, recordId, photo);
            if (version === scanVersion.current) setSpecies((s) => (s && s.scientificName === identified.scientificName ? { ...s, photo } : s));
          })
          .catch(() => { /* offline: Esito keeps the scan photo alone */ });
      }

    } catch (error) {
      console.error("AR scan", error);
      const message = error instanceof Error ? error.message : "";
      // The host's own error text (e.g. FUNCTION_INVOCATION_TIMEOUT) names the real cause.
      const detail = message.replace(/<(style|script)[\s\S]*?<\/\1>|<[^>]*>/gi, " ").replace(/\s+/g, " ").trim().slice(0, 140) || (isEmptyHttpError(error) ? "risposta vuota dal server" : "");
      if (version === scanVersion.current) playCameraSound("scan-fail", 1.8);
      if (version === scanVersion.current) setFound(/Unauthorized/.test(message) ? "Sessione scaduta: esci e accedi di nuovo prima di una nuova analisi." : `Analisi interrotta${detail ? ` (${detail})` : ""}. Controlla la connessione prima di una nuova analisi.`);
    } finally {
      if (version === scanVersion.current) { scanBusy.current = false; scanningRef.current = false; setScanning(false); }
    }
  };

  // Stops the analysis in progress: the pending reply is ignored (stale version) and the live preview resumes.
  const cancelScan = () => {
    if (!scanningRef.current) return;
    scanVersion.current += 1;
    scanBusy.current = false;
    scanningRef.current = false;
    setScanning(false);
    setFound("Scansione terminata. Nessun nuovo risultato applicato.");
  };

  // All controls share one bounded count; no stage objects and no generic cooling.
  const changeGreen = (requested: number) => {
    if (!ready || scanningRef.current || !species?.cooling) return;
    const next = scannedSpecimenCount(requested);
    countRef.current = next;
    taps.current = Array.from({length:next}, (_, i) => ({x:0.2 + (i % 3) * 0.3, y:0.65 + Math.floor(i / 3) * 0.1}));
    plantedCooling.current = Array.from({length:next}, () => species.cooling);
    setCount(next);
  };
  const addGreen = () => changeGreen(countRef.current + 1);
  const removeGreen = () => changeGreen(countRef.current - 1);
  const removeLast = removeGreen;
  // "Elimina tutti" also empties this flow's scan records (report log and every section's result), after a confirm.
  const scanRecords = useArScans(kind);
  // The confirm lives inside the camera surface (not window.confirm), so it turns with the camera in landscape.
  const [confirmClear, setConfirmClear] = useState(false);
  // While the records are being deleted the big bin empties (files fly out, lid opens), then the confirm closes.
  const [emptying, setEmptying] = useState(false);
  const clearEverything = () => {
    setConfirmClear(false); setEmptying(false);
    clearScans(kind);
    tabMemory.current.clear();
    resetResults();
  };
  const confirmDelete = () => {
    if (emptying) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { clearEverything(); return; }
    setEmptying(true);
    window.setTimeout(clearEverything, BIN_EMPTY_MS);
  };
  // Summary pager over this flow's recorded scans, swiped like the tutorial; the scan badge follows it.
  // Pages are the records, plus the scan on screen when it is not recorded (e.g. a failed scan's message).
  const [browse, setBrowse] = useState<number | null>(null);
  const summarySwipe = useRef<{ id: number; x: number; y: number; rotation: number } | null>(null);
  useEffect(() => { setBrowse(null); }, [scanRecords.length, target]);
  const removeAll = () => { if (scanRecords.length) setConfirmClear(true); else clearEverything(); };
  const thermalEstimate = scannedSpecimenThermal(count, species?.cooling ?? null);
  const coolingNow = thermalEstimate.deltaT;
  const shadeNow = thermalEstimate.shadeM2;
  const MAX_GREEN = MAX_SCANNED_SPECIMENS;
  const readout = coolingReadout(baseTemp, coolingNow);
  useEffect(() => {
    if (scanRecordId.current) updateScan(kind, scanRecordId.current, { count, totalCooling: species?.cooling ? coolingNow : null, totalShade: species?.cooling ? shadeNow : null });
  }, [kind, count, coolingNow, shadeNow, species]);
  // Each change of specimens flashes its own step (e.g. "−0,4 °C") next to the before → after readout.
  const [stepFlash, setStepFlash] = useState<{ key: number; delta: number; up: boolean } | null>(null);
  const [balanceMin, setBalanceMin] = useState(false);
  // Room between the thermal summary and the bottom HUD (balance, zoom, capture), so the expanded summary
  // stops above the balance in portrait and scrolls the rest. Measured on screen; only portrait CSS uses it.
  const hudObserver = useRef<{ el: Element; ro: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const surface = surfaceRef.current?.querySelector<HTMLElement>(".ar-camera-surface");
    const hud = surface?.querySelector<HTMLElement>(".camera-bottom");
    if (!surface || !hud) return;
    const measure = () => {
      const summary = surface.querySelector(".ar-thermal-summary");
      if (!summary) return;
      const room = Math.max(96, Math.round(hud.getBoundingClientRect().top - summary.getBoundingClientRect().top - 12));
      if (surface.style.getPropertyValue("--ar-summary-room") !== `${room}px`) surface.style.setProperty("--ar-summary-room", `${room}px`);
    };
    measure();
    if (hudObserver.current?.el !== hud && typeof ResizeObserver !== "undefined") {
      hudObserver.current?.ro.disconnect();
      const ro = new ResizeObserver(measure);
      ro.observe(hud);
      hudObserver.current = { el: hud, ro };
    }
  });
  useEffect(() => () => hudObserver.current?.ro.disconnect(), []);
  // Every specimen added or removed flashes, even when a small plant changes only hundredths of a degree.
  const lastStep = useRef({ count, cooling: coolingNow });
  useEffect(() => {
    const prev = lastStep.current;
    lastStep.current = { count, cooling: coolingNow };
    if (count === prev.count && coolingNow === prev.cooling) return;
    const delta = Math.round((coolingNow - prev.cooling) * 1000) / 1000;
    setStepFlash({ key: Date.now(), delta, up: count < prev.count || delta < 0 });
    const timer = window.setTimeout(() => setStepFlash(null), 1400);
    return () => window.clearTimeout(timer);
  }, [count, coolingNow]);
  // "−0,03 °C" for a step, "< 0,01 °C" when it is too small to print, "±0,0 °C" at the 3 °C cap.
  const flashText = (f: { delta: number; up: boolean }) => {
    const amount = coolingAmount(f.delta);
    return amount.startsWith("<") ? `${amount} °C` : `${f.delta ? (f.up ? "+" : "−") : "±"}${amount} °C`;
  };
  const fmtC = (v: number, digits = 1) => v.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // Ogni esemplare in più mostra subito i gradi numerici accanto al conteggio.
  const hasLive = Boolean(found || survey || species || count > 0);
  const liveRecord = scanRecordId.current ? scanRecords.findIndex((r) => r.id === scanRecordId.current) : -1;
  const livePage = liveRecord >= 0 ? liveRecord : hasLive ? scanRecords.length : -1;
  const pageCount = scanRecords.length + (hasLive && liveRecord < 0 ? 1 : 0);
  const viewPage = Math.min(pageCount - 1, browse ?? (livePage >= 0 ? livePage : scanRecords.length - 1));
  const viewedRecord = viewPage !== livePage ? scanRecords[viewPage] ?? null : null;
  // The balance follows the summary page too: a swiped-back scan shows and edits its own specimens and cooling
  // (in the report record; the AR copies on screen stay the live scan's); a past scan without a cooling estimate
  // hides it.
  const dockRecord = viewedRecord?.species && viewedRecord.species.cooling !== null ? viewedRecord : null;
  const dockCount = dockRecord ? dockRecord.count : count;
  const dockCooling = dockRecord ? dockRecord.totalCooling ?? 0 : coolingNow;
  const dockReadout = dockRecord ? coolingReadout(baseTemp, dockCooling) : readout;
  const dockHasCooling = Boolean(dockRecord) || Boolean(species?.cooling);
  const dockEditable = dockRecord ? ready : Boolean(species?.cooling);
  const changeDock = (requested: number) => {
    if (!dockRecord?.species || dockRecord.species.cooling === null) { changeGreen(requested); return; }
    if (!ready || scanningRef.current) return;
    const next = scannedSpecimenCount(requested);
    const thermal = scannedSpecimenThermal(next, { deltaT: dockRecord.species.cooling, shadeM2: dockRecord.species.shade ?? 0 });
    updateScan(kind, dockRecord.id, { count: next, totalCooling: thermal.deltaT, totalShade: thermal.shadeM2 });
  };
  const countDegrees = dockHasCooling ? ` · ${coolingLabel(dockCooling)}` : "";
  const greenControls = !scanning && (
    <div className="ar-green-controls" data-camera-controls>
      <Button variant="ghost" size="icon" className="camera-tool" aria-label="Riduci verde" title="Riduci verde" disabled={!dockEditable || dockCount <= 0} onClick={() => changeDock(dockCount - 1)}><Minus className="size-4" /></Button>
      <span className="ar-green-count" aria-live="polite">Esemplari · {dockCount}{countDegrees}</span>
      <Button variant="ghost" size="icon" className="camera-tool" aria-label="Aggiungi pianta scansionata" title={dockEditable ? "Aggiungi esemplare alla stima" : "Scansiona prima una pianta"} disabled={!dockEditable || dockCount >= MAX_GREEN} onClick={() => changeDock(dockCount + 1)}><Plus className="size-4" /></Button>
    </div>
  );
  const balanceDrag = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    if (scanningRef.current || !ready || !dockEditable) return;
    const track = event.currentTarget;
    track.setPointerCapture(event.pointerId);
    const apply = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      if (!rect.width) return;
      changeDock(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * MAX_GREEN));
    };
    apply(event.clientX);
    const move = (ev: PointerEvent) => { ev.stopPropagation(); apply(ev.clientX); };
    const up = () => {
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", up);
      track.removeEventListener("pointercancel", up);
      track.removeEventListener("lostpointercapture", up);
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
    track.addEventListener("pointercancel", up);
    track.addEventListener("lostpointercapture", up);
  };
  const specimenDock = !scanning && (viewedRecord ? dockRecord : species?.cooling) && (
    <div className="ar-specimen-dock" data-camera-controls data-collapsed={balanceMin || undefined} aria-label="Esemplari e raffrescamento stimato">
      {/* Smartphones only (CSS hides it on tablets): fold the balance like an accordion, keeping a one-line summary;
          the header stays put at the bottom and the body unfolds from bottom to top. */}
      <button type="button" className="ar-dock-toggle" aria-expanded={!balanceMin} aria-controls="ar-balance-body" onClick={() => setBalanceMin((v) => !v)}>
        <span>Bilancia termica{dockRecord ? ` · scansione ${viewPage + 1} di ${pageCount}` : ""}{balanceMin ? ` · ${dockCount} esemplari · ${dockReadout.after !== null ? `${fmtC(dockReadout.after, dockReadout.digits)} °C` : coolingLabel(dockCooling)}` : ""}</span>
        {balanceMin ? <ChevronUp className="size-3.5 shrink-0" aria-hidden="true" /> : <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />}
      </button>
      <div id="ar-balance-body" className="ar-dock-body" inert={balanceMin || undefined}>
      {greenControls}
      <div className="ar-thermal-balance" data-camera-controls role="slider" tabIndex={0} aria-disabled={!dockEditable || scanning} onKeyDown={e => { if (dockEditable && ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "Home", "End"].includes(e.key)) { e.preventDefault(); changeDock(e.key === "Home" ? 0 : e.key === "End" ? MAX_GREEN : dockCount + (["ArrowRight","ArrowUp"].includes(e.key) ? 1 : -1)); } }} aria-valuemin={0} aria-valuemax={MAX_GREEN} aria-valuenow={dockCount}
        aria-valuetext={`${dockCount} esemplari, riduzione stimata ${coolingAmount(dockCooling)} gradi`} aria-label="Bilancia termica simulata">
        <span className="ar-thermal-balance-labels"><span>Caldo</span><span>Fresco</span></span>
        <span className={`ar-thermal-balance-track${dockEditable ? " is-draggable" : ""}`} onPointerDown={balanceDrag}>
          <span className="ar-thermal-balance-marker" style={{ left: `${Math.min(100, Math.max(0, (dockCount / MAX_GREEN) * 100))}%` }} />
          {dockHasCooling && <span className="ar-thermal-balance-value" style={{ left: `clamp(2.5rem, ${(dockCount / MAX_GREEN) * 100}%, calc(100% - 2.5rem))` }} aria-live="polite">{coolingLabel(dockCooling)}</span>}
        </span>
      </div>
      {/* Estimated perceived temperature: the place's air temperature before and after the cooling of the counted specimens. */}
      <p className="ar-cooling-readout" aria-live="polite">
        {dockReadout.before !== null && dockReadout.after !== null
          ? <><span>Percepita stimata</span><span className="ar-cooling-temps">{fmtC(dockReadout.before, dockReadout.digits)} °C <span aria-hidden="true">→</span><span className="sr-only"> diventa </span> <strong>{fmtC(dockReadout.after, dockReadout.digits)} °C</strong></span></>
          : <><span>Raffrescamento stimato</span><strong>{coolingLabel(dockCooling)}</strong></>}
        {stepFlash && !dockRecord && <span key={stepFlash.key} className="ar-cooling-step" data-up={stepFlash.up || undefined}>{flashText(stepFlash)}</span>}
      </p>
      {/* Copernicus stays alongside: the satellite surface temperature of the area, as a reference. */}
      {satellite?.surfaceTemp !== undefined && <p className="ar-cooling-satellite">Superficie dell’area (satellite) · {fmtC(satellite.surfaceTemp)} °C</p>}
      </div>
    </div>
  );
  const identificationBadge = species?.identification ? (
    <p className="ar-identification-badge">
      {species.identification.level === "species" ? "Specie probabile" : species.identification.level === "genus" ? "Genere probabile" : "Identificazione incerta"}
      {" · "}{species.identification.leafVisible ? "evidenza fogliare" : "corteccia e portamento"}
      {(species.colUrl || species.gbifUrl) && <span className="block">Tassonomia verificata</span>}
    </p>
  ) : null;
  // Wraps like the tutorial: after the last scan back to the first, before the first to the last.
  const goToPage = (page: number) => setBrowse(pageCount ? (page + pageCount) % pageCount : null);
  const summarySwipeProps = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (!event.isPrimary || event.pointerType === "mouse" || pageCount < 2 || (event.target instanceof Element && event.target.closest("button"))) return;
      summarySwipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation: rotationRef.current };
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const start = summarySwipe.current;
      summarySwipe.current = null;
      if (!start || start.id !== event.pointerId) return;
      const next = tutorialSwipeStep(viewPage, pageCount, event.clientX - start.x, event.clientY - start.y, start.rotation);
      if (next !== viewPage) goToPage(next);
    },
    onPointerCancel: () => { summarySwipe.current = null; },
  };
  const summaryPager = pageCount > 1 && (
    <div className="ar-summary-pager">
      <button type="button" aria-label="Scansione precedente" onClick={() => goToPage(viewPage - 1)}><ChevronLeft className="size-3.5" /></button>
      <span>Scansione {viewPage + 1} di {pageCount} · scorri per le altre</span>
      <button type="button" aria-label="Scansione successiva" onClick={() => goToPage(viewPage + 1)}><ChevronRight className="size-3.5" /></button>
    </div>
  );
  const minimizeSummary = <Button type="button" variant="ghost" size="icon" onClick={() => setThermalMin(true)}
    aria-label="Minimizza stima termica" title="Minimizza stima termica"
    className="ml-auto grid size-7 shrink-0 place-items-center rounded-full"><ChevronDown className="size-3.5" /></Button>;
  const recordView = (r: ScanRecord) => (
    <>
      <div className="ar-thermal-heading">
        <span className="ar-thermal-info-btn" aria-hidden="true"><Flame className="size-4 shrink-0" /></span>
        <span>{r.target}{r.species ? ` · ${r.species.commonName}` : r.soil ? ` · ${r.soil.label}` : ""}{r.count > 0 ? ` · ×${r.count}` : ""}</span>
        {minimizeSummary}
      </div>
      {r.species && <dl className="ar-thermal-values">
        <div><dt>Specie</dt><dd>{r.species.commonName}<span className="block text-xs italic text-muted-foreground">{r.species.scientificName}{r.species.family ? ` · ${r.species.family}` : ""}</span></dd></div>
        <div><dt>Per esemplare</dt><dd>{r.species.cooling !== null ? coolingLabel(r.species.cooling) : "n.d."}</dd></div>
        <div><dt>Ombreggiatura</dt><dd>{r.species.shade !== null ? `≈ ${Math.round(r.species.shade)} m²` : "n.d."}</dd></div>
      </dl>}
      {r.species && <p className="ar-identification-badge">{r.species.level}</p>}
      {r.count > 0 && r.totalCooling !== null && <dl className="ar-thermal-values">
        <div><dt>Riduzione temperatura</dt><dd>{coolingLabel(r.totalCooling)}</dd></div>
        <div><dt>Ombra teorica</dt><dd>≈ {Math.round(r.totalShade ?? 0)} m²</dd></div>
      </dl>}
      {r.soil && <p className="ar-thermal-exposure">Suolo {r.soil.label} · permeabilità {r.soil.permeability} · {r.soil.plantable ? "piantabile" : "non piantabile"}{r.soil.note ? ` · ${r.soil.note}` : ""}</p>}
      {!r.species && !r.soil && <p className="ar-thermal-note">{r.result}</p>}
      {r.satellite && <p className="ar-thermal-note">{r.satellite} · dati dell’area, non della foto</p>}
      <p className="ar-thermal-note">Scansione registrata · {new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}{r.context ? ` · ${r.context}` : ""}</p>
    </>
  );
  // Esito follows the summary pager: a swiped-back scan shows its own reference photo and result, not the live one.
  const recordEsito = (r: ScanRecord) => {
    return (
      <>
        <p className="ar-esito-page">Scansione {viewPage + 1} di {pageCount} · {r.target} · {new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</p>
        <EsitoPhoto scan={scanPhoto(r.id)} reference={r.species?.photo ?? null} name={r.species?.commonName ?? null} />
        {r.species ? (
          <p>
            <span className="text-sm font-semibold">{r.species.commonName}</span>{" "}
            <span className="italic text-muted-foreground">{r.species.scientificName}</span>
            {r.species.cooling !== null && (
              <span className="mt-1 block font-semibold text-primary">Raffrescamento stimato {coolingLabel(r.species.cooling)}{r.species.shade !== null ? ` · ombra ≈ ${Math.round(r.species.shade)} m²` : ""}</span>
            )}
          </p>
        ) : <p>{r.result}</p>}
        {r.species && <p className="ar-identification-badge">{r.species.level}</p>}
        {r.count > 0 && r.totalCooling !== null && <p className="mt-1 text-muted-foreground">{r.count} {r.count === 1 ? "esemplare" : "esemplari"} · {coolingLabel(r.totalCooling)}{r.totalShade !== null ? ` · ombra ≈ ${Math.round(r.totalShade)} m²` : ""}</p>}
        {r.soil && (
          <p className="text-muted-foreground">
            Terreno {r.soil.label} · permeabilità {r.soil.permeability} ·{" "}
            <span className={r.soil.plantable ? "text-primary" : "text-destructive"}>{r.soil.plantable ? "potenzialmente piantabile" : "superficie non idonea"}</span>
          </p>
        )}
        {r.soil?.note && <p className="text-muted-foreground">{r.soil.note}</p>}
        {r.satellite && <p className="mt-1 text-muted-foreground">{r.satellite} · dati dell’area, non della foto</p>}
        <p className="mt-1 text-muted-foreground">Identificazione e suolo: stime visive, non analisi strumentali.{r.species?.family ? ` · ${r.species.family}` : ""}</p>
      </>
    );
  };
  const thermalSummary = !scanning && (hasLive || scanRecords.length > 0) && (
    thermalMin ? (
      <Button type="button" variant="ghost" data-camera-controls className="ar-thermal-summary ar-thermal-summary-min"
        onClick={() => setThermalMin(false)} aria-label="Espandi stima termica" title="Espandi stima termica">
        <Flame className="size-4 shrink-0" /><span>{summaryText.title}{species ? ` · ${species.commonName}` : ` · ${summaryText.empty.toLowerCase()}`}{count > 0 && species?.cooling ? ` · ${coolingLabel(coolingNow)}` : ""}</span><ChevronUp className="size-3.5" />
      </Button>
    ) : (
    <section className={`ar-thermal-summary ${Math.abs(viewport.rotation) === 90 ? "touch-pan-x" : "touch-pan-y"}`} data-camera-controls aria-label="Risultati termici della scansione" aria-live="polite" {...summarySwipeProps}>
      <div className="ar-summary-slide" key={viewPage}>
      {viewedRecord ? recordView(viewedRecord) : <>
      <div className="ar-thermal-heading">
        <button type="button" className="ar-thermal-info-btn" onClick={() => setThermalInfoOpen(true)}
          aria-label="Come leggere la stima termica" title="Come leggere la stima termica">
          <Flame className="size-4 shrink-0" />
        </button><span>{summaryText.title}{species ? ` · ${species.commonName}` : ""}{count > 0 ? ` · ×${count}` : ""}</span>
        {minimizeSummary}
      </div>
      {species && <dl className="ar-thermal-values">
        <div><dt>Specie</dt><dd>{species.commonName}<span className="block text-xs italic text-muted-foreground">{species.scientificName}{species.family ? ` · ${species.family}` : ""}</span></dd></div>
        <div><dt>Per esemplare</dt><dd>{species.cooling ? coolingLabel(species.cooling.deltaT) : "n.d."}</dd></div>
        <div><dt>Ombreggiatura</dt><dd>{species.cooling ? `≈ ${Math.round(species.cooling.shadeM2)} m²` : "n.d."}</dd></div>
      </dl>}
      {!species && <div className="ar-thermal-note"><p className="font-semibold">{summaryText.empty}</p><p>{found ?? summaryText.idle}</p></div>}
      {identificationBadge}
      {(species?.cooling || count > thermalEstimate.unknown) && <dl className="ar-thermal-values">
        <div><dt>{"Riduzione temperatura"}</dt><dd>{coolingLabel(coolingNow)}</dd></div>
        <div><dt>Ombra teorica</dt><dd>≈ {Math.round(shadeNow)} m²</dd></div>
      </dl>}
      {thermalEstimate.unknown > 0 && <p className="ar-thermal-note">{thermalEstimate.unknown} senza stima di specie</p>}
      {survey && <p className="ar-thermal-exposure">{survey.heatNote}</p>}
      {satelliteText && <p className="ar-thermal-note">{satelliteText} · dati dell’area, non della foto</p>}
      <p className="ar-thermal-note">{summaryText.note}</p>
      </>}
      </div>
      {summaryPager}
    </section>
    )
  );


  // Lo scatto porta nel nome il contesto (scenario urbano o zona/fase vitivinicola).
  const slug = (context ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const tag = slug ? `-${slug}` : "";
  const shoot = () => {
    if (!ready || !canvasRef.current) return;
    playAiShutter();
    // Il fotogramma salvato non contiene la griglia: la nascondiamo solo per lo scatto.
    paintRef.current?.(false);
    const source = canvasRef.current;
    const lines = captureSummaryLines(species ? {
      commonName: species.commonName, scientificName: species.scientificName,
      level: species.identification?.level === "species" ? "Specie probabile" : species.identification?.level === "genus" ? "Genere probabile" : "Identificazione incerta",
      count, cooling: species.cooling ? coolingNow : null, shade: species.cooling ? shadeNow : null,
    } : null, context ?? (kind === "urban" ? "Sopralluogo urbano" : "Sopralluogo vitivinicolo"), satelliteText);
    const saved = document.createElement("canvas");
    const fontSize = Math.max(14, Math.round(source.width / 38));
    const g = saved.getContext("2d");
    if (!g) return;
    // A separate caption band preserves the full photograph and survives Cloud/download/report.
    g.font = `${fontSize}px sans-serif`;
    const wrapped = lines.flatMap((line) => {
      const result: string[] = []; let row = "";
      for (const word of line.split(" ")) {
        const next = row ? `${row} ${word}` : word;
        if (row && g.measureText(next).width > source.width - fontSize * 2) { result.push(row); row = word; }
        else row = next;
      }
      return [...result, row];
    });
    saved.width = source.width;
    saved.height = source.height + Math.ceil((wrapped.length + 1) * fontSize * 1.5);
    g.drawImage(source, 0, 0);
    const theme = getComputedStyle(document.documentElement);
    g.fillStyle = theme.getPropertyValue("--background").trim() || "Canvas";
    g.fillRect(0, source.height, saved.width, saved.height - source.height);
    g.fillStyle = theme.getPropertyValue("--foreground").trim() || "CanvasText";
    g.font = `${fontSize}px sans-serif`;
    wrapped.forEach((line, i) => g.fillText(line, fontSize, source.height + (i + 1.2) * fontSize * 1.5));
    // The photo is already frozen in `saved`: close the camera at once and let the JPEG encode
    // (the slow part on phones) finish in the background, then hand the file to the Lab queue.
    if (burst) {
      // Still an AI shot (its kind in the history), marked as one of a multiple shot; the camera stays open.
      const id = Date.now();
      setBurstFlash((n) => n + 1);
      hapticTick(30);
      saved.toBlob((b) => {
        if (!b) return;
        const file = new File([b], `foto-ar${tag}-multiplo-${id}.jpg`, { type: "image/jpeg" });
        setBurstShots((p) => [...p, { id, file, url: URL.createObjectURL(file) }]);
      }, "image/jpeg", 0.88);
      return;
    }
    const name = `foto-ar${tag}-${Date.now()}.jpg`;
    onClose();
    saved.toBlob(
      (b) => { if (b) onCapture([new File([b], name, { type: "image/jpeg" })]); },
      "image/jpeg",
      0.88,
    );
  };

  const record = () => {
    if (recording) {
      recRef.current?.stop();
      playCameraSound("video-stop", 1.8);
      return;
    }
    const c = canvasRef.current;
    if (!c) return;
    const out = c.captureStream(30);
    streamRef.current?.getAudioTracks().forEach((t) => out.addTrack(t));
    const type = ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"].find((m) =>
      MediaRecorder.isTypeSupported?.(m),
    );
    const rec = new MediaRecorder(out, type ? { mimeType: type } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      onCapture([
        new File([blob], `video-ar${tag}-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`, {
          type: blob.type,
        }),
      ]);
      setRecording(false);
      onClose();
    };
    rec.start(250);
    playCameraSound("video-start", 1.8);
    recRef.current = rec;
    setRecording(true);
  };

  return (
    <Dialog modal
      open={mode !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        style={{
          // Finestra sempre stabile a tutto schermo: nessuna rotazione CSS, così l'interfaccia
          // non si sposta né scompare quando il telefono ruota.
          // Sized by its four edges only: 100vw / 100dvh lag behind an Android rotation in fullscreen (one side
          // updated, the other not), which left the camera square.
          position: "fixed",
          inset: 0,
          width: "auto",
          height: "auto",
          maxWidth: "none",
          maxHeight: "none",
          transform: "none",
          translate: "none",
          scale: "none",
          margin: 0,
          borderRadius: 0,
          display: "block",
        }}
        overlayClassName="!animate-none !fixed !inset-0 !h-auto bg-camera-surface"
        className="camera-hud ar-pill-hud !animate-none overflow-hidden border-0 bg-camera-surface text-camera-ink p-0 shadow-none sm:max-h-none sm:rounded-none [&>button]:hidden"
      >
        <DialogTitle className="sr-only">
          {mode === "video" ? "Video" : "Foto"} in realtà aumentata
        </DialogTitle>
        <div ref={surfaceRef} className="ar-rotation-viewport absolute inset-0">
        <div className="ar-camera-surface absolute" data-landscape={landscape} style={{
          width: viewport.width || "100%", height: viewport.height || "100%",
          left: "50%", top: "50%", transform: `translate(-50%, -50%) rotate(${viewport.rotation}deg)`,
          // Unmeasured (0) falls back to 100dvh in the CSS instead of collapsing the panels.
          ...(viewport.height ? { "--ar-camera-height": `${viewport.height}px` } : {}),
        } as CSSProperties}>
        <CameraCloseGestures onClose={onClose} rotation={viewport.rotation} onPinch={ready && !scanning ? onPinch : undefined}>
        {error ? (
          <div className="p-5 text-sm text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">Realtà aumentata non disponibile</p>
            <p>{error}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => mode && onFallback(mode)}>
                Usa la fotocamera di sistema
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                Chiudi
              </Button>
            </div>
          </div>
        ) : (
          <div className="relative h-full w-full">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none bg-muted"
              aria-label="Anteprima in realtà aumentata"
            />
            {ready && <div className={`ar-viewfinder${subjectLocked ? " is-locked" : ""}${scanning ? " is-locking" : ""}`} aria-hidden="true"
              style={{ left: `${subject.x * 100}%`, top: `${subject.y * 100}%`, width: `${subject.w * 100}%`, height: `${subject.h * 100}%` }}>
              <span className="ar-viewfinder-corner tl" /><span className="ar-viewfinder-corner tr" />
              <span className="ar-viewfinder-corner bl" /><span className="ar-viewfinder-corner br" />
              <span className="ar-viewfinder-label">{scanning ? phaseText.tag : subjectLocked ? "Agganciato" : "Ricerca…"}</span>
              {scanning && <span className="ar-viewfinder-scan"><span className="ar-viewfinder-sweep" /></span>}
            </div>}
            {guideOpen && <div className="ar-tutorial-veil" data-camera-controls aria-hidden="true" />}
            {confirmClear && <div className="ar-confirm-veil" data-camera-controls onClick={() => { if (!emptying) setConfirmClear(false); }}>
              <div className="ar-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ar-confirm-title" aria-describedby="ar-confirm-text"
                onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") setConfirmClear(false); }}>
                <p id="ar-confirm-title" className="ar-confirm-title"><Trash2 className="size-4" aria-hidden="true" />Eliminare tutto?</p>
                <p id="ar-confirm-text" className="ar-confirm-text">Gli esemplari e {scanRecords.length === 1 ? "la scansione registrata" : `tutte le ${scanRecords.length} scansioni registrate`} nel report {kind === "urban" ? "urbano" : "vitivinicolo"} verranno eliminati.</p>
                <div className="ar-confirm-actions">
                  <TrashBin emptying={emptying} />
                  <Button type="button" variant="ghost" className="camera-tool" autoFocus disabled={emptying} onClick={() => setConfirmClear(false)}>Annulla</Button>
                  <Button type="button" variant="ghost" className="camera-tool ar-confirm-delete" disabled={emptying} onClick={confirmDelete}>{emptying ? "Eliminazione…" : "Elimina"}</Button>
                </div>
              </div>
            </div>}
            {guideOpen && <div className={`ar-tutorial ${Math.abs(viewport.rotation) === 90 ? "touch-pan-x" : "touch-pan-y"}`} data-camera-controls role="dialog" aria-label="Mini tutorial fotocamera AI"
              onPointerDown={event => {
                if (!event.isPrimary || event.pointerType === "mouse" || (event.target instanceof Element && event.target.closest("button"))) return;
                guideSwipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rotation: rotationRef.current };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={event => {
                const start = guideSwipe.current;
                guideSwipe.current = null;
                if (!start || start.id !== event.pointerId) return;
                setGuideStep(step => tutorialSwipeStep(step, tutorial.length, event.clientX - start.x, event.clientY - start.y, start.rotation));
              }}
              onPointerCancel={() => { guideSwipe.current = null; }}>
              <button type="button" className="ar-tutorial-close" onClick={closeGuide} aria-label="Chiudi tutorial"><X className="size-4" /></button>
              <div className="ar-tutorial-slides">
              <div className="ar-tutorial-track" style={{ transform: `translateX(-${guideStep * 100}%)` }}>
              {tutorial.map((slide, index) => <div className="ar-tutorial-slide" key={slide.title} aria-hidden={index !== guideStep}>
              <div className="ar-tutorial-demo" data-step={index} aria-hidden="true">
                <span className="ar-demo-target"><span /><span /><span /><span /></span>
                <span className="ar-demo-sweep" />
                <span className="ar-demo-balance"><span /></span>
                <span className="ar-demo-shutter" />
              </div>
              <div className="ar-tutorial-icon" aria-hidden="true">
                {index === 0 ? <ScanSearch className="size-5" /> : index === 1 ? <Info className="size-5" /> : index === 2 ? <Flame className="size-5" /> : <Zap className="size-5" />}
              </div>
              <div className="ar-tutorial-step">
                <p className="ar-tutorial-title">{slide.title.replace(/^\d+ · /, "")}</p>
                <p className="ar-tutorial-text">{slide.text}</p>
              </div>
              </div>)}
              </div>
              </div>
              <div className="ar-tutorial-dots" aria-label={`Passo ${guideStep + 1} di ${tutorial.length}`}>
                {tutorial.map((_, i) => <span key={i} data-active={i === guideStep} />)}
              </div>
              <div className="ar-tutorial-actions">
                {guideStep > 0
                  ? <Button variant="ghost" size="sm" className="camera-tool" onClick={() => setGuideStep(s => s - 1)}>Indietro</Button>
                  : <Button variant="ghost" size="sm" className="camera-tool" onClick={closeGuide}>Salta</Button>}
                {guideStep < tutorial.length - 1
                  ? <Button size="sm" className="ar-tutorial-next" onClick={() => setGuideStep(s => s + 1)}>Avanti</Button>
                  : <Button size="sm" className="ar-tutorial-next" onClick={closeGuide}>Inizia</Button>}
              </div>
            </div>}
            {thermalInfoOpen && <>
              <div className="ar-thermal-info-veil" data-camera-controls aria-hidden="true" onPointerDown={() => setThermalInfoOpen(false)} />
              <div className="ar-thermal-info" data-camera-controls role="dialog" aria-label="Come leggere la stima termica">
                <button type="button" className="ar-tutorial-close" onClick={() => setThermalInfoOpen(false)} aria-label="Chiudi spiegazione"><X className="size-4" /></button>
                <div className="ar-thermal-info-icon" aria-hidden="true"><Flame className="size-5" /></div>
                <p className="ar-tutorial-title">Come leggere la stima termica</p>
                <p className="ar-thermal-info-text">È una <strong>stima microclimatica modellata</strong> su chioma e dati meteo locali: lo smartphone non dispone di un sensore termico, quindi il rilevamento <strong>non è radiometrico</strong> e non misura la temperatura reale.</p>
                <p className="ar-thermal-info-text">Per il valore reale puoi collegare al dispositivo un <strong>sensore termico USB-C</strong> (per esempio telecamere termiche o sonde per il suolo): l'app rimane il supporto di sopralluogo, la misura spetta allo strumento.</p>
                <Button size="sm" className="ar-thermal-info-close" onClick={() => setThermalInfoOpen(false)}>Ho capito</Button>
              </div>
            </>}
            <span className="sr-only" role="status">{subjectLocked ? "Agganciato" : ""}</span>
                        {scanning && <div className="ar-scan-overlay" role="status" aria-label="Scansione pianta e terreno in corso">
              <div className="ar-scan-ground"><span className="ar-scan-line" /><span className="ar-scan-label">{scanStatus}<small>{scanPhase === "leaf" ? "1 / 2" : "2 / 2"}</small></span></div>
            </div>}
            <CameraCenterCapture tabletOnly onCapture={mode === "photo" ? shoot : record} disabled={!ready || scanning || xrActive} label={mode === "photo" ? "Scatta foto AR" : recording ? "Ferma registrazione" : "Avvia registrazione AR"} />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                Avvio fotocamera…
              </div>
            )}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background/50 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent" />
            <div data-camera-hud className="ar-camera-topbar">
              <div className="ar-camera-actions flex shrink-0 gap-1" data-camera-controls>
                <div className="ar-focus-wrap">
                {/* Scans recorded for this flow's report: a badge on the first section pill, taking no row width. */}
                {(() => {
                  // Follows the summary pager: "2/5" is the scan on view, the bare total when there is one or none.
                  const onRecord = scanRecords.length > 1 && viewPage >= 0 && viewPage < scanRecords.length;
                  return <span className="ar-scan-counter" role="status" aria-label={onRecord ? `Scansione ${viewPage + 1} di ${scanRecords.length}` : `${scanRecords.length} ${scanRecords.length === 1 ? "scansione registrata" : "scansioni registrate"} nel report`} title="Scansioni registrate nel report">{onRecord ? `${viewPage + 1}/${scanRecords.length}` : scanRecords.length}</span>;
                })()}
                <div className="ar-focus-options" role="radiogroup" aria-label={kind === "urban" ? "Obiettivo camera urbana" : "Obiettivo camera vitivinicola"}>
                  {/* Switching section stops any running scan and clears the previous result. */}
                  {AR_FOCUS[kind].map(o => <Button variant="ghost" size="sm" key={o.id} type="button" role="radio" aria-label={o.label} title={o.label} aria-checked={arFocusOption(kind, target).id === o.id} className="camera-tool ar-focus-pill" onClick={() => selectTarget(o.id)}>{FOCUS_LABELS[o.id]}</Button>)}
                </div>
                </div>
                {(found || species || viewedRecord) && !scanning && <Button variant="ghost" size="sm" aria-label="Mostra esito analisi" title="Mostra esito analisi" className="camera-tool ar-esito-chip" onClick={() => { setToolsOpen(true); setActiveTool("analysis"); setPanelOpen(true); }}><Activity className="size-4 shrink-0" />Esito</Button>}
                <Button variant="ghost" size="icon" className="camera-tool size-11" aria-label="Guida inquadratura" title="Guida inquadratura" aria-pressed={guideOpen} onClick={() => setGuideOpen(v => !v)}><Info className="size-4" /></Button>
                {torchSupported && <Button variant="ghost" size="icon" className="camera-tool size-11" disabled={torchBusy || scanning} aria-pressed={torchOn} aria-label={torchOn ? "Disattiva flash" : "Attiva flash"} title={torchOn ? "Disattiva flash" : "Attiva flash"} onClick={() => void toggleTorch()}>{torchOn ? <Zap className="size-4" /> : <ZapOff className="size-4" />}</Button>}
                <Button variant="ghost" size="icon"
                  type="button"
                  onClick={onClose}
                  disabled={recording}
                  aria-label="Chiudi"
                  className="camera-tool grid size-11 place-items-center disabled:opacity-40"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            {thermalSummary}
            {torchError && <p className="ar-flash-error" role="status" data-camera-controls>{torchError}</p>}
            {toolsOpen && activeTool === "manage" && layers.has("heat") && (
              <div role="button" tabIndex={0} data-camera-controls aria-label="Come leggere la mappa termica simulata" onClick={() => setThermalInfoOpen(true)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setThermalInfoOpen(true); } }} className="ar-heat-legend">
                <span>Simulata</span><span>Caldo</span>
                <span className="h-24 w-2 rounded-full bg-[image:var(--ar-thermal-scale)]" />
                <span>Fresco</span>
              </div>
            )}
            <div
              data-camera-hud
              className={`camera-bottom absolute z-20 flex flex-col items-center ${landscape ? "gap-1.5" : "gap-3"}`}
            >
              <div id="ar-camera-tools" hidden={!toolsOpen} className="w-full">
              {toolsOpen && <div className="ar-tools-panel flex w-full flex-col items-center gap-2">
              <div className="ar-tool-options" data-camera-controls>
                <Button variant="ghost" size="sm" className="camera-tool" title="Analisi" aria-label="Analisi" aria-pressed={activeTool === "analysis"} onClick={() => { setActiveTool(v => v === "analysis" ? null : "analysis"); setPanelOpen(true); }}><Info className="size-4" />Analisi</Button>
                <Button variant="ghost" size="sm" className="camera-tool" title="Livelli AR" aria-label="Livelli AR" aria-pressed={activeTool === "manage"} onClick={() => { setActiveTool(v => v === "manage" ? null : "manage"); setLayers(s => new Set(s).add("grid")); }}><SlidersHorizontal className="size-4" />AR</Button>
              {activeTool === "manage" && <div className="flex items-center gap-2" data-camera-controls>
                <Button variant="ghost" size="icon" className="camera-tool" aria-label="Mostra griglia" title="Griglia" aria-pressed={layers.has("grid")} onClick={() => toggle("grid")}><Grid2X2 className="size-4" /></Button>
                <Button variant="ghost" size="icon" className="camera-tool" aria-label="Mappa termica simulata" title="Calore simulato" aria-pressed={layers.has("heat")} onClick={() => { if (!layers.has("heat")) setThermalInfoOpen(true); toggle("heat"); }}><Flame className="size-4" /></Button>
              </div>}
              </div>
              {!torchSupported && <p className="text-xs text-muted-foreground">Flash non supportato su questa fotocamera.</p>}
              {(species || soil || found || survey || viewedRecord) && activeTool === "analysis" && panelOpen && panelMin && (
                <Button variant="ghost" type="button" data-camera-controls
                  className="ar-analysis-min"
                  onClick={() => setPanelMin(false)}
                  aria-label="Espandi esito analisi" title="Espandi esito analisi">
                  <Info className="size-3.5" /><span>Esito analisi</span><ChevronUp className="size-3.5" />
                </Button>
              )}
              {(species || soil || found || survey || viewedRecord) && activeTool === "analysis" && panelOpen && !panelMin && (
                <div className="relative w-[min(92%,24rem)]">
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPanelMin(true)}
                      aria-label="Minimizza esito analisi"
                      title="Minimizza esito analisi"
                      className="grid size-7 place-items-center rounded-full bg-background/80 backdrop-blur-md"
                    >
                      <ChevronDown className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => { setPanelOpen(false); setActiveTool(null); }}
                      aria-label="Chiudi esito analisi"
                      title="Chiudi esito analisi"
                      className="grid size-7 place-items-center rounded-full bg-background/80 backdrop-blur-md"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  <div
                    data-camera-scroll
                    className="max-h-[32dvh] overflow-y-auto rounded-lg bg-background/95 px-3 py-3 pr-9 text-xs leading-relaxed backdrop-blur-md"
                    aria-live="polite"
                  >
                  {viewedRecord ? recordEsito(viewedRecord) : <>
                  <EsitoPhoto scan={realPhoto} reference={species?.photo ?? null} name={species?.commonName ?? null} />
                  {species ? (
                    <p>
                      <span className="text-sm font-semibold">{species.commonName}</span>{" "}
                      <span className="italic text-muted-foreground">{species.scientificName}</span>
                      {species.cooling && (
                        <span className="mt-1 block font-semibold text-primary">Raffrescamento stimato {coolingLabel(species.cooling.deltaT)} · ombra ≈ {species.cooling.shadeM2} m²</span>
                      )}
                    </p>
                  ) : (
                    found && <p>{found}</p>
                  )}
                  {identificationBadge}
                  {species?.identification && <p className="mt-1 text-muted-foreground">{species.identification.evidence}</p>}
                  {soil && (
                    <p className="text-muted-foreground">
                      Terreno {soil.label} · permeabilità {soil.permeability} ·{" "}
                      <span className={soil.plantable ? "text-primary" : "text-destructive"}>
                        {soil.plantable ? "potenzialmente piantabile" : "superficie non idonea"}
                      </span>
                    </p>
                  )}
                  {survey && <dl className="mt-2 space-y-1">
                    <div><dt className="font-semibold">Consistenza apparente</dt><dd className="text-muted-foreground">{survey.consistency}</dd></div>
                    <div><dt className="font-semibold">Calore / esposizione</dt><dd className="text-muted-foreground">{survey.heatNote}</dd></div>
                    <div><dt className="font-semibold">Temperatura del terreno</dt><dd className="text-muted-foreground">Non misurata · serve una sonda termica</dd></div>
                  </dl>}
                  {soil?.note && <p className="text-muted-foreground">{soil.note}</p>}
                  <p className="mt-1 text-muted-foreground">Identificazione e suolo: stime visive, non analisi strumentali.</p>
                  {found && species && <p role="status">{found}</p>}
                  {species && (
                    <p className="text-muted-foreground">
                      Stima indicativa · piano virtuale
                      {species.family && <>{" · "}{species.family}</>}
                      {species.colUrl && (
                        <>
                          {" · "}
                          <a href={species.colUrl} target="_blank" rel="noreferrer" className="underline">Scheda della specie</a>
                        </>
                      )}
                      {species.gbifUrl && (
                        <>
                          {" · "}
                          <a href={species.gbifUrl} target="_blank" rel="noreferrer" className="underline">Osservazioni</a>
                        </>
                      )}

                    </p>
                  )}
                  </>}
                  </div>
                </div>
              )}
              {activeTool === "manage" && (count > 0 || scanRecords.length > 0) && <div className="flex flex-wrap items-center justify-center gap-2" data-camera-controls>
                {count > 0 && <Button variant="ghost" size="sm" className="camera-tool" onClick={removeLast} title="Elimina ultimo elemento"><Undo2 className="size-4" />Annulla</Button>}
                {(count > 1 || scanRecords.length > 0) && <Button variant="ghost" size="sm" className="camera-tool text-destructive" onClick={removeAll} title="Elimina esemplari e tutte le scansioni registrate"><Trash2 className="size-4" />Elimina tutti</Button>}
              </div>}
              </div>}
              </div>
               {!toolsOpen && specimenDock}
               {!toolsOpen && (() => {
                // Three chips: the neighbouring lenses on the sides, the live value in the centre (tap = back to 1×).
                const lower = [...ZOOM_LENSES].reverse().find((l) => l < zoom - 0.05);
                const higher = ZOOM_LENSES.find((l) => l > zoom + 0.05);
                const side = (lens: number | undefined, label: string) => <button type="button" className="ar-zoom-lens"
                  aria-label={lens === undefined ? label : `${label}: ${zoomLabel(lens)}`} disabled={lens === undefined || !ready || scanning}
                  onClick={() => lens !== undefined && setZoom(lens)}>{lens ?? "·"}</button>;
                return <div className="ar-zoom-lenses" role="group" aria-label="Zoom della fotocamera" data-camera-controls>
                  {side(lower, "Riduci zoom")}
                  <button type="button" className="ar-zoom-lens" data-active aria-label={`Zoom ${zoomLabel(zoom)}: tocca per tornare a 1×`}
                    disabled={!ready || scanning} onClick={() => setZoom(1)}>{zoomLabel(zoom)}</button>
                  {side(higher, "Aumenta zoom")}
                </div>;
              })()}
               <CameraCaptureControl mode={mode ?? "photo"} recording={recording} ar disabled={!ready || scanning || xrActive} onCapture={mode === "photo" ? shoot : record} left={<div className="camera-labelled-tool ar-scan-tools">
                <Button variant="ghost" size="icon"
                  type="button"
                  data-no-ui-click
                  onClick={() => void scan()}
                  disabled={!ready || scanning || recording}
                  aria-label="Scansiona terreno e pianta"
                  title="Scansiona terreno e pianta"
                  className={`camera-tool size-11 disabled:opacity-40${scanning ? " is-compact" : ""}`}
                >
                  <ScanSearch className={`size-5 ${scanning ? "animate-pulse text-primary" : ""}`} />{!scanning && <span>Scansiona</span>}
                 </Button>
                {/* While scanning the scan button shrinks to its icon and a stop icon sits beside it. */}
                {scanning && <Button variant="ghost" size="icon" type="button" onClick={cancelScan} aria-label="Termina scansione" title="Termina scansione" className="camera-tool is-compact">
                  <Square className="size-4 fill-current" />
                </Button>}
</div>} right={<div className="camera-labelled-tool">
                <Button variant="ghost" size="icon"
                  type="button"
                  onClick={() => { setToolsOpen((open) => !open); setActiveTool("analysis"); setPanelOpen(true); }}
                  aria-expanded={toolsOpen}
                  aria-controls="ar-camera-tools"
                  aria-label={toolsOpen ? "Nascondi strumenti" : "Mostra strumenti"}
                  title={toolsOpen ? "Nascondi strumenti" : "Mostra strumenti"}
                  className="camera-tool size-11"
                >
                  <SlidersHorizontal className="size-5" /><span>Strumenti</span>
                </Button>
              </div>} />
              <p className="ar-start-swipe-hint" data-visible={swipeHint} role="status" aria-hidden={!swipeHint}>
                Fai uno swipe dal basso verso l’alto per chiudere.
              </p>
            </div>
          </div>
        )}
        {/* Singolo | Multiplo for photos, and while shooting the strip of the shots kept with "Fine · n". */}
        {!error && mode === "photo" && (
          <div className="ar-burst-bar" data-camera-controls>
            {burstFlash > 0 && <div key={burstFlash} className="burst-flash pointer-events-none fixed inset-0 bg-white" aria-hidden="true" />}
            {burst && burstShots.length > 0 && (
              <div data-map-gestures className="flex max-w-[min(22rem,90vw)] touch-pan-x gap-1.5 overflow-x-auto px-1 pt-2 [scrollbar-width:none]">
                {burstShots.map((s, i) => (
                  <span key={s.id} className="relative shrink-0">
                    <img src={s.url} alt={`Foto ${i + 1}`} className="size-11 rounded-md object-cover ring-1 ring-white/50" />
                    <button type="button" onClick={() => dropBurstShot(s.id)} aria-label={`Togli la foto ${i + 1}`} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/40"><X className="size-3" aria-hidden="true" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label="Tipo di scatto" className="flex rounded-full bg-black/55 p-0.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur">
                <button type="button" role="radio" aria-checked={!burst} disabled={burstShots.length > 0} onClick={() => setBurst(false)} className={`h-8 rounded-full px-3 ${!burst ? "bg-white text-black" : ""} disabled:opacity-50`}>Singolo</button>
                <button type="button" role="radio" aria-checked={burst} onClick={() => setBurst(true)} className={`h-8 rounded-full px-3 ${burst ? "bg-white text-black" : ""}`}>Multiplo</button>
              </div>
              {burst && burstShots.length > 0 && (
                <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1 rounded-full bg-white px-3.5 text-xs font-semibold text-black">
                  <Check className="size-3.5" aria-hidden="true" />Fine · {burstShots.length}
                </button>
              )}
            </div>
            <span className="sr-only" role="status" aria-live="polite">{burst ? `${burstShots.length} foto scattate` : ""}</span>
          </div>
        )}
        </CameraCloseGestures>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Palette termica (blu → ciano → giallo → arancio → rosso) */
const PAL: [number, number, number][] = [
  [30, 64, 175], [6, 182, 212], [250, 204, 21], [249, 115, 22], [220, 38, 38],
];
const LUT = (() => {
  const t = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const f = (i / 255) * (PAL.length - 1), k = Math.min(PAL.length - 2, Math.floor(f)), u = f - k;
    for (let c = 0; c < 3; c++) t[i * 3 + c] = (PAL[k]?.[c] ?? 0) + ((PAL[k + 1]?.[c] ?? 0) - (PAL[k]?.[c] ?? 0)) * u;
  }
  return t;
})();
let tmp: HTMLCanvasElement | null = null;

/**
 * Visore termico simulato: luminosità e saturazione del fotogramma stimano l'irraggiamento
 * (superfici chiare/esposte = più calde, verde = più fresco); ogni albero piantato raffresca l'area attorno.
 */
function thermal(g: CanvasRenderingContext2D, w: number, h: number, taps: { x: number; y: number }[], cooling: PlacementCooling[]) {
  const W = 120, H = Math.round((120 * h) / w);
  tmp ??= document.createElement("canvas");
  if (tmp.width !== W || tmp.height !== H) { tmp.width = W; tmp.height = H; }
  const t = tmp.getContext("2d", { willReadFrequently: true });
  if (!t) return;
  t.drawImage(g.canvas, 0, 0, W, H);
  const img = t.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = d[i] ?? 0, gr = d[i + 1] ?? 0, b = d[i + 2] ?? 0;
      let v = (0.45 * r + 0.35 * gr + 0.2 * b) / 255;
      if (gr > r && gr > b) v -= 0.25; // vegetazione più fresca
      v += (y / H) * 0.15; // suolo in basso più caldo
      for (const [index, p] of taps.entries()) {
        const dx = x / W - p.x, dy = (y / H - p.y) * 1.6, q = dx * dx + dy * dy;
        v -= Math.min(3, cooling[index]?.deltaT ?? 0) / 3 * 0.55 * Math.exp(-q / 0.012);
      }
      const k = Math.max(0, Math.min(255, Math.round(v * 255))) * 3;
      d[i] = LUT[k] ?? 0; d[i + 1] = LUT[k + 1] ?? 0; d[i + 2] = LUT[k + 2] ?? 0;
    }
  t.putImageData(img, 0, 0);
  g.save();
  g.imageSmoothingEnabled = true;
  g.globalAlpha = 0.85;
  g.drawImage(tmp, 0, 0, w, h);
  g.restore();
}

/**
 * Esito photo: the scan's own photo is the main picture; the species' reference photo of the whole plant from
 * the botanical database (Kew, else GBIF) sits in a large corner frame, uncropped so the plant stays readable,
 * credited by a plain caption (no link). Either one alone fills the frame when the other is missing.
 */
function EsitoPhoto({ scan, reference, name }: { scan: string | null; reference: ReferencePhoto | null; name: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  const ref = reference && reference.url !== failed ? reference : null;
  if (!scan && !ref) return null;
  const plant = name ?? "pianta scansionata";
  const refImg = (className: string) => ref && <img src={ref.url} alt={`Foto di riferimento: ${plant}`} className={className} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(ref.url)} />;
  return (
    <figure className="ar-esito-photo">
      <div className="relative">
        {scan ? <img src={scan} alt={`Foto reale: ${plant}`} className="ar-real-photo" /> : refImg("ar-real-photo is-reference")}
        {scan && refImg("ar-esito-reference-inset")}
      </div>
      <figcaption className="text-muted-foreground">
        {scan ? "Foto della scansione" : null}{scan && ref ? " · nel riquadro " : null}{ref ? `${scan ? "foto" : "Foto"} di riferimento · ${ref.credit}` : null}
      </figcaption>
    </figure>
  );
}

/** Real photo of the scanned plant: the recognition frame cropped to the detection box with a small margin. */
function cropRealPhoto(frame: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, maxSide = 640, quality = 0.85): string | null {
  const m = 0.06;
  const x = Math.max(0, box.x - m), y = Math.max(0, box.y - m);
  const w = Math.min(1 - x, box.w + 2 * m), h = Math.min(1 - y, box.h + 2 * m);
  const sw = w * frame.width, sh = h * frame.height;
  if (sw < 8 || sh < 8) return null;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const out = document.createElement("canvas");
  out.width = Math.round(sw * scale); out.height = Math.round(sh * scale);
  const g = out.getContext("2d");
  if (!g) return null;
  g.drawImage(frame, x * frame.width, y * frame.height, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", quality);
}

/** Big bin beside Annulla; while emptying, the lid lifts and the files fly out until the deletion ends. */
function TrashBin({ emptying }: { emptying: boolean }) {
  return (
    <svg className="ar-confirm-bin" data-emptying={emptying || undefined} viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <g className="ar-bin-files">
        <rect className="ar-bin-file" x="16.5" y="28" width="6" height="8" rx="1" />
        <rect className="ar-bin-file" x="21" y="25" width="6" height="8" rx="1" />
        <rect className="ar-bin-file" x="25.5" y="28" width="6" height="8" rx="1" />
      </g>
      <path className="ar-bin-body" d="M12.5 20h23l-2.2 21.2a3 3 0 0 1-3 2.8H17.7a3 3 0 0 1-3-2.8Z" />
      <g className="ar-bin-lid">
        <path d="M10 17h28" />
        <path d="M20 17v-2.5a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5V17" />
      </g>
    </svg>
  );
}


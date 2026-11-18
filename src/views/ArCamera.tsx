import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import "@/styles/ar-camera.css";
import { isTouchDevice } from "@/lib/touch-device";
import { isTabletViewport } from "@/lib/tablet-camera";
import { ArLive, requestArSession, type FanGroup } from "@/views/ArLive";
import { ScanSheet } from "@/views/ScanSheet";
import { recognisedPlants, type PlacedObject } from "@/models/ar-objects";
import { toast } from "sonner";
import { Check, ClipboardList, PanelBottomOpen, History, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flame, Info, Grape, Leaf, Rows3, Shovel, TreeDeciduous, Snowflake, Umbrella, Plus, ScanSearch, Square, Trash2, Undo2, X, Zap, ZapOff } from "lucide-react";
import { supportsCameraTorch, setCameraTorch, probeCameraTorch } from "@/lib/camera-torch";
import { detectArObject, getReferencePhoto, type Detection, type Soil } from "@/controllers/ar-detect.functions";
import { gbifPhotoSearchUrl, pickGbifPhoto, type ReferencePhoto } from "@/models/ar-reference-photo";
import { findSubject, frameUsable, SEARCH_BOX, smoothBox, type SubjectBox } from "@/lib/ar-subject-tracker";
import { extractPlantPhoto } from "@/views/ar-plant-photo";

type D = NonNullable<Detection>;
const BIN_EMPTY_MS = 1100;
/** Scan uploads: main frame, leaf close-up and the smaller retry frame (longest side, px). */
const SCAN_IMAGE_PX = 1024, SCAN_DETAIL_PX = 640, SCAN_RETRY_PX = 800;
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
import { AR_FOCUS, arFocusOption, defaultArFocus, foundFocus, scanMissing, scanPrecheck, selectableFocus, type ArFocus } from "@/models/ar-focus";
import type { ArScene } from "@/views/ar-scene";
import { Button } from "@/components/ui/button";
import { drawCameraVideo, freezeCameraFrame, paintArFrame } from "@/lib/ar-frame";
import { startArFrameLoop } from "@/lib/ar-frame-loop";
import { captureSummaryLines } from "@/models/ar-capture-summary";
import { isArCoreSupported, createArCoreManager, type ArCoreManager } from "@/lib/arcore";
import { addFind, findFromScan, placedText, useFieldFinds, type FindKind } from "@/models/field-finds";
import { readFix, smallThumb } from "@/lib/find-position";
import { getLab } from "@/models/lab-store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cameraViewport, groundTilt, resetAppOrientation, setArOrientationActive, shortestRotationDelta } from "@/lib/ar-orientation";
import { CameraCloseGestures } from "@/views/CameraCloseGestures";
import { tutorialSwipeStep } from "@/lib/ar-tutorial-swipe";
import { CameraCenterCapture } from "@/views/CameraCenterCapture";
import { CameraCaptureControl } from "@/views/CameraCaptureControl";
import { useHoldBurst } from "@/lib/hold-burst";
import { BurstReviewSheet, type BurstShot } from "@/views/BurstReview";
import { ZoomDial } from "@/views/ZoomDial";
import { ArcZoomDial } from "@/views/ArcZoomDial";
import { playAiShutter, playCameraSound, preloadAiShutter, startScanLoop } from "@/lib/camera-sounds";
import { useLab } from "@/models/lab-store";
import { createTrackZoomer, pinchZoom, splitZoom, trackZoomRange, zoomHaptic, ZOOM_MAX, ZOOM_MIN } from "@/lib/camera-zoom";
import { hapticTick } from "@/lib/haptics";
import { satelliteContext, satelliteLine, type SatelliteContext } from "@/models/copernicus";
import { loadCopernicus } from "@/views/copernicus-client";
import { coolingLabel, scannedSpecimenThermal, scannedSpecimenCount, type PlacementCooling } from "@/models/ar-placement";
import { clearScans, recordScan, removeScans, scanPhoto, setScanSpeciesPhoto, updateScan, useArScans, type ScanRecord } from "@/models/ar-scan-log";
import { cameraRotatesNatively, enterCameraChrome, exitCameraChrome, fullscreenExitIsBack, regainFullscreen } from "@/lib/camera-chrome";

type Mode = "photo" | "video";
type Layer = "objects";
/** How long the scan runs visibly before stopping when the frame has nothing to analyse. */
const PRECHECK_SCAN_MS = 1200;
const FOCUS_LABELS = { auto: "Piante e suolo", tree: "Vegetazione", ground: "Suolo", leaf: "Foglia", canopy: "Chioma", interrow: "Interfila" };
/** What to scan, as an icon only (the name stays for screen readers and as a tooltip). */
const FOCUS_ICONS = { auto: ScanSearch, tree: TreeDeciduous, ground: Shovel, leaf: Leaf, canopy: Grape, interrow: Rows3 };

const URBAN_TUTORIAL = [
  { title: "1 · Inquadra", text: "Inquadra un albero della piazza, oppure il suolo davanti a te: la fotocamera capisce da sola cosa c’è." },
  { title: "2 · Scansiona", text: "Avvia la scansione: della pianta trovi specie e ombra, del suolo permeabilità e depavimentazione: sopra lo scatto compare la scheda con «Aggiungi al progetto», e gli esiti completi finiscono nel cassetto «Scansioni», a destra dello scatto, dove puoi riaprirli o eliminarne più insieme." },
  { title: "3 · AR", text: "In alto passa da «Rileva» ad «AR». Il pulsante AI apre «Cosa vuoi fare?»: scegli un intervento o una pianta riconosciuta e tocca il pavimento per posarla a grandezza vera." },
  { title: "4 · Sposta e ruota", text: "Trascina un oggetto con un dito; con due dita lo ruoti e lo ingrandisci. Con «Sposta» segue il mirino e gira con il telefono. Il telefono vibra a ogni mezzo metro e ogni 15°, più forte davanti a un ostacolo." },
  { title: "5 · Unisci e riporta", text: "Avvicina due pergolati o due aiuole: il contorno diventa verde e si uniscono. «Modellino» prova tutto in piccolo, «Riporta» li manda sulla mappa; con l’area allineata vedi anche gli interventi della mappa al loro posto." },
  { title: "6 · Scatta", text: "Tocca per una foto, tieni premuto per uno scatto multiplo: foto e video vanno nel progetto e nei report della piazza." },
] as const;

const TUTORIAL = [
  { title: "1 · Inquadra", text: "Avvicinati a 20–30 cm da una foglia o dalla chioma: il mirino si aggancia da solo alla vegetazione." },
  { title: "2 · Scansiona", text: "Avvia la scansione: prima la forma della foglia, poi il confronto botanico e la stima del terreno. Gli esiti finiscono nel cassetto «Scansioni», a destra dello scatto, dove puoi riaprirli o eliminarne più insieme." },
  { title: "3 · AR", text: "In alto passa da «Rileva» ad «AR». Il pulsante AI apre «Cosa vuoi fare?»: scegli irrigazione, teli d’ombra, frangivento o una pianta riconosciuta e tocca il pavimento per posarla." },
  { title: "4 · Sposta e ruota", text: "Trascina un oggetto con un dito; con due dita lo ruoti e lo ingrandisci. Con «Sposta» segue il mirino e gira con il telefono. Il telefono vibra a ogni mezzo metro e ogni 15°, più forte davanti a un ostacolo." },
  { title: "5 · Riporta", text: "«Modellino» prova tutto in piccolo, «Riporta» manda gli oggetti sulla mappa del vigneto; con l’area allineata vedi anche gli interventi della mappa al loro posto." },
  { title: "6 · Scatta", text: "Tocca per una foto, tieni premuto per uno scatto multiplo: foto e video vanno nel progetto e nei report del vigneto." },
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
  const [burstShots, setBurstShots] = useState<BurstShot[]>([]);
  const [bestShotId, setBestShotId] = useState<number | null>(null);
  const burstRef = useRef(burstShots);
  burstRef.current = burstShots;
  const bestShotIdRef = useRef(bestShotId);
  bestShotIdRef.current = bestShotId;
  const [burstFlash, setBurstFlash] = useState(0);
  // The review sheet's actions, defined further down, reached from the AR view built before them.
  const burstActs = useRef({ add: () => {}, discardAll: () => {} });
  // Review sheet of the multiple shot: shots tapped there are set aside and left out when the rest is added.
  const [discarded, setDiscarded] = useState<Set<number>>(() => new Set());
  const discardedRef = useRef(discarded);
  discardedRef.current = discarded;

  const getOrderedShots = () => {
    const taken = burstRef.current.filter((s) => !discardedRef.current.has(s.id));
    if (!taken.length) return [];
    const currentBest = bestShotIdRef.current;
    const best = taken.find((s) => s.id === currentBest);
    const others = taken.filter((s) => s.id !== currentBest);
    return best ? [best, ...others] : taken;
  };

  const onClose = useCallback(() => {
    const ordered = getOrderedShots();
    if (ordered.length) {
      onCapture(ordered.map((s) => s.file));
      burstRef.current = [];
      setBurstShots([]);
      setBestShotId(null);
    }
    setBurst(false);
    closeCamera();
  }, [closeCamera, onCapture]);

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
  const [zoomRulerActive, setZoomRulerActive] = useState(false);
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
  const [panelMin, setPanelMin] = useState(false);
  // L'esito dell'analisi si può chiudere senza perdere i dati: si riapre con un tocco.
  const [panelOpen, setPanelOpen] = useState(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  // «Scansioni» (the button bottom right in Rileva): the AR's own sheet with the last result, the scans made and
  // Elimina tutto. Analisi, Livelli and the simulated heat map are gone (2026-11-18).
  const [scanSheet, setScanSheet] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  // The flash the person turned on, kept when the camera restarts by itself (the watchdog): put back on the new one.
  const torchKeepRef = useRef(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [torchError, setTorchError] = useState<string | null>(null);

  // Info banner state: slide to dismiss & clear searches
  const [infoBannerDismissed, setInfoBannerDismissed] = useState(false);
  const [infoBannerDragY, setInfoBannerDragY] = useState(0);
  const [infoBannerDragging, setInfoBannerDragging] = useState(false);
  const infoBannerStartRef = useRef<{ id: number; y: number; x: number } | null>(null);

  useEffect(() => {
    if (species || soil || survey) {
      setInfoBannerDismissed(false);
    }
  }, [species, soil, survey]);


  const onBannerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    infoBannerStartRef.current = { id: e.pointerId, y: e.clientY, x: e.clientX };
    setInfoBannerDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onBannerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!infoBannerStartRef.current || infoBannerStartRef.current.id !== e.pointerId) return;
    const dy = e.clientY - infoBannerStartRef.current.y;
    setInfoBannerDragY(dy);
  };

  const onBannerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!infoBannerStartRef.current || infoBannerStartRef.current.id !== e.pointerId) return;
    const dy = e.clientY - infoBannerStartRef.current.y;
    const dx = e.clientX - infoBannerStartRef.current.x;
    infoBannerStartRef.current = null;
    setInfoBannerDragging(false);
    if (dy > 30 || Math.abs(dx) > 35) {
      setInfoBannerDismissed(true);
      hapticTick();
    }
    setInfoBannerDragY(0);
  };
  // Only the scanned photographic cutout can be placed; no geometric tree templates.

  const last = useRef<Parameters<ArScene["place"]> | null>(null);
  // Integrazione ARCore / WebXR per tracciamento superfici reali
  const [arCoreSupported, setArCoreSupported] = useState(false);
  const [, setArCoreActive] = useState(false);
  const arCoreRef = useRef<ArCoreManager | null>(null);
  // «Prova» live: the WebXR session (null = the preview without ARCore) and the element its overlay lives in.
  const [liveAr, setLiveAr] = useState<{ session: XRSession | null; root: HTMLElement; n?: number; why?: string; torch?: boolean; carry?: PlacedObject[] } | null>(null);
  const restartingRef = useRef(false);
  const [camEpoch, setCamEpoch] = useState(0);
  // Restarts asked because the camera came back without frames (ARCore still releasing it): a few, then the error.
  const stallRetriesRef = useRef(0);
  // Bumped when a camera stream arrives, so the AR view (which reads streamRef) gets the new stream and its torch.
  const [, setStreamN] = useState(0);
  const [onPhone, setOnPhone] = useState(false);
  useEffect(() => {
    const sync = () => setOnPhone(isTouchDevice() && !isTabletViewport(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  const liveHostRef = useRef<HTMLDivElement>(null);
  const liveArRef = useRef(liveAr);
  const endLiveRef = useRef<() => void>(() => undefined);
  liveArRef.current = liveAr;
  // Closing the camera ends the live AR too (the session would keep the camera).
  useEffect(() => () => { void liveArRef.current?.session?.end().catch(() => undefined); liveArRef.current?.root.remove(); }, []);
  useEffect(() => { if (mode === null && liveArRef.current) { void liveArRef.current.session?.end().catch(() => undefined); liveArRef.current.root.remove(); setLiveAr(null); } }, [mode]);
  const liveRootEl = () => {
    const root = document.createElement("div");
    root.className = "ar-live-root";
    root.style.cssText = "position:fixed;inset:0;z-index:2147483000";
    (liveHostRef.current ?? document.body).appendChild(root);
    return root;
  };

  useEffect(() => {
    let active = true;
    void isArCoreSupported().then((supported) => {
      if (supported && active) {
        setArCoreSupported(true);
        const mgr = createArCoreManager();
        arCoreRef.current = mgr;
        mgr.subscribeStatus((st) => {
          if (active) setArCoreActive(st === "active");
        });
        if (sceneRef.current) {
          sceneRef.current.setArCoreManager?.(mgr);
        }
      }
    });
    return () => {
      active = false;
      void arCoreRef.current?.stopSession();
      arCoreRef.current = null;
    };
  }, []);

  const arTransitionRef = useRef(false);


  const xrActive = false;
  // Eye tracking del soggetto: il mirino cerca e segue la pianta dal primo fotogramma.
  const subjectRef = useRef<SubjectBox>(SEARCH_BOX);
  const viewfinderRef = useRef<HTMLDivElement>(null);
  const [subjectLocked, setSubjectLocked] = useState(false);
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
    try { localStorage.setItem((kind === "urban" ? "ar-tutorial-seen-urban-v3" : "ar-tutorial-seen-v3"), "1"); } catch { /* storage non disponibile */ }
  };
  useEffect(() => {
    if (!mode || !ready) return;
    try { if (!localStorage.getItem((kind === "urban" ? "ar-tutorial-seen-urban-v3" : "ar-tutorial-seen-v3"))) { setGuideStep(0); setGuideOpen(true); } } catch { setGuideOpen(true); }
  }, [mode, ready]);
  const [scanPhase, setScanPhase] = useState<"leaf" | "catalogue">("leaf");
  useEffect(() => {
    if (!scanning) { setScanPhase("leaf"); return; }
    const timer = window.setTimeout(() => setScanPhase("catalogue"), 400);
    return () => window.clearTimeout(timer);
  }, [scanning]);
  // Each section names its own scan steps (urban trees/ground, vineyard leaf/canopy/interrow).
  const phaseText = arFocusOption(kind, target).phases[scanPhase === "leaf" ? 0 : 1];
  const scanStatus = phaseText.status;
  const toggleTorch = async () => {
    if (torchBusy || !torchSupported || scanning) return;
    setTorchBusy(true); setTorchError(null);
    const next = !torchOn;
    const enabled = await setCameraTorch(streamRef.current?.getVideoTracks()[0], next, true);
    if (enabled) { setTorchOn(next); torchKeepRef.current = next; }
    else setTorchError("Impossibile attivare il flash su questo dispositivo.");
    // Some phones pause the picture while the torch switches: it is asked to play again (the watchdog does the rest).
    void videoRef.current?.play().catch(() => undefined);
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
    let prevBox = SEARCH_BOX;
    let hits = 0, misses = 0, locked = false, prevLocked = false, lastLockBuzz = 0;
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
      if (Math.hypot(box.x - prevBox.x, box.y - prevBox.y, box.w - prevBox.w, box.h - prevBox.h) > 0.015) {
        prevBox = box;
        subjectRef.current = box;
        const vf = viewfinderRef.current;
        if (vf) {
          vf.style.left = `${(box.x * 100).toFixed(2)}%`;
          vf.style.top = `${(box.y * 100).toFixed(2)}%`;
          vf.style.width = `${(box.w * 100).toFixed(2)}%`;
          vf.style.height = `${(box.h * 100).toFixed(2)}%`;
        }
      }
      if (locked !== prevLocked) {
        prevLocked = locked;
        setSubjectLocked(locked);
        // A plant caught in the viewfinder: one short tick, at most every 2 s so a flickering lock does not buzz.
        if (locked && performance.now() - lastLockBuzz > 2000) { lastLockBuzz = performance.now(); hapticTick([25]); }
      }
    };
    tick();
    const id = window.setInterval(tick, 450);
    return () => {
      window.clearInterval(id);
      subjectRef.current = SEARCH_BOX;
      setSubjectLocked(false);
      greenLockRef.current = false;
    };
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
    document.documentElement.setAttribute("data-sys-camera", "");
    // No white system bars: fullscreen where allowed, else dark bars (lib/camera-chrome).
    void enterCameraChrome();
    return () => {
      setArOrientationActive(false);
      document.documentElement.removeAttribute("data-sys-camera");
      exitCameraChrome();
    };
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    // Android Back first leaves native fullscreen without firing popstate: that exit closes the camera,
    // so one Back is enough. An exit caused by a rotation keeps it open (dark bars).
    let wasFullscreen = Boolean(document.fullscreenElement);
    const onFullscreenChange = () => {
      const fullscreen = Boolean(document.fullscreenElement);
      if (wasFullscreen && !fullscreen && fullscreenExitIsBack(performance.now())) {
        // In «Prova» the phone's Back leaves the AR view for the plain AI camera, not the camera itself.
        if (arTransitionRef.current) { /* the AR session's own exit */ }
        else if (liveArRef.current) endLiveRef.current();
        else onClose();
      }
      wasFullscreen = fullscreen;
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [mode, onClose]);

  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    let stopFrameLoop: (() => void) | undefined;
    let stopWatch: (() => void) | null = null;
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
      if (!cancelled) {
        const scene = m.createArScene();
        if (arCoreRef.current) scene.setArCoreManager?.(arCoreRef.current);
        sceneRef.current = scene;
      }
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
    } else {
      // Right after an ARCore session the phone's camera can still be busy: ask again a few times before giving up.
      const ask = (left: number): Promise<MediaStream> => navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280, max: 1920 }, height: { ideal: 960, max: 1440 }, frameRate: { ideal: 30, max: 30 } },
        audio: mode === "video",
      }).catch((e: unknown) => {
        const name = (e as { name?: string })?.name;
        if (left <= 0 || cancelled || name === "NotAllowedError" || name === "SecurityError") throw e;
        return new Promise<MediaStream>((res, rej) => window.setTimeout(() => ask(left - 1).then(res, rej), 700));
      });
      ask(camEpoch > 0 ? 8 : 0)
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setStreamN((n) => n + 1);
        setTorchSupported(supportsCameraTorch(stream.getVideoTracks()[0]));
        void probeCameraTorch(stream.getVideoTracks()[0]).then((ok) => { if (!cancelled && ok) setTorchSupported(true); });
        if (torchKeepRef.current) window.setTimeout(() => {
          if (cancelled) return;
          void setCameraTorch(stream.getVideoTracks()[0], true, true).then((ok) => { if (!cancelled && ok) setTorchOn(true); });
        }, 600);
        zoomRangeRef.current = trackZoomRange(stream.getVideoTracks()[0]);
        zoomerRef.current = zoomRangeRef.current ? createTrackZoomer(stream.getVideoTracks()[0]) : null;
        digitalZoomRef.current = 1; zoomRef.current = 1; setZoomState(1);
        v.srcObject = stream;
        void v.play().catch(() => {});
        // The picture must keep moving. After AR the phone can hand back a camera that gives no frames (ARCore still
        // letting it go), or gives a few and then stops, or ends the track: the preview stood still. A watchdog runs
        // as long as this camera is open — while it is in front, not scanning and not in the AR view — and when the
        // video's time has not moved for 2,5 s it first asks the video to play, then asks the camera again (a few
        // times, silently), then says so with «Riprova». An ended track restarts the camera at once.
        let lastTime = -1, stillSince = performance.now(), nudged = false;
        const restart = () => {
          if (cancelled) return;
          if (stallRetriesRef.current < 5) { stallRetriesRef.current += 1; setCamEpoch((n) => n + 1); }
          else { stallRetriesRef.current = 0; setError("La fotocamera non è ripartita. Tocca Riprova."); }
        };
        const track = stream.getVideoTracks()[0];
        const onEnded = () => { if (!liveArRef.current?.session) restart(); };
        track?.addEventListener("ended", onEnded);
        const watch = window.setInterval(() => {
          if (cancelled) { window.clearInterval(watch); return; }
          if (document.hidden || scanningRef.current || liveArRef.current?.session) { stillSince = performance.now(); lastTime = v.currentTime; return; }
          if (v.currentTime !== lastTime) { lastTime = v.currentTime; stillSince = performance.now(); nudged = false; if (v.currentTime > 1) stallRetriesRef.current = 0; return; }
          const still = performance.now() - stillSince;
          if (still > 2500 && !nudged) { nudged = true; void v.play().catch(() => undefined); return; }
          if (still > 4000) { window.clearInterval(watch); restart(); }
        }, 500);
        stopWatch = () => { window.clearInterval(watch); track?.removeEventListener("ended", onEnded); };
        const paint = (showGrid: boolean, showObjects = true) => {
          const c = canvasRef.current;
          if (!c) return false;
          const painted = paintArFrame(
            c,
            {
              video: v,
              rotation: -rotationRef.current,
              zoom: digitalZoomRef.current,
              scene: sceneRef.current,
              showObjects,
            },
            showGrid,
          );
          if (painted && !previewReady) { previewReady = true; setReady(true); }
          return painted;
        };
        paintRef.current = (showGrid: boolean) => paint(showGrid, layersRef.current.has("objects"));
        stopFrameLoop = startArFrameLoop(() => {
          // Same full-resolution composition, capped at 30 fps and paused while hidden.
          // Durante la scansione il fotogramma resta congelato: il video non viene ridipinto.
          if (!scanningRef.current) {
            sceneRef.current?.hideTarget?.();
            paint(false, layersRef.current.has("objects"));
          }
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
    }
    return () => {
      cancelled = true;
      scanVersion.current += 1;
      window.removeEventListener("pointerdown", askTiltPermission);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("deviceorientationabsolute", onTilt as EventListener);
      stopFrameLoop?.();
      stopWatch?.();
      paintRef.current = null;
      if (recRef.current?.state === "recording") recRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [mode, kind, camEpoch]);


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
      kind, photo, target: foundFocus(kind, target, !!sp).label, context: context ?? "", result,
      species: sp ? {
        commonName: sp.commonName, scientificName: sp.scientificName, family: sp.family ?? null,
        level: sp.identification?.level === "species" ? "Specie probabile" : sp.identification?.level === "genus" ? "Genere probabile" : "Identificazione incerta",
        cooling: sp.cooling?.deltaT ?? null, shade: sp.cooling?.shadeM2 ?? null, photo: sp.photo,
        form: sp.form, heightM: sp.heightM, crownM: sp.crownM, evergreen: sp.evergreen, specimen: sp.specimen ?? null,
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
        playCameraSound("scan-fail", 1.8); hapticTick([90]);
        setFound(nothingToScan);
        return;
      }
      const video = videoRef.current;
      if (!video?.videoWidth) return;
      // Recognition and frozen preview preserve the live crop and rotation.
      const small = freezeCameraFrame(c, video, -rotationRef.current, digitalZoomRef.current);
      if (!small) return;
      // Lighter upload (≤1024 px, q0.82): fast and lightweight payload for AI analysis.
      const image = encodeFrame(small, SCAN_IMAGE_PX, 0.82);
      playCameraSound("scan-start", 1.8);
      // Same frozen frame, with a second close-up preserving leaf edges and veins.
      const detail = document.createElement("canvas");
      const focus = subjectLocked ? subjectRef.current : SEARCH_BOX;
      const x = Math.max(0, focus.x - 0.08), y = Math.max(0, focus.y - 0.08);
      const w = Math.min(1 - x, focus.w + 0.16), h = Math.min(1 - y, focus.h + 0.16);
      const scale = Math.min(1, SCAN_DETAIL_PX / Math.max(w * small.width, h * small.height));
      detail.width = Math.max(1, Math.round(w * small.width * scale));
      detail.height = Math.max(1, Math.round(h * small.height * scale));
      detail.getContext("2d")?.drawImage(small, x * small.width, y * small.height, w * small.width, h * small.height, 0, 0, detail.width, detail.height);
      const detailImage = detail.toDataURL("image/jpeg", 0.82);
      // Where and when, as a prior among look-alike species (the place only once one is chosen).
      const at = kind === "urban" ? getLab().urban.location : getLab().vineyard.location;
      const request = { kind, target: arFocusOption(kind, target).id, ...(subjectLocked ? { focus: subjectRef.current } : {}), ...(satellite ? { satellite } : {}),
        ...(at.pending ? {} : { place: { lat: at.lat, lng: at.lng, label: at.label.slice(0, 120) } }), month: new Date().getMonth() + 1 };
      let r: Awaited<ReturnType<typeof detectArObject>>;
      try {
        r = await detectArObject({ data: { ...request, image, ...(detailImage.length <= 1_000_000 ? { detailImage } : {}) } });
      } catch (first) {
        const errMsg = first instanceof Error ? first.message : "";
        if (/Unauthorized/.test(errMsg)) {
          try {
            const { supabase } = await import("@/integrations/supabase/client");
            const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
            if (!refErr && refreshed.session && version === scanVersion.current) {
              r = await detectArObject({ data: { ...request, image, ...(detailImage.length <= 1_000_000 ? { detailImage } : {}) } });
            } else {
              throw first;
            }
          } catch {
            throw first;
          }
        } else if (version !== scanVersion.current || !isEmptyHttpError(first)) {
          throw first;
        } else {
          // An HTTP error with an empty body (oversized or too slow): one retry, smaller and without the close-up.
          r = await detectArObject({ data: { ...request, image: encodeFrame(small, SCAN_RETRY_PX, 0.78) } });
        }
      }
      if (version !== scanVersion.current) return;
      const d = r.detection;
      setSoil(r.soil ?? null);
      setSurvey(r.survey ?? null);
      if (r.error) {
        playCameraSound("scan-fail", 1.8); hapticTick([90]);
        setFound(r.error);
        return;
      }
      // Each branch target stops when the result lacks what it looks for (a plant, or the ground).
      const missing = scanMissing(kind, target, { plant: Boolean(d && (d.type !== "object" || d.species)), ground: Boolean(r.soil || r.survey?.regions.length) });
      if (missing) {
        playCameraSound("scan-fail", 1.8); hapticTick([90]);
        setFound(missing);
        return;
      }
      if (!d) {
        playCameraSound("scan-done", 1.8); hapticTick([40, 60, 40]);
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
      // Posizionamento sulla griglia e calcolo termico
      last.current = cutout ? args : null;
      setLayers((s) => new Set(s).add("objects"));
      const identified = d.species ? { ...d.species, cooling: d.cooling, identification: d.identification } : null;
      setSpecies(identified);
      if (identified && sceneRef.current) {
        sceneRef.current.place(type, d.box.x + d.box.w / 2, Math.min(0.98, d.box.y + d.box.h), Math.max(0.15, d.box.h), {
          speciesName: identified.commonName,
          scientificName: identified.scientificName,
          shadeM2: identified.cooling?.shadeM2 ?? 18,
          cooling: identified.cooling?.deltaT ?? 0.4,
          is3D: true,
          image: cutout ?? undefined,
        });
      }
      playCameraSound("scan-done", 1.8); hapticTick([40, 60, 40]);
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
      if (version === scanVersion.current) { playCameraSound("scan-fail", 1.8); hapticTick([90]); }
      if (version === scanVersion.current) setFound(/Unauthorized/.test(message) ? "Sessione non sincronizzata: riprova la scansione." : `Analisi interrotta${detail ? ` (${detail})` : ""}. Controlla la connessione prima di una nuova analisi.`);
    } finally {
      scanBusy.current = false;
      scanningRef.current = false;
      setScanning(false);
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
    if (!ready || scanningRef.current) return;
    const coolingData = species?.cooling ?? { deltaT: 0.4, shadeM2: 18 };
    const next = scannedSpecimenCount(requested);
    countRef.current = next;
    taps.current = Array.from({length:next}, (_, i) => ({x:0.2 + (i % 3) * 0.3, y:0.65 + Math.floor(i / 3) * 0.1}));
    plantedCooling.current = Array.from({length:next}, () => coolingData);
    setCount(next);
  };
  const removeGreen = () => changeGreen(countRef.current - 1);
  const removeLast = () => {
    sceneRef.current?.removeLast();
    removeGreen();
  };

  // "Elimina tutti" also empties this flow's scan records (report log and every section's result), after a confirm.
  const scanRecords = useArScans(kind);
  // The confirm lives inside the camera surface (not window.confirm), so it turns with the camera in landscape.
  const [confirmClear, setConfirmClear] = useState(false);
  // While the records are being deleted the big bin empties (files fly out, lid opens), then the confirm closes.
  const [emptying, setEmptying] = useState(false);
  const clearEverything = () => {
    sceneRef.current?.clear();
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
  useEffect(() => { setBrowse(null); }, [scanRecords.length, target]);
  const removeAll = () => { if (scanRecords.length) setConfirmClear(true); else clearEverything(); };
  const thermalEstimate = scannedSpecimenThermal(count, species?.cooling ?? null);
  const coolingNow = thermalEstimate.deltaT;
  const shadeNow = thermalEstimate.shadeM2;
  useEffect(() => {
    if (scanRecordId.current) updateScan(kind, scanRecordId.current, { count, totalCooling: species?.cooling ? coolingNow : null, totalShade: species?.cooling ? shadeNow : null });
  }, [kind, count, coolingNow, shadeNow, species]);
  // Ogni esemplare in più mostra subito i gradi numerici accanto al conteggio.
  const hasLive = Boolean(found || survey || species || count > 0);
  const liveRecord = scanRecordId.current ? scanRecords.findIndex((r) => r.id === scanRecordId.current) : -1;
  const livePage = liveRecord >= 0 ? liveRecord : hasLive ? scanRecords.length : -1;
  const pageCount = scanRecords.length + (hasLive && liveRecord < 0 ? 1 : 0);
  const viewPage = Math.min(pageCount - 1, browse ?? (livePage >= 0 ? livePage : scanRecords.length - 1));
  const viewedRecord = viewPage !== livePage ? scanRecords[viewPage] ?? null : null;
  const identificationBadge = species?.identification ? (
    <p className="ar-identification-badge">
      {species.identification.level === "species" ? "Specie probabile" : species.identification.level === "genus" ? "Genere probabile" : "Identificazione incerta"}
      {" · "}{species.identification.leafVisible ? "evidenza fogliare" : "corteccia e portamento"}
      {(species.colUrl || species.gbifUrl) && <span className="block">Tassonomia verificata</span>}
    </p>
  ) : null;
  // Wraps like the tutorial: after the last scan back to the first, before the first to the last.
  const goToPage = (page: number) => setBrowse(pageCount ? (page + pageCount) % pageCount : null);
  const summaryPager = pageCount > 1 && (
    <div className="ar-summary-pager">
      <button type="button" aria-label="Scansione precedente" onClick={() => goToPage(viewPage - 1)}><ChevronLeft className="size-3.5" /></button>
      <span>Scansione {viewPage + 1} di {pageCount} · scorri per le altre</span>
      <button type="button" aria-label="Scansione successiva" onClick={() => goToPage(viewPage + 1)}><ChevronRight className="size-3.5" /></button>
    </div>
  );
  // Esito follows the summary pager: a swiped-back scan shows its own reference photo and result, not the live one.
  const recordEsito = (r: ScanRecord, at?: number) => {
    return (
      <>
        <p className="ar-esito-page">Scansione {(at ?? viewPage) + 1} di {at !== undefined ? scanRecords.length : pageCount} · {r.target} · {new Date(r.at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</p>
        <EsitoPhoto scan={scanPhoto(r.id)} reference={r.species?.photo ?? null} name={r.species?.commonName ?? null} />
        {r.species ? (
          <p>
            <span className="text-sm font-semibold">{r.species.commonName}</span>{" "}
            <span className="italic text-muted-foreground">{r.species.scientificName}</span>
            {r.species.cooling !== null && (
              <span className="mt-1 block font-semibold text-primary">Raffrescamento stimato {coolingLabel(r.species.cooling)}{r.species.shade !== null ? ` · ombra ≈ ${Math.round(r.species.shade)} m²` : ""}</span>
            )}
          </p>
        ) : <p className="font-semibold text-foreground mb-1">{r.result}</p>}
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
    if (arHolding.current) {
      // Still an AI shot (its kind in the history), marked as one of a multiple shot; the camera stays open.
      const id = Date.now();
      setBurstFlash((n) => n + 1);
      hapticTick(30);
      const thumbCanvas = document.createElement("canvas");
      const scale = 160 / Math.max(saved.width, saved.height);
      thumbCanvas.width = Math.max(1, Math.round(saved.width * scale));
      thumbCanvas.height = Math.max(1, Math.round(saved.height * scale));
      thumbCanvas.getContext("2d")?.drawImage(saved, 0, 0, thumbCanvas.width, thumbCanvas.height);
      const thumb = thumbCanvas.toDataURL("image/jpeg", 0.7);

      saved.toBlob((b) => {
        if (!b) return;
        const file = new File([b], `foto-ar${tag}-multiplo-${id}.jpg`, { type: "image/jpeg" });
        setBurstShots((p) => [...p, { id, file, thumb, src: "ai" }]);
        setBestShotId(id);
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

  // Holding the shutter shoots a multiple shot until the finger lifts, without touching the switch first.
  const { holding: arHolding, onHold: arHold } = useHoldBurst(() => shoot());

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

  // The result no longer opens over the camera: it goes in the «Scansioni» drawer (a short line says when a scan fails).
  const failedScan = found && !species && !soil && !survey ? found : null;
  const [failNote, setFailNote] = useState<string | null>(null);
  useEffect(() => {
    if (!failedScan || scanning) { setFailNote(null); return; }
    setFailNote(failedScan);
    const t = window.setTimeout(() => setFailNote(null), 4500);
    return () => window.clearTimeout(t);
  }, [failedScan, scanning]);
  const openEsito = (page: number | null) => { setBrowse(page); setToolsOpen(true); setActiveTool("analysis"); setPanelOpen(true); setPanelMin(false); setScanSheet(false); };
  const shownRecord = viewedRecord ?? (liveRecord >= 0 ? scanRecords[liveRecord] ?? null : null);
  // The card above the shutter («Aggiungi al progetto»): taken away with its ✕ or a swipe, called back from the sheet.
  const cardHasContent = Boolean(shownRecord?.species || shownRecord?.soil || species || liveAr);
  const scanGroups: FanGroup[] = [{ key: "scansioni", label: "Scansioni", Icon: ClipboardList, items: [
    ...(infoBannerDismissed && cardHasContent && !liveAr ? [{ key: "scheda", label: "Mostra la scheda", Icon: PanelBottomOpen, on: false, tool: true,
      hint: "Rimette sullo schermo la scheda della scansione con «Aggiungi al progetto»", onPick: () => { setInfoBannerDismissed(false); setScanSheet(false); } }] : []),
    ...(species || soil || survey || found ? [{ key: "esito", label: "Esito dell’ultima scansione", Icon: Info, on: false, tool: true,
      hint: species ? `${species.commonName}${species.cooling ? ` · ombra ≈ ${species.cooling.shadeM2} m²` : ""}` : soil ? `Terreno ${soil.label}` : "Riapri la scheda con specie, suolo e fonti",
      onPick: () => openEsito(null) }] : []),
    ...(scanRecords.length ? [{ key: "fatte", label: `Scansioni fatte · ${scanRecords.length}`, Icon: History, on: false, tool: true,
      hint: "Sfogliale una per una: specie, suolo, foto ed esemplari", onPick: () => openEsito(Math.max(0, scanRecords.length - 1)) }] : []),
    ...(count > 0 ? [{ key: "annulla", label: "Togli l’ultimo esemplare", Icon: Undo2, on: false, tool: true, hint: `${count} ${count === 1 ? "esemplare contato" : "esemplari contati"}`, onPick: () => { removeLast(); setScanSheet(false); } }] : []),
    ...(count > 1 || scanRecords.length ? [{ key: "elimina", label: "Elimina tutto", Icon: Trash2, on: false, tool: true, hint: "Toglie gli esemplari e tutte le scansioni registrate (chiede conferma)", onPick: () => { setScanSheet(false); removeAll(); } }] : []),
  ] }];
  const hasScans = scanGroups[0]!.items.length > 0 || !!failedScan;
  useEffect(() => { if (!hasScans) setScanSheet(false); }, [hasScans]);
  // Fase 2: «Aggiungi al progetto». Lo scansionato diventa un punto sulla mappa (GPS + bussola + distanza tipica),
  // con quello che ha detto la scansione; gli alberi poi contano come «già nell'area» nella simulazione.
  const finds = useFieldFinds(kind);
  const shownAdded = Boolean(shownRecord && finds.some((f) => f.scanId === shownRecord.id));
  const [adding, setAdding] = useState(false);
  const canAdd = Boolean(shownRecord && (shownRecord.species || shownRecord.soil) && !scanning);
  const addToProject = async (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const rec = shownRecord;
    if (!rec || adding) return;
    setAdding(true);
    try {
      const findKind: FindKind = (AR_FOCUS[kind].find((o) => o.label === rec.target && o.id !== "auto")?.id as FindKind | undefined) ?? (rec.species ? (kind === "urban" ? "tree" : "leaf") : kind === "urban" ? "ground" : "interrow");
      const [fix, thumb] = await Promise.all([readFix(), smallThumb(scanPhoto(rec.id))]);
      const loc = kind === "urban" ? getLab().urban.location : getLab().vineyard.location;
      const find = findFromScan(rec, findKind, fix, { lat: loc.lat, lng: loc.lng }, thumb);
      addFind(find);
      hapticTick([20]);
      toast.success(`Aggiunto al progetto · ${find.title}`, { description: `${placedText(find)}. Lo trovi sulla mappa della ${kind === "urban" ? "piazza" : "vigna"}.` });
    } finally { setAdding(false); }
  };
  const addButton = canAdd ? (
    <button type="button" onClick={(e) => void addToProject(e)} onPointerDown={(e) => e.stopPropagation()} disabled={adding || shownAdded}
      className={`mt-2 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-bold ${shownAdded ? "bg-white/10 text-white/70" : "bg-white text-black"} disabled:cursor-default`}>
      {shownAdded ? <><Check className="size-3.5" aria-hidden="true" />Nel progetto</> : adding ? "Aggiungo…" : <><Plus className="size-3.5" aria-hidden="true" />Aggiungi al progetto</>}
    </button>
  ) : null;
  // Fase 1 della nuova fotocamera AI: due modalità. «Rileva» riconosce ciò che c'è (scansione con l'AI);
  // «Prova» mostra sul posto l'intervento (oggi: la griglia e la posa della pianta, ARCore vero nella fase 3).
  // The old «Prova» on a grid (a tree put at random on a guessed floor) is gone: Prova is ArLive only.
  const proving = !!liveAr;
  const setCamMode = (next: "rileva" | "prova", e?: React.MouseEvent) => {
    if (next === "prova" && !liveAr) {
      e?.stopPropagation();
      e?.preventDefault();
      // ARCore: the live view takes the camera, so ours is stopped first; the session is asked inside this tap.
      if (arCoreSupported && navigator.xr) {
        const root = liveRootEl();
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        // The AR session leaves the camera's fullscreen: that exit is not a Back, so the camera stays open.
        arTransitionRef.current = true;
        // ARCore opens the phone's camera itself: asked while ours is still being released, the phone refuses the
        // session ("The specified session configuration is not supported"). A short wait lets the camera go; the
        // tap's activation lasts long enough (Chrome keeps it about 5 s).
        new Promise((r) => window.setTimeout(r, 450))
          .then(() => requestArSession(root))
          .then((session) => { setLiveAr({ session, root }); void resetAppOrientation(); })
          .finally(() => { window.setTimeout(() => { arTransitionRef.current = false; }, 1500); })
          .catch((err: unknown) => {
            root.remove();
            setCamEpoch((n) => n + 1);
            toast.error("ARCore non è partito", { description: `${err instanceof Error ? err.message : String(err)} · Uso l’anteprima.` });
            regainFullscreen(); // AR left the camera's fullscreen to ask the session: the preview takes it back
            // Every configuration refused while the phone says it supports AR: Chrome has blocked augmented reality for
            // this site (its own permission, kept per site). Said plainly, with where to turn it back on.
            const msg = err instanceof Error ? err.message : String(err);
            const blocked = msg.split(" · ").every((p) => p.trim().endsWith("NotSupportedError"));
            setLiveAr({ session: null, root: liveRootEl(), why: blocked
              ? "Chrome ha bloccato la realtà aumentata per questo sito. In Chrome tocca l’icona a sinistra dell’indirizzo → Autorizzazioni (o Impostazioni sito) → Realtà aumentata → Consenti, poi riprova. Intanto uso l’anteprima."
              : `ARCore non è partito (${msg}): uso l’anteprima.` });
          });
      } else {
        // Why there is no ARCore, said over the camera (toasts sit under it).
        const why = !navigator.xr
          ? "Questo browser non offre la realtà aumentata: aprila in Chrome su Android per usare ARCore. Intanto uso l’anteprima."
          : "ARCore non è disponibile su questo telefono (serve «Google Play Services per AR» aggiornato dal Play Store). Intanto uso l’anteprima.";
        setLiveAr({ session: null, root: liveRootEl(), why });
      }
      return;
    }
    if (next === "rileva" && liveAr) endLiveRef.current();
  };
  // Turning the phone during AR: Chrome keeps the session in the orientation it started in, so the session is ended,
  // the screen left to turn, and a new one asked — all inside the tap on «Tocca per ruotare» (its activation lasts).
  const rotateLive = () => {
    const had = liveArRef.current;
    if (!had?.session) return;
    restartingRef.current = true;
    arTransitionRef.current = true;
    const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
    void had.session.end().catch(() => undefined)
      .then(() => wait(600))
      .then(() => { void resetAppOrientation(); return wait(500); })
      .then(() => requestArSession(had.root))
      .then((session) => { setLiveAr({ session, root: had.root, n: (had.n ?? 0) + 1 }); void resetAppOrientation(); })
      .catch((err: unknown) => {
        toast.error("Non riesco a riavviare l’AR", { description: `${err instanceof Error ? err.message : String(err)} · Uso l’anteprima.` });
        had.root.remove();
        setCamEpoch((n) => n + 1);
        setLiveAr({ session: null, root: liveRootEl(), n: (had.n ?? 0) + 1 });
      })
      .finally(() => { restartingRef.current = false; window.setTimeout(() => { arTransitionRef.current = false; }, 1500); });
  };
  // The flash with ARCore: ARCore holds the camera and Chrome gives the page no torch, so a tap on the flash leaves
  // ARCore for the preview (the app's own camera) with the torch on.
  const flashPreview = (carry: PlacedObject[] = []) => {
    const had = liveArRef.current;
    if (!had?.session) return;
    restartingRef.current = true;
    arTransitionRef.current = true;
    void had.session.end().catch(() => undefined)
      // As on leaving AR: the camera is asked again only once ARCore has let it go.
      .then(() => new Promise((r) => window.setTimeout(r, 900)))
      .then(() => {
        had.root.remove();
        stallRetriesRef.current = 0;
        setCamEpoch((n) => n + 1);
        setLiveAr({ session: null, root: liveRootEl(), n: (had.n ?? 0) + 1, torch: true, carry });
        regainFullscreen();
        // ARCore held the screen's orientation and Chrome put back the app's upright lock when it ended: asked again,
        // as when leaving AR, so the preview turns with the phone (it stayed upright, its controls too).
        void resetAppOrientation();
        window.setTimeout(() => { void resetAppOrientation().then(() => window.dispatchEvent(new Event("ar-orientation-change"))); }, 600);
      })
      .finally(() => { restartingRef.current = false; window.setTimeout(() => { arTransitionRef.current = false; }, 1500); });
  };
  const endLive = () => {
    if (restartingRef.current) return;
    const had = liveAr;
    setLiveAr(null);
    had?.root.remove();
    // The camera is asked again only once ARCore has ended its session and let the phone's camera go: asked before,
    // the phone answered with a camera that gave no frames and the picture stood still.
    if (had?.session) {
      void had.session.end().catch(() => undefined)
        .then(() => new Promise((r) => window.setTimeout(r, 900)))
        .then(() => { stallRetriesRef.current = 0; setCamEpoch((n) => n + 1); });
    }
    setTorchOn(false); // the AR view switches the flash off as it closes
    torchKeepRef.current = false;
    // Back to the camera's fullscreen (and so to its landscape) if the AR session left it; the exit tap counts.
    arTransitionRef.current = true;
    void resetAppOrientation();
    regainFullscreen();
    // Chrome restores its own orientation a moment after the session's end: ask once more once it has.
    window.setTimeout(() => { void resetAppOrientation().then(() => window.dispatchEvent(new Event("ar-orientation-change"))); }, 600);
    window.setTimeout(() => { arTransitionRef.current = false; }, 1500);
  };
  endLiveRef.current = endLive;
  // The plants «Rileva» recognised in this flow, so «Prova» can put the very species at its size.
  const arPlants = recognisedPlants(kind, scanRecords.map((r) => r.species));
  const liveView = liveAr ? createPortal(
    // The camera's own gestures (close swipe, tap to place) must not see the live view's taps.
    <div onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <ArLive key={liveAr.n ?? 0} kind={kind} session={liveAr.session} why={liveAr.why} stream={liveAr.session ? null : streamRef.current} plants={arPlants} onShot={(f) => onCapture([f])} onEnd={endLive} onRotate={rotateLive} torch={liveAr.torch ?? false} carry={liveAr.carry} rotation={liveAr.session ? 0 : viewport.rotation} onFlashPreview={flashPreview}
        burst={{ shots: burstShots, open: burst, setOpen: setBurst, discarded, add: () => burstActs.current.add(), discardAll: () => burstActs.current.discardAll(),
          push: (shot) => setBurstShots((p) => [...p, shot]),
          toggle: (id) => setDiscarded((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; }) }} />
    </div>, liveAr.root) : null;
  // The preview without ARCore turns with the camera: when the page stays upright and the camera's surface is turned
  // by CSS (the phone held sideways without fullscreen), the AR view and its controls are turned the same way.
  useEffect(() => {
    const root = liveAr?.root;
    if (!root) return;
    const rot = liveAr.session ? 0 : viewport.rotation;
    root.style.cssText = rot && viewport.width && viewport.height
      ? `position:fixed;left:50%;top:50%;width:${viewport.width}px;height:${viewport.height}px;transform:translate(-50%,-50%) rotate(${rot}deg);z-index:2147483000`
      : "position:fixed;inset:0;z-index:2147483000";
  }, [liveAr, viewport.rotation, viewport.width, viewport.height]);
  // «Prova» is for phones only: on tablets and computers the camera stays on «Rileva» and the switch is not shown.
  const modeSwitch = !onPhone ? null : (
    <div role="radiogroup" aria-label="Modalità della fotocamera AI" className="flex rounded-full bg-[rgba(20,26,34,0.78)] p-1 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur-md shadow-lg">
      {(["rileva", "prova"] as const).map((m) => {
        const on = (m === "prova") === proving;
        return (
          <button key={m} type="button" role="radio" aria-checked={on} disabled={scanning}
            onClick={(e) => setCamMode(m, e)}
            className={`h-8 rounded-full px-4 transition-all disabled:opacity-50 ${on ? "bg-[#00f0ff]/20 text-[#00f0ff] ring-1 ring-[#00f0ff]/70" : "text-white/80 hover:text-white"}`}>
            {m === "rileva" ? "Rileva" : <span aria-label="AR, realtà aumentata">AR</span>}
          </button>
        );
      })}
    </div>
  );

  const topBarElement = (
    <div
      data-camera-hud
      className={`ar-camera-topbar ${landscape ? "ar-camera-topbar-landscape" : "ar-camera-topbar-portrait"}`}
    >
      {landscape ? (
        <div className="relative flex w-full items-center justify-between px-4 pt-1" data-camera-controls>
          {/* Centro: riepilogo specie · ombra · raffrescamento · stato termico */}
          <div className="ar-landscape-info-pill" role="status" aria-label="Riepilogo analisi">
            <span className="ar-info-species">
              <Leaf className="size-3.5 text-[#4ade80]" aria-hidden="true" />
              <strong>{species?.commonName ?? (proving ? "AR" : arFocusOption(kind, target).label)}</strong>
            </span>
            {species?.cooling && (
              <>
                <span className="ar-info-sep" aria-hidden="true" />
                <span className="ar-info-item" title="Ombra stimata"><Umbrella className="ar-info-icon" aria-hidden="true" /><span className="ar-info-label">Ombra ≈ </span><b>{species.cooling.shadeM2} m²</b></span>
                <span className="ar-info-sep" aria-hidden="true" />
                <span className="ar-info-item" title="Raffrescamento stimato"><Snowflake className="ar-info-icon" aria-hidden="true" /><span className="ar-info-label">Fresco stimato </span><b>{coolingLabel(species.cooling.deltaT)}</b></span>
              </>
            )}
            {!species && <><span className="ar-info-sep" aria-hidden="true" /><span className="ar-info-item">{proving ? "Tocca il terreno per posare la pianta" : "Inquadra e avvia la scansione"}</span></>}
          </div>
          {/* Left: Close + ARCore */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={onClose}
              disabled={recording}
              aria-label="Chiudi"
              className="camera-tool grid size-10 place-items-center rounded-full disabled:opacity-40"
            >
              <X className="size-5" />
            </Button>
            {modeSwitch}
          </div>

          {/* Right: Singolo / Multiplo switcher + Guide */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-9 grid place-items-center rounded-full bg-[rgba(32,36,44,0.72)] border border-white/20 text-white backdrop-blur-md hover:bg-[rgba(50,56,66,0.85)]"
              aria-label="Guida inquadratura"
              title="Guida inquadratura"
              aria-pressed={guideOpen}
              onClick={() => setGuideOpen(v => !v)}
            >
              <Info className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        /* Portrait: Two balanced, centered rows */
        <div className="flex flex-col items-center gap-2.5 w-full px-4 pt-1" data-camera-controls>
          {/* Row 1: Left [ ✕ ], Center [ ● ARCore ], Right [ ⓘ, ⚡ ] */}
          <div className="relative flex w-full items-center justify-between min-h-10">
            <div className="flex items-center z-10">
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={onClose}
                disabled={recording}
                aria-label="Chiudi"
                className="camera-tool grid size-10 place-items-center rounded-full disabled:opacity-40"
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto">
              {modeSwitch}
            </div>

            <div className="flex items-center gap-1.5 justify-end z-10">
              <Button
                variant="ghost"
                size="icon"
                className="camera-tool size-10 grid place-items-center rounded-full"
                aria-label="Guida inquadratura"
                title="Guida inquadratura"
                aria-pressed={guideOpen}
                onClick={() => setGuideOpen(v => !v)}
              >
                <Info className="size-4" />
              </Button>
              {torchSupported && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="camera-tool size-10 grid place-items-center rounded-full"
                  disabled={torchBusy || scanning}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? "Disattiva flash" : "Attiva flash"}
                  title={torchOn ? "Disattiva flash" : "Attiva flash"}
                  onClick={() => void toggleTorch()}
                >
                  {torchOn ? <Zap className="size-4 text-yellow-400" /> : <ZapOff className="size-4" />}
                </Button>
              )}
            </div>
          </div>

          {/* Row 2: in Rileva what to scan; in Prova what to do */}
          {proving || !selectableFocus(kind).length ? (proving && (
            <p className="rounded-full bg-[rgba(20,26,34,0.75)] px-4 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-md" role="status">
              Tocca il terreno per posare la pianta · anteprima
            </p>
          )) : (
          <div className="flex items-center justify-center">
            <div className="flex items-center rounded-full bg-[rgba(20,26,34,0.75)] p-1 ring-1 ring-white/15 backdrop-blur-md" role="radiogroup" aria-label="Obiettivo camera">
              {selectableFocus(kind).map((o, idx) => {
                const isChecked = arFocusOption(kind, target).id === o.id;
                return (
                  <div key={o.id} className="flex items-center">
                    {idx > 0 && <span className="mx-1.5 h-3.5 w-[1px] bg-white/20" aria-hidden="true" />}
                    <button
                      type="button"
                      role="radio"
                      aria-label={`${FOCUS_LABELS[o.id]} · ${o.label}`}
                      title={FOCUS_LABELS[o.id]}
                      aria-checked={isChecked}
                      onClick={() => selectTarget(o.id)}
                      className={`ar-focus-icon grid h-10 w-14 place-items-center rounded-full transition-all ${
                        isChecked
                          ? "bg-[#00f0ff]/20 text-[#00f0ff] ring-1 ring-[#00f0ff]/70 shadow-[0_0_12px_rgba(0,240,255,0.4)]"
                          : "text-white/75 hover:text-white"
                      }`}
                    >
                      {(() => { const Icon = FOCUS_ICONS[o.id]; return <Icon className="size-5" aria-hidden="true" />; })()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );

  const burstThumb = burstShots.length > 0 && (
            // The multiple shot taken by holding the shutter: its last photo with the count; a tap opens the strip
            // to drop some and add them, closing the camera adds them anyway.
            <button type="button" onClick={() => setBurst((b) => !b)} aria-expanded={burst}
              aria-label={`${burstShots.length} foto del multiplo · ${burst ? "chiudi" : "rivedi"}`}
              className="relative size-11 shrink-0 rounded-xl ring-2 ring-white/80 shadow-lg active:scale-95">
              <img src={burstShots[burstShots.length - 1]!.thumb} alt="" className="size-full rounded-xl object-cover" />
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#00e5ff] px-1 text-[11px] font-bold text-black">{burstShots.length}</span>
            </button>
  );
  // The multiple shot's review: a dark sheet rising from the bottom like the camera's, a grid of the shots (a tap
  // sets one aside, greyed with ✕), "Scarta tutte" and "Aggiungi n" (the rest goes to the project, the camera stays open).
  const keptShots = burstShots.filter((s) => !discarded.has(s.id));
  const closeReview = () => setBurst(false);
  const addKept = () => {
    const files = keptShots.map((s) => s.file);
    if (files.length) onCapture(files);
    burstRef.current = [];
    setBurstShots([]);
    setBestShotId(null);
    setDiscarded(new Set());
    setBurst(false);
  };
  const discardAll = () => {
    burstRef.current = [];
    setBurstShots([]);
    setBestShotId(null);
    setDiscarded(new Set());
    setBurst(false);
  };
  burstActs.current = { add: addKept, discardAll };
  const burstSheetElement = burst && burstShots.length > 0 && (
    <BurstReviewSheet shots={burstShots} discarded={discarded} onClose={closeReview} onAdd={addKept} onDiscardAll={discardAll}
      onToggleShot={(id) => setDiscarded((d) => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
  );


  const toolsPanelElement = (
    <div id="ar-camera-tools" hidden={!toolsOpen} className="w-full">
      {toolsOpen && (
        <div className="ar-tools-panel flex w-full flex-col items-center gap-2">
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
                  onClick={() => { setPanelOpen(false); setActiveTool(null); setToolsOpen(false); }}
                  aria-label="Chiudi esito analisi"
                  title="Chiudi esito analisi"
                  className="grid size-7 place-items-center rounded-full bg-background/80 backdrop-blur-md"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <div
                data-camera-scroll
                className="max-h-[32dvh] overflow-y-auto rounded-lg bg-background/95 px-3.5 py-3 pr-20 text-xs leading-relaxed backdrop-blur-md"
                aria-live="polite"
              >
                {summaryPager && <div className="mb-2">{summaryPager}</div>}
                {viewedRecord ? recordEsito(viewedRecord) : (
                  <>
                    <EsitoPhoto scan={realPhoto} reference={species?.photo ?? null} name={species?.commonName ?? null} />
                    {species ? (
                      <p className="pr-1">
                        <span className="text-sm font-semibold">{species.commonName}</span>{" "}
                        <span className="italic text-muted-foreground">{species.scientificName}</span>
                        {species.cooling && (
                          <span className="mt-1 block font-semibold text-primary">Raffrescamento stimato {coolingLabel(species.cooling.deltaT)} · ombra ≈ {species.cooling.shadeM2} m²</span>
                        )}
                      </p>
                    ) : (
                      found && <p className="font-semibold text-foreground mb-1">{found}</p>
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
                    {survey && (
                      <dl className="mt-2 space-y-1">
                        <div><dt className="font-semibold">Consistenza apparente</dt><dd className="text-muted-foreground">{survey.consistency}</dd></div>
                        <div><dt className="font-semibold">Calore / esposizione</dt><dd className="text-muted-foreground">{survey.heatNote}</dd></div>
                        <div><dt className="font-semibold">Temperatura del terreno</dt><dd className="text-muted-foreground">Non misurata · serve una sonda termica</dd></div>
                      </dl>
                    )}
                    {soil?.note && <p className="text-muted-foreground">{soil.note}</p>}
                    <p className="mt-1 text-muted-foreground">Identificazione e suolo: stime visive, non analisi strumentali.</p>
                    {found && species && <p role="status">{found}</p>}
                    {species && (
                      <p className="text-muted-foreground">
                        Stima indicativa · piano virtuale
                        {species.family && <>{" · "}{species.family}</>}
                        {species.colUrl && (
                          <>{" · "}<a href={species.colUrl} target="_blank" rel="noreferrer" className="underline">Scheda della specie</a></>
                        )}
                        {species.gbifUrl && (
                          <>{" · "}<a href={species.gbifUrl} target="_blank" rel="noreferrer" className="underline">Osservazioni</a></>
                        )}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const captureControlElement = (
    <CameraCaptureControl
      mode={mode ?? "photo"}
      recording={recording}
      ar
      vertical={landscape}
      disabled={!ready || scanning || xrActive}
      onCapture={mode === "photo" ? shoot : record}
      {...(mode !== "video" ? { onHold: arHold } : {})}
      left={proving ? null : (
        <div className="flex items-center justify-center gap-2">
          {!landscape && burstThumb}
          <Button
            variant="ghost"
            type="button"
            data-no-ui-click
            onClick={() => void scan()}
            disabled={!ready || scanning || recording}
            aria-label="Scansiona terreno e pianta"
            title="Scansiona terreno e pianta"
            className={
              landscape
                ? "ar-landscape-pill-btn is-icon disabled:opacity-40"
                : `camera-tool ar-scan-btn is-icon disabled:opacity-40${scanning ? " is-compact" : ""}`
            }
          >
            <ScanSearch className={`size-6 shrink-0 ${scanning ? "animate-pulse text-[#00f0ff]" : ""}`} aria-hidden="true" />
          </Button>
          {!landscape && scanning && (
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={cancelScan}
              aria-label="Termina scansione"
              title="Termina scansione"
              className="camera-tool size-10 rounded-full ml-1.5"
            >
              <Square className="size-4 fill-current text-destructive" />
            </Button>
          )}
        </div>
      )}
      right={
        <div className="flex items-center justify-center">
          {/* Shown only once there is something to see: with no scan the sheet had nothing to offer. */}
          {hasScans && <Button
            variant="ghost"
            type="button"
            onClick={() => setScanSheet((o) => !o)}
            aria-expanded={scanSheet}
            aria-controls="ar-ai-tray"
            aria-label={`Scansioni (${scanRecords.length}): esito, scansioni fatte, elimina`}
            title="Scansioni"
            className={
              landscape
                ? "ar-landscape-pill-btn is-icon relative"
                : "camera-tool ar-tools-btn is-icon relative"
            }
          >
            <ClipboardList className="size-6 shrink-0" aria-hidden="true" />
            {scanRecords.length > 0 && <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold leading-none text-primary-foreground">{scanRecords.length}</span>}
          </Button>}
        </div>
      }
    />
  );

  const zoomDialElement = !toolsOpen && (
    <ZoomDial zoom={zoom} max={ZOOM_MAX} disabled={!ready || scanning} onZoom={setZoom} onRulerChange={setZoomRulerActive} />
  );

  const swipeHintElement = (
    <p className="ar-start-swipe-hint" data-visible={swipeHint} role="status" aria-hidden={!swipeHint}>
      Fai uno swipe dal basso verso l’alto per chiudere.
    </p>
  );

  return (
    <Dialog modal
      open={mode !== null}
      onOpenChange={(o) => {
        if (!o && !arTransitionRef.current) onClose();
      }}
    >
      <DialogContent
        data-sys-camera-root
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
        <div ref={liveHostRef} className="contents" />
        {liveView}
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
              <Button size="sm" onClick={() => { setError(null); stallRetriesRef.current = 0; setCamEpoch((n) => n + 1); }}>
                Riprova
              </Button>
              <Button size="sm" variant="outline" onClick={() => mode && onFallback(mode)}>
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
              aria-label="Anteprima fotocamera"
            />
            {ready && <div ref={viewfinderRef} className={`ar-viewfinder${subjectLocked ? " is-locked" : ""}${scanning ? " is-locking" : ""}`} aria-hidden="true"
              style={{ left: `${(subjectRef.current.x * 100).toFixed(2)}%`, top: `${(subjectRef.current.y * 100).toFixed(2)}%`, width: `${(subjectRef.current.w * 100).toFixed(2)}%`, height: `${(subjectRef.current.h * 100).toFixed(2)}%` }}>
              <span className="ar-viewfinder-corner tl" /><span className="ar-viewfinder-corner tr" />
              <span className="ar-viewfinder-corner bl" /><span className="ar-viewfinder-corner br" />
              <span className="ar-viewfinder-label">{scanning ? phaseText.tag : subjectLocked ? "Agganciato" : "Ricerca…"}</span>
              {scanning && <span className="ar-viewfinder-scan"><span className="ar-viewfinder-sweep" /></span>}
            </div>}
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
            {topBarElement}
            {torchError && <p className="ar-flash-error" role="status" data-camera-controls>{torchError}</p>}
            {burstFlash > 0 && <div key={burstFlash} onAnimationEnd={() => setBurstFlash(0)} className="burst-flash pointer-events-none fixed inset-0 bg-white" aria-hidden="true" />}
            {burstSheetElement}
            {scanSheet && <button type="button" tabIndex={-1} aria-label="Chiudi" data-camera-controls onClick={() => setScanSheet(false)} className="fixed inset-0 z-30 cursor-default bg-black/35" />}
            {scanSheet && hasScans && <div data-camera-controls><ScanSheet records={scanRecords} failed={failedScan} showCard={infoBannerDismissed && cardHasContent && !liveAr} specimens={count}
              detail={(r, i) => recordEsito(r, i)} onShowCard={() => { setInfoBannerDismissed(false); setScanSheet(false); }} onUndoSpecimen={() => { removeLast(); setScanSheet(false); }}
              onDelete={(ids) => { const all = ids.length >= scanRecords.length; removeScans(kind, ids); setBrowse(null); setPanelOpen(false); if (all) resetResults(); }}
              onDeleteAll={() => { setScanSheet(false); removeAll(); }} onClose={() => setScanSheet(false)} /></div>}
            {failNote && !scanSheet && <button type="button" data-camera-controls onClick={() => { setFailNote(null); setScanSheet(true); }}
              className="fixed left-1/2 z-30 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[13px] font-semibold text-white ring-1 ring-amber-300/40 backdrop-blur"
              style={{ bottom: "calc(env(safe-area-inset-bottom) + 9.5rem)" }}>Analisi non riuscita · dettagli in Scansioni</button>}
            {landscape && burstThumb && (
              // Landscape: the series' thumbnail in the bottom right corner, under the shutter and the tools.
              <div className="absolute z-30" data-camera-controls style={{ right: "calc(env(safe-area-inset-right) + 1.6rem)", bottom: "calc(env(safe-area-inset-bottom) + 0.9rem)" }}>{burstThumb}</div>
            )}

            {landscape ? (
              <div className="ar-landscape-layout" data-camera-controls>
                {/* Colonna Sinistra: Informazioni e Analisi */}
                <div className="ar-landscape-left">
                  {/* Riepilogo specie/ombra/raffrescamento nella pillola centrale in alto: a sinistra solo le miniature */}

                </div>

                {/* Colonna Destra: Controlli Fotocamera ed Ergonomia con il pollice */}
                <div className="ar-landscape-right">
                  {toolsOpen && toolsPanelElement}
                  <div className="relative flex items-center justify-end select-none">
                    <ArcZoomDial
                      zoom={zoom}
                      max={ZOOM_MAX}
                      onZoom={setZoom}
                      disabled={!ready || scanning}
                    />
                    <div className="relative z-50 pointer-events-auto">
                      {captureControlElement}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div
                  data-camera-hud
                  className="camera-bottom absolute z-20 flex flex-col items-center gap-2.5 w-full"
                >
                  {/* Card informativo specie / raffrescamento */}
                  {!infoBannerDismissed && !burst && cardHasContent && (
                    <div
                      className={`ar-portrait-specimen-card cursor-grab${zoomRulerActive ? " is-zoom-active" : ""}`}
                      data-camera-controls
                      style={
                        infoBannerDragging
                          ? { transform: `translateY(${infoBannerDragY}px)`, opacity: Math.max(0, 1 - infoBannerDragY / 90), transition: "none" }
                          : undefined
                      }
                      onPointerDown={onBannerPointerDown}
                      onPointerMove={onBannerPointerMove}
                      onPointerUp={onBannerPointerUp}
                      onPointerCancel={onBannerPointerUp}
                      title="Fai uno swipe verso il basso per togliere la Tab info"
                    >
                      {!proving && <button type="button" aria-label="Chiudi la scheda (la riapri da Scansioni)"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); setInfoBannerDismissed(true); hapticTick(); toast("Scheda nascosta", { id: "ar-card", description: "La richiami dal pulsante «Scansioni», a destra dello scatto." }); }}
                        className="absolute right-2 top-2 grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"><X className="size-4" aria-hidden="true" /></button>}
                      <p className={`ar-portrait-specimen-title truncate${proving ? "" : " pr-7"}`}>
                        {shownRecord?.species ? `${shownRecord.species.commonName} (${shownRecord.species.scientificName})` : shownRecord?.soil ? `Suolo: ${shownRecord.soil.label}` : species?.commonName ? `${species.commonName} (${species.scientificName})` : proving ? "AR" : arFocusOption(kind, target).label}
                      </p>
                      <p className="ar-portrait-specimen-desc">
                        {shownRecord?.species?.shade
                          ? `Questa pianta fa circa ${shownRecord.species.shade} m² d’ombra${shownRecord.species.cooling !== null ? ` · fresco stimato ${coolingLabel(shownRecord.species.cooling)}` : ""}`
                          : shownRecord?.soil
                            ? `Permeabilità ${shownRecord.soil.permeability} · ${shownRecord.soil.plantable ? "si può piantare" : "non adatta a piantare"}`
                            : species?.cooling
                              ? `Questa pianta fa circa ${species.cooling.shadeM2} m² d’ombra · fresco stimato ${coolingLabel(species.cooling.deltaT)}`
                              : proving ? "Tocca il terreno per posare la pianta: è un’anteprima." : "Inquadra e avvia la scansione: l’AI riconosce cosa c’è."}
                      </p>
                      {!proving && addButton}
                    </div>
                  )}
                  {toolsOpen && toolsPanelElement}
                  {zoomDialElement}
                  {captureControlElement}
                  {swipeHintElement}
                </div>
              </>
            )}
            {/* Modal veils & alert dialogs: render over all camera controls and burst bar */}
            {guideOpen && <div className="ar-tutorial-veil" data-camera-controls aria-hidden="true" onClick={(e) => { e.stopPropagation(); closeGuide(); }} />}
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
          </div>
        )}
        </CameraCloseGestures>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
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


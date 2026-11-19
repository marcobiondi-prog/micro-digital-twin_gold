import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { Box, Check, Move, Layers, ChevronDown, ChevronLeft, RotateCw, RotateCcw, Zap, ZapOff, CloudDrizzle, Leaf, Droplets, Fence, Flower2, Grape, Shrub, Sparkles, MapPinned, MoveVertical, Ruler, TreeDeciduous, TreePine, Umbrella, Undo2, Wind, X, type LucideIcon } from "lucide-react";
import type { ArKind } from "@/models/ar-focus";
import {
  AR_OBJECTS, joinFitsZone, type JoinFit, alignFromFix, modelScaleFor, nearestPlaced, turnDetents, dragTick, JOINABLE, JOIN_GAP, footCorners, footGap, joinFeet, nearFeedback, type Foot, placeHaptic, zonesInside, horizonAt, pitchForHorizon, alignTwoPoints, arDistance, enToAr, metresText, objectsToZones, toEN,
  type Alignment, type ArObjectDef, type PlacedObject,
} from "@/models/ar-objects";
import { getLab, setUrban, setVineyard } from "@/models/lab-store";
import { drawnAreaFor, type DrawnArea } from "@/models/drawn-area";
import { readFix } from "@/lib/find-position";
import { hapticTick } from "@/lib/haptics";
import { easeTo, FloorTracker, placementFor, RAISED_M, surfaceKind, type SurfaceHit } from "@/models/ar-floor";
import { contactShadow, floorLoop, objectMesh } from "@/views/ar-object-meshes";
import { buildPlan, growPlan, planText, planTreeDefs } from "@/views/ar-plan";
import { realTree, wantsRealTree } from "@/views/ar-tree";
import { ArShadows, castShadows } from "@/views/ar-shadow";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight.js";
import { ZoomDial } from "@/views/ZoomDial";
import { ArcZoomDial } from "@/views/ArcZoomDial";
import { ZOOM_MAX } from "@/lib/camera-zoom";
import { probeCameraTorch, setCameraTorch, supportsCameraTorch } from "@/lib/camera-torch";
import { HOLD_MS, useHoldBurst } from "@/lib/hold-burst";
import { DEPTH_INIT, DepthOccluder, FLIP_MODES, depthFlip, depthWanted, patchGpuDepthQuery, setDepthFlip, setDepthWanted, markDepthRefused } from "@/views/ar-depth";
import { BurstReviewSheet, BurstThumb, burstThumbOf, type BurstShot } from "@/views/BurstReview";

/**
 * «Prova» in live view with ARCore (WebXR immersive-ar, Chrome on Android): the phone's own camera with the floor found
 * by ARCore, a reticle where it meets the floor, and the simulation's objects put on it at real size. The app's buttons
 * sit over the camera through the DOM overlay. Tools: put an object, align the drawn area (touch its pins 1 and 2 on the
 * real floor), measure, undo, bring everything back to the map as zones of the simulation.
 */

/** Is live AR possible here (ARCore through WebXR)? */
export async function arLiveSupported(): Promise<boolean> {
  try {
    return typeof navigator !== "undefined" && !!navigator.xr && (await navigator.xr.isSessionSupported("immersive-ar"));
  } catch { return false; }
}

/** Asks for the AR session; call it straight from a tap (the browser wants a user gesture). */
export async function requestArSession(overlayRoot: HTMLElement): Promise<XRSession> {
  // The session is first asked while the page stays in the camera's fullscreen, so the AR view covers Android's bars
  // like the AI camera. On the user's Xperia every try was once refused in fullscreen, but the cause then turned out to
  // be the site's AR permission being blocked; if a phone still refuses every try in fullscreen, it is remembered
  // (AR_IN_FS_KEY "fail") and from then on the fullscreen is left first, as before. A refusal can spend the tap, so
  // the retry out of fullscreen may answer SecurityError: «Riprova ARCore» then starts it with a fresh tap.
  const report: string[] = [];
  const inFs = typeof document !== "undefined" && !!document.fullscreenElement;
  let fsFail = false;
  try { fsFail = localStorage.getItem(AR_IN_FS_KEY) === "fail"; } catch { /* storage off */ }
  if (inFs && !fsFail) {
    const got = await tryArConfigs(overlayRoot, report, false);
    if (got.session) { try { localStorage.setItem(AR_IN_FS_KEY, "ok"); } catch { /* storage off */ } return got.session; }
    if (!got.allUnsupported) throw new Error(report.join(" · "));
    try { localStorage.setItem(AR_IN_FS_KEY, "fail"); } catch { /* storage off */ }
    report.push("(a schermo intero rifiutata: riprovo fuori)");
  }
  // Out of fullscreen the app's portrait lock comes back, so the orientation the phone is held in is asked to stay
  // (it may be refused; then the AR opens portrait).
  if (typeof document !== "undefined" && document.fullscreenElement) {
    const held = screen.orientation?.type;
    await document.exitFullscreen().catch(() => undefined);
    const o = screen.orientation as ScreenOrientation & { lock?: (v: string) => Promise<void> };
    if (held?.startsWith("landscape")) await o.lock?.(held).catch(() => undefined);
  }
  const got = await tryArConfigs(overlayRoot, report, true);
  if (got.session) return got.session;
  throw new Error(report.join(" · "));
}

const AR_IN_FS_KEY = "mdt-ar-in-fullscreen-v1";

/** Tried in turn, each moving on only on NotSupportedError: with the HUD overlay first, then without it (Chrome shows
 *  its own close button; a tap on the floor still puts the chosen object), then the bare session. */
async function tryArConfigs(overlayRoot: HTMLElement, report: string[], markDepth: boolean): Promise<{ session?: XRSession; allUnsupported: boolean }> {
  const tries: Array<[string, XRSessionInit]> = [
    // ARCore's depth first (real walls and furniture hide the objects), on unless switched off by hand. Optional, so a
    // phone without it still starts.
    ...(depthWanted() ? [["overlay+pavimento+profondità", { requiredFeatures: ["hit-test", "dom-overlay"], optionalFeatures: ["local-floor", "camera-access", "depth-sensing", "light-estimation"], depthSensing: DEPTH_INIT, domOverlay: { root: overlayRoot } } as unknown as XRSessionInit] as [string, XRSessionInit]] : []),
    ["overlay+pavimento", { requiredFeatures: ["hit-test", "dom-overlay"], optionalFeatures: ["local-floor", "camera-access", "light-estimation"], domOverlay: { root: overlayRoot } } as XRSessionInit],
    ["overlay", { requiredFeatures: ["dom-overlay"], optionalFeatures: ["hit-test", "local-floor", "camera-access", "light-estimation"], domOverlay: { root: overlayRoot } } as XRSessionInit],
    ["pavimento", { requiredFeatures: ["hit-test"], optionalFeatures: ["local-floor", "camera-access", "light-estimation"] }],
    ["base", {}],
  ];
  for (const [name, init] of tries) {
    try { return { session: await navigator.xr!.requestSession("immersive-ar", init), allUnsupported: false }; }
    catch (e) {
      report.push(`${name}: ${e instanceof DOMException ? e.name : e instanceof Error ? e.message : String(e)}`);
      // In fullscreen a refusal may come from the fullscreen itself, so the depth is blamed only out of it.
      if (markDepth && e instanceof DOMException && e.name === "NotSupportedError" && name.includes("profondità")) markDepthRefused();
      if (!(e instanceof DOMException) || e.name !== "NotSupportedError") return { allUnsupported: false };
    }
  }
  return { allUnsupported: true };
}

/**
 * The ARCore view in fullscreen like the AI camera: the session is asked out of fullscreen (the user's Xperia refuses
 * it inside), so once it runs the overlay root asks fullscreen again, with the tap's activation still valid. If the
 * phone ends the session because of it (within 2,5 s), this phone is remembered and never asked again.
 */
const AR_FS_KEY = "mdt-ar-fullscreen-v1";
export function arFullscreen(session: XRSession, root: HTMLElement) {
  if (typeof document === "undefined") return;
  try { if (localStorage.getItem(AR_FS_KEY) === "fail") return; } catch { /* storage off */ }
  const el = root as HTMLElement & { requestFullscreen?: (o?: FullscreenOptions) => Promise<void> };
  if (!el.requestFullscreen) return;
  let ended = false;
  const ask = () => {
    if (ended) return;
    const asked = performance.now();
    const onEnd = () => { if (performance.now() - asked < 2500) { try { localStorage.setItem(AR_FS_KEY, "fail"); } catch { /* storage off */ } } };
    session.addEventListener("end", onEnd, { once: true });
    window.setTimeout(() => session.removeEventListener("end", onEnd), 2600);
    // Asked even when the overlay already counts as fullscreen: Chrome's AR overlay leaves Android's navigation bar
    // on screen, and "hide" asks it away.
    void el.requestFullscreen!({ navigationUI: "hide" }).catch(() => undefined);
  };
  ask();
  // The tap that started AR is often spent by the session itself, so the request is made again on the first tap
  // inside the AR view, which carries a fresh activation.
  const onTap = () => { window.removeEventListener("pointerup", onTap, true); ask(); };
  window.addEventListener("pointerup", onTap, true);
  session.addEventListener("end", () => { ended = true; window.removeEventListener("pointerup", onTap, true); }, { once: true });
}

type Tool = "place" | "align" | "measure" | "move";
type V = { x: number; y: number; z: number };

/**
 * Without ARCore (iPhone, older phones, computers) the same tools run as a preview: the objects are drawn over the
 * camera on a floor guessed from how the phone is held (eyes at 1,5 m, the floor's tilt from the phone's tilt), so sizes
 * are close but not anchored. With a session it is the real live AR.
 */
/** The "Tocca per ruotare la vista AR" notice when the phone is turned during an ARCore session. */
const ROTATE_PROMPT = false;

export function ArLive({ kind, session, stream = null, plants = [], onShot, onEnd, onRotate, why, burst, torch = false, onFlashPreview, carry, rotation = 0, onRetry }: { onRetry?: () => void; rotation?: number; burst: ArBurst; torch?: boolean; onFlashPreview?: (carry: PlacedObject[]) => void; carry?: PlacedObject[] | undefined; why?: string | undefined; kind: ArKind; session: XRSession | null; stream?: MediaStream | null; plants?: ArObjectDef[]; onShot?: (file: File) => void; onEnd: () => void; onRotate?: () => void }) {
  // Chrome locks the screen to the orientation the AR session started in, and a web page cannot unlock it. When the
  // phone is held the other way for a moment, a tap restarts the session in the new orientation (onRotate).
  // Off at the user's word ("non mi deve uscire questo avviso quando ruoto"): the AR stays in the orientation it
  // started in; ROTATE_PROMPT true brings the notice back.
  const [turned, setTurned] = useState(false);
  useEffect(() => {
    if (!ROTATE_PROMPT || !session || !onRotate) return;
    const lockedLandscape = window.innerWidth > window.innerHeight;
    let since = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      const ax = Math.abs(g.x), ay = Math.abs(g.y);
      if (Math.max(ax, ay) < 4) return; // flat: no side is down
      const heldLandscape = ax > ay * 1.3, heldPortrait = ay > ax * 1.3;
      const other = lockedLandscape ? heldPortrait : heldLandscape;
      const now = performance.now();
      if (other) { if (!since) since = now; if (now - since > 800) setTurned(true); }
      else if (lockedLandscape ? heldLandscape : heldPortrait) { since = 0; setTurned(false); }
    };
    window.addEventListener("devicemotion", onMotion);
    return () => window.removeEventListener("devicemotion", onMotion);
  }, [session, onRotate]);
  // With ARCore Chrome keeps the screen in the orientation the session started in (a page cannot unlock it), so the
  // HUD would stay sideways when the phone is turned. Gravity says how the phone is held; the HUD is turned by CSS to
  // read upright (the camera's world tracking needs no turn), after 0,35 s held the new way.
  const [hudTurn, setHudTurn] = useState(0);
  const [, setVp] = useState(0);
  useEffect(() => {
    if (!session) { setHudTurn(0); return; }
    let want = 0, since = 0;
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null || g.y == null) return;
      const ax = Math.abs(g.x), ay = Math.abs(g.y);
      if (Math.max(ax, ay) < 4) return; // flat: keep the last
      let held: number | null = null;
      if (ay > ax * 1.3) held = g.y > 0 ? 0 : 180;
      else if (ax > ay * 1.3) held = g.x > 0 ? 90 : 270;
      if (held === null || held === 180) return;
      const screenAngle = (screen.orientation?.angle ?? 0) % 360;
      let turn = (held - screenAngle + 360) % 360;
      if (turn === 270) turn = -90;
      if (turn === 180) return;
      const now = performance.now();
      if (turn !== want) { want = turn; since = now; return; }
      if (now - since > 350) setHudTurn((t) => (t === turn ? t : turn));
    };
    const onResize = () => setVp((n) => n + 1);
    window.addEventListener("devicemotion", onMotion);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("devicemotion", onMotion); window.removeEventListener("resize", onResize); };
  }, [session]);
  const hudTurnStyle: React.CSSProperties = hudTurn && session && typeof window !== "undefined"
    ? { inset: "auto", left: "50%", top: "50%", width: `${window.innerHeight}px`, height: `${window.innerWidth}px`, transform: `translate(-50%, -50%) rotate(${hudTurn}deg)`, transition: "transform 250ms ease", paddingLeft: "1.75rem", paddingRight: "1.75rem" }
    : {};
  // The plants recognised by «Rileva» come first (key "p:<i>"), then the flow's own objects (key = their id).
  const choices = useMemo(() => [
    ...plants.map((d, i) => ({ key: `p:${i}`, def: d })),
    ...AR_OBJECTS[kind].map((d) => ({ key: d.id as string, def: d })),
  ], [kind, plants]);
  const [selected, setSelected] = useState<string>(choices[0]!.key);
  const defOf = (key: string) => choices.find((c) => c.key === key)?.def ?? AR_OBJECTS[kind][0]!;
  const [tool, setTool] = useState<Tool>("place");
  // «Regola pavimento» (preview only): an offset added to the phone's tilt so the guessed floor meets the real one.
  // The first time on this phone the preview opens on it, so the floor is set before anything is put.
  // The first preview on a phone opens on «Regola pavimento» (taps then adjust the horizon, they put nothing), but not
  // when it comes from ARCore's flash: there it looked as if objects could no longer be put.
  const [adjusting, setAdjusting] = useState(() => !session && !torch && !hasFloorOffset());
  // Bumped when the preview's WebGL context is lost, to build the 3D again.
  const [glLost, setGlLost] = useState(0);
  const adjustingRef = useRef(false);
  adjustingRef.current = adjusting;
  const floorRef = useRef({ tilt: -14, offset: readFloorOffset(), yaw: 0 });
  const horizonLine = useRef<HTMLDivElement>(null);
  // Zoom of the preview (the camera's own dial, in landscape): the picture is cropped from its middle and the 3D
  // camera narrows its view by the same amount, so the objects stay on the floor they were put on.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const [found, setFound] = useState(false);
  // What the reticle stands on: the floor, a raised flat surface (a model on a table) or the floor under a wall or table.
  const surfaceRef = useRef<"floor" | "raised" | "floor-under">("floor");
  const [surface, setSurface] = useState<"floor" | "raised" | "floor-under">("floor");
  const [placed, setPlaced] = useState<PlacedObject[]>([]);
  // «Modellino»: everything smaller, to try indoors or see the whole piazza on a table (not sent to the map). Its
  // scale is fitted to the space round the phone when it is switched on (modelScaleFor: ARCore's depth when given).
  const [model, setModel] = useState(false);
  const [modelScale, setModelScale] = useState(MODEL_SCALE);
  const modelK = model ? modelScale : 1;
  // «Sposta»: the object picked up follows the reticle (ARCore) until the next tap puts it down.
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const grabRef = useRef<string | null>(null);
  grabRef.current = grabbed;
  /** The object moved by a finger right now (for the ring under it and the join feedback). */
  const touchHeldRef = useRef<string | null>(null);
  const [touchHeld, setTouchHeld] = useState<string | null>(null);
  const modelRef = useRef(modelK);
  modelRef.current = modelK;
  // Two fingers resize the last object put down; taps around a pinch never put a new one.
  const pinchUntil = useRef(0);
  // A photo asked with ARCore: taken in the next frame, when the camera image can be read.
  const wantShot = useRef<"" | "single" | "multi">("");
  // Whether this session gives the page the camera's image ("camera-access"): without it the shutter is hidden.
  const camShotOk = !session || !(session as XRSession & { enabledFeatures?: readonly string[] }).enabledFeatures
    || (session as XRSession & { enabledFeatures: readonly string[] }).enabledFeatures.includes("camera-access");
  const [alignPts, setAlignPts] = useState<V[]>([]);
  const [alignment, setAlignment] = useState<{ a: Alignment; how: "corners" | "gps" } | null>(null);
  const [measure, setMeasure] = useState<V[]>([]);
  const hudRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Messages written over the camera: the app's toasts sit under the camera's dialog.
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  // Why the preview runs instead of ARCore: written in the status line once, at the start.
  useEffect(() => { if (why) setNotice({ text: why, tone: "warn" }); }, [why]);
  // Come from ARCore's flash: said that this is the preview and that a tap on the floor puts the object.
  useEffect(() => { if (torch && !session && !why) setNotice({ text: carry?.length ? `Flash acceso: sei nell’anteprima senza ARCore. I tuoi ${carry.length === 1 ? "oggetto resta" : `${carry.length} oggetti restano`} davanti a te, dove li avevi messi; le misure sono indicative.` : "Flash acceso: sei nell’anteprima senza ARCore. Tocca il pavimento per posare gli oggetti; le misure sono indicative.", tone: "warn" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // What the AR session really got (shown in the open status bar): to tell, on a phone, why it does not work.
  const [diag, setDiag] = useState<{ hit?: boolean; overlay?: boolean; feats?: string; frames: number; error?: string; depth?: boolean }>({ frames: 0 });
  // ARCore's depth: real walls and furniture hide the objects behind them. «Profondità» in the fan turns it off.
  const depthRef = useRef<DepthOccluder | null>(null);
  const [depthOn, setDepthOn] = useState(true);
  const [depthLive, setDepthLive] = useState(false);
  const [flip, setFlip] = useState(depthFlip);
  useEffect(() => { if (depthRef.current) depthRef.current.enabled = depthOn; }, [depthOn]);
  const framesRef = useRef(0);
  const barOpenRef = useRef(false);
  const rotRef = useRef(rotation);
  rotRef.current = rotation;
  useEffect(() => {
    if (!session) return;
    // Only while the bar is open (the line is shown there): a re-render of the whole view every second slowed the phone.
    const id = window.setInterval(() => { if (barOpenRef.current) setDiag((d) => (d.frames === framesRef.current ? d : { ...d, frames: framesRef.current })); }, 1000);
    return () => window.clearInterval(id);
  }, [session]);
  // Flash: the camera's own torch, in the preview only (with ARCore the browser owns the camera and gives the page
  // no way to light it). It starts as the AI camera left it, and is switched off when the AR view closes.
  const torchTrack = stream?.getVideoTracks()[0];
  const [torchFound, setTorchFound] = useState(false);
  useEffect(() => {
    setTorchFound(false);
    if (session || !torchTrack) return;
    let gone = false;
    void probeCameraTorch(torchTrack).then((ok) => { if (!gone) setTorchFound(ok); });
    return () => { gone = true; };
  }, [session, torchTrack]);
  const torchOk = !session && (supportsCameraTorch(torchTrack) || torchFound);
  const [torchOn, setTorchOn] = useState(() => {
    try { return !!(torchTrack?.getSettings() as MediaTrackSettings & { torch?: boolean } | undefined)?.torch; } catch { return false; }
  });
  const toggleTorch = async () => {
    const next = !torchOn;
    if (await setCameraTorch(torchTrack, next, true)) { setTorchOn(next); hapticTick([10]); }
    else setNotice({ text: "Non riesco ad accendere il flash di questa fotocamera.", tone: "warn" });
  };
  useEffect(() => () => { if (torchTrack) void setCameraTorch(torchTrack, false, true); }, [torchTrack]);
  // Come from ARCore through its flash button: the preview opens with the torch already on.
  const torchAsked = useRef(false);
  useEffect(() => {
    if (!torch || torchAsked.current || !torchOk) return;
    torchAsked.current = true;
    // Some phones refuse the torch for a moment while the camera is still starting: try a few times.
    const tryOn = (left: number) => void setCameraTorch(torchTrack, true, true).then((ok) => {
      if (ok) { setTorchOn(true); hapticTick([10]); setNotice({ text: "Flash acceso: sei nell’anteprima senza ARCore (le misure sono indicative)", tone: "ok" }); }
      else if (left > 0) window.setTimeout(() => tryOn(left - 1), 400);
      else setNotice({ text: "Non riesco ad accendere il flash: toccalo di nuovo in alto a destra.", tone: "warn" });
    });
    tryOn(4);
  }, [torch, torchOk, torchTrack]);
  useEffect(() => {
    const v = videoRef.current;
    if (v && stream) { v.srcObject = stream; void v.play().catch(() => undefined); }
  }, [stream]);
  const canvasHost = useRef<HTMLDivElement>(null);
  const end = () => { if (session) void session.end().catch(() => undefined); else onEnd(); };
  const defOfRef = useRef(defOf);
  defOfRef.current = defOf;
  const live = useRef({ selected, tool, placed, alignPts, measure });
  live.current = { selected, tool, placed, alignPts, measure };
  const shadowsRef = useRef<ArShadows | null>(null);
  // The project's interventions shown on their spots once aligned; a key so they follow the levers.
  const [showPlan, setShowPlan] = useState(true);
  // The map's pergolas and aiuole that touch or nearly touch join by themselves, like the ones brought close by hand.
  const merge = true, joinBeds = true;
  const planSaid = useRef("");
  const three = useRef<{ scene: THREE.Scene; reticle: THREE.Object3D; hit: V | null; objects: Map<string, THREE.Object3D>; overlay: THREE.Group; measure: THREE.Group; floorY: number | null; renderer: THREE.WebGLRenderer; camera: THREE.Camera } | null>(null);

  const lab = getLab();
  const loc = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const area: DrawnArea | null = drawnAreaFor(kind === "urban" ? lab.urban.area : lab.vineyard.area, loc);
  const u = lab.urban, vz = lab.vineyard.zones;
  const plantsRef = useRef(plants);
  plantsRef.current = plants;
  const plantKey = plants.map((p) => p.plant?.scientificName ?? p.id).join("|");
  const planKey = kind === "urban" ? `${u.trees}|${u.permeable}|${u.shade}|${u.misters ?? 0}|${u.sprinklers ?? 0}` : JSON.stringify(vz.map((z) => [z.irrigation, z.shade, z.windbreak]));
  // The metre frame of the map: the area's middle (else the place).
  const origin = useMemo(() => {
    if (!area) return { lat: loc.lat, lng: loc.lng };
    const r = area.ring;
    return { lat: r.reduce((s, p) => s + p[0], 0) / r.length, lng: r.reduce((s, p) => s + p[1], 0) / r.length };
  }, [area, loc.lat, loc.lng]);
  // What a join needs to know where the zones lie on the floor (read in the render loop).
  const joinCtx = useRef({ a: null as Alignment | null, origin, zones: area?.zones });
  joinCtx.current = { a: alignment?.a ?? null, origin, zones: area?.zones };
  // In the «Modellino» the spots are not the real ones, so there the zones are not asked.
  const fitOf = (id: string, u: Foot): JoinFit => modelRef.current < 1 ? "fits" : joinFitsZone(u, id === "pergolato" ? "ombra" : "prato", joinCtx.current.zones, joinCtx.current.a, joinCtx.current.origin);
  const fitWhy = (fit: JoinFit, pg: boolean) => fit === "noalign" ? "allinea prima l’AR alla mappa (Riporta, i 2 punti)"
    : fit === "nozone" ? `disegna sulla mappa una zona ${pg ? "Vele" : "Aiuole"}`
    : `uniti uscirebbero dalla zona ${pg ? "Vele" : "Aiuole"}`;

  // The session: three.js on WebXR, the hit test from the screen's centre, a reticle on the floor.
  useEffect(() => {
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    // Lighter on the phone: the preview drawn at most at 1,5× the screen's pixels (the camera's picture behind it is
    // its own video, untouched), ARCore's frame at 80 % of its size; the objects themselves are unchanged.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.xr.setFramebufferScaleFactor(0.8);
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local");
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#666655", 1.6));
    const sun = new THREE.DirectionalLight("#fff8e8", 1.4);
    sun.position.set(3, 8, 2);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera();
    // Real shadows on the floor (views/ar-shadow), from ARCore's light direction when it gives one.
    const shadows = new ArShadows(renderer, scene);
    shadowsRef.current = shadows;
    // ARCore's light estimate: the objects take the room's or the piazza's own light and reflections instead of the
    // fixed lights above, which come back if the estimate stops.
    let est: XREstimatedLight | null = null;
    if (session) {
      est = new XREstimatedLight(renderer);
      const fixed = scene.children.filter((c) => (c as THREE.Light).isLight);
      const e = est;
      e.addEventListener("estimationstart", () => {
        for (const l of fixed) l.visible = false;
        scene.add(e);
      });
      e.addEventListener("estimationend", () => {
        scene.remove(e);
        scene.environment = null;
        for (const l of fixed) l.visible = true;
      });
    }
    // The reticle: as wide as what a tap would put (fitReticle), drawn after the depth pass and without writing depth,
    // so real furniture never makes it vanish and it never hides the objects.
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#00e5ff", transparent: true, opacity: 0.85, depthTest: false, depthWrite: false }));
    reticle.renderOrder = 998;
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    const overlay = new THREE.Group(), measureG = new THREE.Group();
    scene.add(overlay, measureG);
    three.current = { scene, reticle, hit: null, objects: new Map(), overlay, measure: measureG, floorY: null, renderer, camera };

    // Where the phone is and points at the start: the map's alignment until the two corners are touched.
    void readFix().then((fix) => {
      if (disposed || !fix || fix.heading === null) return;
      setAlignment((cur) => cur ?? { a: alignFromFix(toEN(fix.lat, fix.lng, origin), fix.heading!), how: "gps" });
    });
    let hitSource: XRHitTestSource | null = null;
    const occluder = session && depthWanted() ? new DepthOccluder() : null;
    if (occluder) { occluder.enabled = depthOn; scene.add(occluder.mesh); depthRef.current = occluder; patchGpuDepthQuery(); }
    if (!session) {
      // The objects already put stay: after a lost WebGL context the list is drawn again, and coming from ARCore's
      // flash the ones put there (carried over, set relative to the phone) stand where they were.
      const keep = placedRef.current.length ? placedRef.current : (carry ?? []);
      for (const o of keep) addPlacedMesh(three.current, o, 0);
      if (!placedRef.current.length && carry?.length) setPlaced(carry);
      return startPreview(renderer, scene, camera, reticle, () => { disposed = true; });
    }
    void (async () => {
      try {
        await renderer.xr.setSession(session as unknown as Parameters<THREE.WebXRManager["setSession"]>[0]);
        const viewer = await session.requestReferenceSpace("viewer");
        // A session granted without hit-test still runs; it just cannot find the floor, and says so.
        const ask = session.requestHitTestSource?.bind(session);
        hitSource = ask ? ((await ask({ space: viewer })?.catch(() => null)) ?? null) : null;
        const feats = (session as XRSession & { enabledFeatures?: readonly string[] }).enabledFeatures;
        setDiag((d) => ({ ...d, hit: !!hitSource, overlay: !!session.domOverlayState, feats: feats ? [...feats].join(", ") : "?" }));
        if (!hitSource) setNotice({ text: "ARCore è partito senza il rilevamento del pavimento: gli oggetti non si posano a terra qui.", tone: "warn" });
      } catch (e) {
        setDiag((d) => ({ ...d, error: e instanceof Error ? e.message : String(e) }));
        toast.error("La realtà aumentata non è partita", { description: e instanceof Error ? e.message : String(e) });
        void session.end().catch(() => undefined);
      }
    })();

    let sawFloor = false;
    let lostAt = 0;
    // The floor, gathered from every flat hit (the lowest level seen again and again), the reticle eased on it, and the
    // last good spot held a moment so one frame without an answer does not make it blink.
    const tracker = new FloorTracker();
    let shown: V | null = null;
    let lastGood = 0;
    const reticleMat = reticle.material as THREE.MeshBasicMaterial;
    renderer.setAnimationLoop((_t, frame?: XRFrame) => {
      if (frame) framesRef.current += 1;
      // The estimated reflections arrive a little after the light: used as soon as they do.
      if (est?.parent && est.environment && scene.environment !== est.environment) scene.environment = est.environment;
      const t = three.current;
      if (!t) return;
      if (frame && hitSource) {
        const ref = renderer.xr.getReferenceSpace();
        const now = performance.now();
        const hits = ref ? frame.getHitTestResults(hitSource) : [];
        // The first hit that is a surface at all, with how much it faces up (the pose's Y axis is its normal).
        let hit: SurfaceHit | null = null;
        for (const h of hits) {
          const pose = ref ? h.getPose(ref) : null;
          if (!pose) continue;
          const m = pose.transform.matrix, p = pose.transform.position;
          const cand = { x: p.x, y: p.y, z: p.z, up: m[5] ?? 1 };
          if (!hit) hit = cand;
          if (surfaceKind(cand.up) === "flat") { hit = cand; break; }
        }
        if (hit && surfaceKind(hit.up) === "flat") tracker.add(hit.y, now);
        const floor = tracker.floorY() ?? (hit && surfaceKind(hit.up) === "flat" ? hit.y : t.floorY);
        // The floor moved (found lower, or refined): objects standing on the old floor follow it.
        if (floor !== null && t.floorY !== null && Math.abs(floor - t.floorY) > 0.03) {
          for (const g of t.objects.values()) if (Math.abs(g.position.y - t.floorY) < RAISED_M) g.position.y = floor;
        }
        if (floor !== null) t.floorY = floor;
        const place = placementFor(hit, t.floorY, modelRef.current < 1);
        let target: V | null = null;
        if (place && hit && place.kind !== "floor-under") target = { x: hit.x, y: place.y, z: hit.z };
        else if (place && ref) {
          // A wall, a slope or a table at real size: the spot on the floor straight under the screen's centre.
          const vp = frame.getViewerPose(ref);
          if (vp) {
            const o = vp.transform.position, q = vp.transform.orientation;
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
            if (dir.y < -0.05) {
              const k = (place.y - o.y) / dir.y;
              if (k > 0 && k < 40) target = { x: o.x + dir.x * k, y: place.y, z: o.z + dir.z * k };
            }
          }
        }
        if (target) {
          shown = easeTo(shown, target);
          lastGood = now;
          reticle.visible = true;
          reticle.matrix.makeTranslation(shown.x, shown.y + 0.005, shown.z);
          reticleMat.opacity = place?.kind === "floor-under" ? 0.5 : 0.85;
          fitReticle(reticle);
          t.hit = { ...shown };
          const sk = place?.kind ?? "floor";
          if (surfaceRef.current !== sk) { surfaceRef.current = sk; setSurface(sk); }
          // The floor found: a clear double pulse the first time, a short one when it is found again after losing it.
          if (!sawFloor && tracker.count > 0) { sawFloor = true; setFound(true); hapticTick([40, 60, 40]); }
          else if (lostAt && now - lostAt > 1500) hapticTick([30]);
          lostAt = 0;
        } else if (now - lastGood > 400) {
          reticle.visible = false; t.hit = null; shown = null;
          if (sawFloor && !lostAt) lostAt = now;
        }
      }
      if (frame && occluder) {
        const ref = renderer.xr.getReferenceSpace();
        const view = ref ? frame.getViewerPose(ref)?.views[0] : undefined;
        const had = occluder.live;
        // The depth map every other frame: it changes slowly and reading it is the heaviest part of a frame.
        if (framesRef.current % 2 === 0) occluder.update(frame, view, (session as XRSession & { depthDataFormat?: string }).depthDataFormat);
        if (had !== occluder.live) { setDepthLive(occluder.live); setDiag((d) => ({ ...d, depth: occluder.live })); }
      }
      frameTick(t, reticle);
      const estDir = est?.parent ? est.directionalLight?.position : null;
      shadows.update(t.objects.values(), t.floorY, estDir);
      renderer.render(scene, camera);
      if (frame && wantShot.current) {
        const multi = wantShot.current === "multi";
        wantShot.current = "";
        const file = captureXrPhoto(renderer, scene, reticle, session, frame, multi);
        void file.then((f) => { if (f) savedShotRef.current(f, multi); else setNotice({ text: "Questo telefono non dà la fotocamera all’AR: fai uno screenshot", tone: "warn" }); });
      }
    });

    session.addEventListener("select", () => placeAtHit());
    const onEndSession = () => onEnd();
    session.addEventListener("end", onEndSession);
    const hud = hudRef.current;
    const block = (e: Event) => e.preventDefault();
    hud?.addEventListener("beforexrselect", block);
    return () => {
      disposed = true;
      hud?.removeEventListener("beforexrselect", block);
      session.removeEventListener("end", onEndSession);
      renderer.setAnimationLoop(null);
      occluder?.dispose();
      depthRef.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      three.current = null;
    };
    // The session is fixed for this component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, glLost]);

  /** The preview without ARCore: a transparent canvas over the camera, a floor 1,5 m under the eyes. */
  function startPreview(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, reticle: THREE.Mesh, stop: () => void) {
    const host = canvasHost.current;
    if (!host) return;
    renderer.xr.enabled = false;
    const el = renderer.domElement;
    // Above the camera's video always: coming from ARCore's flash the video arrives after the canvas and React put it
    // last, over the 3D, so the objects carried over and the reticle were hidden behind the picture.
    el.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:1";
    host.appendChild(el);
    const size = () => {
      const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.fov = fovAt(zoomRef.current); camera.near = 0.05; camera.far = 200; camera.updateProjectionMatrix();
    };
    size();
    const fl = floorRef.current;
    // How far the camera looks up or down, whichever way the phone is held: the elevation of the back camera's axis
    // (−z of the device) from beta and gamma. Read as beta − 90 alone it was right only upright: turned sideways the
    // floor was guessed far off and taps on it put nothing.
    const devQ = new THREE.Quaternion(), scrQ = new THREE.Quaternion(), devE = new THREE.Euler();
    const Q_BACK = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2), Z_AXIS = new THREE.Vector3(0, 0, 1);
    let yaw0: number | null = null;
    fl.yaw = 0;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.beta === null) return;
      const b = (e.beta * Math.PI) / 180, g = ((e.gamma ?? 0) * Math.PI) / 180;
      const elev = (Math.asin(Math.max(-1, Math.min(1, -Math.cos(b) * Math.cos(g)))) * 180) / Math.PI;
      fl.tilt = Math.max(-80, Math.min(-8, elev));
      // Where the phone points round the vertical, so turning it leaves the objects where they stand instead of
      // carrying them along (the preview has no tracking: only the turn is known, not a step). The camera's −z axis
      // from alpha, beta, gamma and the screen's angle, as three's device-orientation controls do; the first reading
      // is "straight ahead", the direction the objects were put or carried in.
      if (e.alpha === null) return;
      devQ.setFromEuler(devE.set(b, (e.alpha * Math.PI) / 180, -g, "YXZ")).multiply(Q_BACK)
        .multiply(scrQ.setFromAxisAngle(Z_AXIS, -(((screen.orientation?.angle ?? 0) * Math.PI) / 180)));
      const y = new THREE.Euler().setFromQuaternion(devQ, "YXZ").y;
      if (yaw0 === null) yaw0 = y;
      let d = y - yaw0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      // A little smoothing against the sensor's jitter, the short way round.
      let step = d - fl.yaw;
      while (step > Math.PI) step -= 2 * Math.PI;
      while (step < -Math.PI) step += 2 * Math.PI;
      fl.yaw += step * 0.5;
    };
    window.addEventListener("deviceorientation", onTilt);
    window.addEventListener("resize", size);
    camera.position.set(0, 1.5, 0);
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ray = new THREE.Raycaster();
    const at = (nx: number, ny: number): V | null => {
      ray.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1)), camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(floor, p) || p.length() > 60) return null;
      return { x: p.x, y: 0, z: p.z };
    };
    if (three.current) three.current.floorY = 0;
    setFound(true);
    // The preview at 30 frames a second: the camera's picture is its own video, the 3D over it needs no more.
    let lastDraw = 0;
    renderer.setAnimationLoop((now: number) => {
      if (now - lastDraw < 30) return;
      lastDraw = now;
      const fov = fovAt(zoomRef.current);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const pitch = Math.max(-80, Math.min(10, fl.tilt + fl.offset));
      camera.rotation.set((pitch * Math.PI) / 180, fl.yaw, 0, "YXZ");
      if (horizonLine.current) horizonLine.current.style.top = `${(horizonAt(pitch, camera.fov) * 100).toFixed(2)}%`;
      camera.updateMatrixWorld();
      const t = three.current;
      const c = at(0.5, 0.62);
      if (t) t.hit = c;
      reticle.visible = !!c;
      if (c) { reticle.matrix.makeTranslation(c.x, 0.01, c.z); fitReticle(reticle); }
      if (t) frameTick(t, reticle);
      if (t) shadowsRef.current?.update(t.objects.values(), t.floorY, null);
      renderer.render(scene, camera);
    });
    // Taps are read on the window, on the way down: a tap on the canvas alone was lost on the phone once the preview
    // came from ARCore's flash (nothing could be put). Controls, sheets and drags are left out.
    let down: { x: number; y: number; id: number } | null = null;
    const SKIP = "button, a, input, [role=slider], .ar-sheet, .ar-tutorial, [aria-label='Scatti del multiplo']";
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; };
    const onTap = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || d.id !== e.pointerId || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
      if ((e.target as Element | null)?.closest?.(SKIP)) return;
      if (adjustingRef.current) return;
      // An object in hand follows the reticle: a tap anywhere puts it down there.
      if (live.current.tool === "move" && grabRef.current) { placeAtHit(); return; }
      const n = toCanvas(e.clientX, e.clientY);
      const p = n ? at(n.nx, n.ny) : null;
      if (p && three.current) { three.current.hit = p; placeAtHit(); }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onTap, true);
    // A WebGL context the phone takes back (too many after an ARCore session) is built again.
    const onLost = (ev: Event) => { ev.preventDefault(); setGlLost((n) => n + 1); };
    el.addEventListener("webglcontextlost", onLost);
    return () => {
      stop();
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onTap, true);
      el.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("resize", size);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.forceContextLoss();
      el.remove();
      three.current = null;
    };
  }

  function placeAtHit() {
      const t = three.current, hit = t?.hit;
      if (!t || !hit || performance.now() < pinchUntil.current) return;
      const { tool: tl } = live.current;
      if (tl === "move") { moveAt(hit); return; }
      if (tl === "place") {
        const def = defOfRef.current(live.current.selected);
        const uid = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const g = objectMesh(def);
        // The pergola, the bed and the misting pole are planted in the floor with their own footings: no round shadow.
        const shadow = def.id !== "pergolato" && def.id !== "aiuola" && def.id !== "nebulizzatore" && def.id !== "innaffiatoio" ? contactShadow(def) : null;
        if (shadow) g.add(shadow);
        // A realistic tree (EZ-Tree) takes the simple shape's place once it is grown; until then, or if it fails, the
        // simple one stays.
        if (wantsRealTree(def)) void realTree(def).then((tree) => {
          if (!tree || three.current?.objects.get(uid) !== g) return;
          for (const c of [...g.children]) if (c !== shadow) g.remove(c);
          castShadows(tree);
          g.add(tree);
        });
        // A pergola or a shade cloth stands on posts at its edges: put by its centre, its posts fell 2 m beyond the
        // tap, often behind a desk or a wall, and it looked afloat. It is put instead with the middle of its near side
        // on the spot tapped, turned to face the phone, so its front posts stand right where one looks.
        let { cx, cz, yaw } = placementOf(def, hit, t);
        g.rotation.y = -yaw;
        // A new object takes the size given last with two fingers, so what is put after it stays in proportion.
        const k = sizeRef.current;
        // Obstacles (ARCore's depth): where something real stands in the object's way it is brought towards the phone,
        // 15 cm at a time, until it is free; if no spot is free it stays where tapped and says so.
        let moved = 0, stuck = false;
        if (obstacleAt(def, cx, hit.y, cz, yaw, modelRef.current * k)) {
          const eye = eyeOf(t);
          const dx = eye.x - cx, dz = eye.z - cz, len = Math.hypot(dx, dz);
          stuck = true;
          for (let step = 0.15; len > 0.3 && step < Math.min(2, len - 0.3); step += 0.15) {
            const nx = cx + (dx / len) * step, nz = cz + (dz / len) * step;
            if (!obstacleAt(def, nx, hit.y, nz, yaw, modelRef.current * k)) { cx = nx; cz = nz; moved = step; stuck = false; break; }
          }
        }
        g.position.set(cx, hit.y, cz);
        g.scale.setScalar(modelRef.current * k);
        castShadows(g);
        t.scene.add(g);
        t.objects.set(uid, g);
        const fresh: PlacedObject = { uid, id: def.id, x: cx, z: cz, yaw, ...(k !== 1 ? { scale: k } : {}), ...(def.plant ? { def } : {}) };
        setPlaced((l) => [...l, fresh]);
        // Put down close to another of its kind (pergola, aiuola): the two become one.
        if (tryJoin(fresh, hit.y)) return;
        if (stuck) setNotice({ text: `${def.label}: qui c’è un ostacolo davanti. Usa «Sposta» o rimpiccioliscilo con due dita`, tone: "warn" });
        else if (moved) setNotice({ text: `${def.label}: c’era un ostacolo, l’ho messo ${metresText(moved)} più vicino a te`, tone: "ok" });
        else if (k !== 1) setNotice({ text: `${def.label} · ${metresText(def.h * k)} di altezza, in scala come il precedente (${Math.round(k * 100)} %)`, tone: "ok" });
        hapticTick(placeHaptic(def));
      } else if (tl === "align") {
        setAlignPts((pts) => (pts.length >= 2 ? [hit] : [...pts, hit]));
        hapticTick([30]);
      } else {
        setMeasure((pts) => (pts.length >= 2 ? [hit] : [...pts, hit]));
        hapticTick([30]);
      }
  }

  /** Where an object goes for a tap on the floor: on the spot, or — a pergola, a shade cloth — with the middle of its
   *  near side there, turned to face the phone (put by its centre its posts fell 2 m beyond, behind desks and walls). */
  function placementOf(def: ArObjectDef, hit: V, t: NonNullable<typeof three.current>): { cx: number; cz: number; yaw: number } {
    if (def.id !== "pergolato" && def.id !== "telo") return { cx: hit.x, cz: hit.z, yaw: 0 };
    const eye = eyeOf(t);
    let dx = hit.x - eye.x, dz = hit.z - eye.z;
    const len = Math.hypot(dx, dz);
    if (len <= 0.05) return { cx: hit.x, cz: hit.z, yaw: 0 };
    dx /= len; dz /= len;
    const reach = (def.d / 2 - 0.12) * modelRef.current * sizeRef.current;
    return { cx: hit.x + dx * reach, cz: hit.z + dz * reach, yaw: -Math.atan2(dx, dz) };
  }

  /** An object's footprint on the floor at the size it is drawn. */
  function footOf(o: PlacedObject, x = o.x, z = o.z): Foot {
    const def = o.def ?? defOfRef.current(o.id), k = modelRef.current * (o.scale ?? 1);
    return { x, z, w: def.w * k, d: def.d * k, rot: -o.yaw };
  }
  /** The nearest placed object of the same kind (pergola with pergola, aiuola with aiuola) and the free gap to it. */
  function nearestOfKind(id: string, foot: Foot, skip?: string): { o: PlacedObject; gap: number } | null {
    let best: { o: PlacedObject; gap: number } | null = null;
    for (const o of live.current.placed) {
      if (o.id !== id || o.uid === skip) continue;
      const gap = footGap(foot, footOf(o));
      if (!best || gap < best.gap) best = { o, gap };
    }
    return best;
  }

  /** Every frame: the object in hand rides on the reticle, the reticle says obstacles, and bringing a pergola or an
   *  aiuola close to another of its kind gives an adaptive feedback. */
  function frameTick(t: NonNullable<typeof three.current>, reticle: THREE.Object3D) {
    const gid = grabRef.current, go = gid ? t.objects.get(gid) : undefined;
    if (go && t.hit) go.position.set(t.hit.x + grabOff.current.x, t.hit.y, t.hit.z + grabOff.current.z);
    // …and turns as the phone turns (with ARCore; the preview's camera never turns sideways), a tick every 15°.
    if (go && grabTurn.current) {
      const turn = camYaw(t) - grabTurn.current.cam0;
      go.rotation.y = grabTurn.current.rot0 + turn;
      const deg = (turn * 180) / Math.PI, det = turnDetents(grabTurn.current.lastDeg, deg);
      if (det.quarter) hapticTick([25, 30, 25]); else if (det.steps) hapticTick([8]);
      grabTurn.current.lastDeg = deg;
    }
    if (t.hit && ++obstacleTick.current % 8 === 0) {
      const def = defOfRef.current(live.current.selected);
      const blocked = live.current.tool === "place" && obstacleAt(def, t.hit.x, t.hit.y, t.hit.z, 0, modelRef.current * sizeRef.current);
      ((reticle as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(blocked ? "#f59e0b" : "#00e5ff");
    }
    proximity(t);
  }

  /**
   * The adaptive feedback while bringing a pergola or an aiuola close to another of its kind — the one in hand with
   * «Sposta», or the one about to be put where the reticle is: the other one is outlined, yellow turning green as the
   * gap closes; the phone ticks faster and stronger (nearFeedback); the line on top says how far it is; within
   * JOIN_GAP it is green with a double pulse: put down there, the two become one.
   */
  const nearState = useRef<{ stage: string; last: number; said: string; saidAt: number; target: string }>({ stage: "far", last: 0, said: "", saidAt: 0, target: "" });
  const nearRing = useRef<THREE.LineLoop | null>(null);
  function proximity(t: NonNullable<typeof three.current>) {
    const s = nearState.current, now = performance.now();
    let cand: { id: string; foot: Foot; skip?: string } | null = null;
    const gid = grabRef.current ?? touchHeldRef.current;
    if (gid) {
      const o = live.current.placed.find((p) => p.uid === gid), g = t.objects.get(gid);
      if (o && g && JOINABLE.has(o.id)) cand = { id: o.id, foot: footOf(o, g.position.x, g.position.z), skip: gid };
    } else if (live.current.tool === "place" && t.hit) {
      const def = defOfRef.current(live.current.selected);
      if (JOINABLE.has(def.id)) {
        const p = placementOf(def, t.hit, t), k = modelRef.current * sizeRef.current;
        cand = { id: def.id, foot: { x: p.cx, z: p.cz, w: def.w * k, d: def.d * k, rot: -p.yaw } };
      }
    }
    const near = cand ? nearestOfKind(cand.id, cand.foot, cand.skip) : null;
    const fb0 = near ? nearFeedback(near.gap) : nearFeedback(Infinity);
    // Joined they must fit whole in a zone of their own kind on the map: else no green, no pulse, and the line says why.
    const fit: JoinFit = near && cand && fb0.stage !== "far" ? fitOf(cand.id, joinFeet(cand.foot, footOf(near.o))) : "fits";
    const fb = fit === "fits" || fb0.stage !== "join" ? fb0 : { ...fb0, stage: "near" as const };
    // The outline round the other one.
    let ring = nearRing.current;
    if (fb.stage === "far" || !near) { if (ring) ring.visible = false; }
    else {
      if (!ring) {
        ring = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#facc15", transparent: true, depthTest: false }));
        ring.renderOrder = 999; ring.frustumCulled = false;
        t.scene.add(ring); nearRing.current = ring;
      }
      if (s.target !== near.o.uid || !ring.visible) {
        const y = (t.objects.get(near.o.uid)?.position.y ?? t.floorY ?? 0) + 0.04;
        const f = footOf(near.o), grow = 0.08;
        ring.geometry.dispose();
        ring.geometry = new THREE.BufferGeometry().setFromPoints(footCorners({ ...f, w: f.w + grow, d: f.d + grow }).map((p) => new THREE.Vector3(p.x, y, p.z)));
      }
      const m = ring.material as THREE.LineBasicMaterial;
      m.color.set(fb.stage === "join" ? "#22c55e" : "#facc15");
      m.opacity = 0.45 + 0.55 * fb.t;
      ring.visible = true;
    }
    // The phone: ticks coming faster and stronger, a double pulse on reaching the joining gap.
    if (fb.stage === "join" && s.stage !== "join") hapticTick([30, 40, 30]);
    else if (fb.stage === "near" && now - s.last > fb.every) { hapticTick([fb.pulse]); s.last = now; }
    // The line on top.
    if (near && fb.stage !== "far") {
      const pg = near.o.id === "pergolato";
      const what = pg ? "alla vela" : "all’aiuola";
      const text = fit !== "fits"
        ? `Non si uniscono: ${fitWhy(fit, pg)}`
        : fb.stage === "join"
        ? `Si uniscono: ${gid ? "lascialo" : "posalo"} qui e ${pg ? "le due vele diventano una sola" : "le due aiuole diventano una sola"}`
        : `Vicino ${what}: ${metresText(Math.round(near.gap * 10) / 10)} · avvicina ancora per unirli`;
      if (text !== s.said && now - s.saidAt > 180) { s.said = text; s.saidAt = now; setNotice({ text, tone: "ok" }); }
    } else if (s.said) { const was = s.said; s.said = ""; setNotice((n) => (n?.text === was ? null : n)); }
    s.stage = fb.stage; s.target = near && fb.stage !== "far" ? near.o.uid : "";
  }

  /** A placed object drawn again (preview rebuilt, or carried from ARCore): its mesh, round shadow and grown tree. */
  function addPlacedMesh(t: NonNullable<typeof three.current>, o: PlacedObject, y: number) {
    const def = o.def ?? defOfRef.current(o.id);
    const g = meshFor(o, y);
    const shadow = !o.from && def.id !== "pergolato" && def.id !== "aiuola" && def.id !== "nebulizzatore" && def.id !== "innaffiatoio" ? contactShadow(def) : null;
    if (shadow) g.add(shadow);
    if (!o.from && wantsRealTree(def)) void realTree(def).then((tree) => {
      if (!tree || three.current?.objects.get(o.uid) !== g) return;
      for (const c of [...g.children]) if (c !== shadow) g.remove(c);
      castShadows(tree);
      g.add(tree);
    });
    t.scene.add(g);
    t.objects.set(o.uid, g);
  }
  /** The objects put with ARCore, set relative to where the phone is and looks (the preview's camera stands at the
   *  origin looking along −z), so the preview opened by the flash shows them where they were. */
  function carryOver(): PlacedObject[] {
    const t = three.current;
    if (!t) return placedRef.current;
    const eye = eyeOf(t), a = camYaw(t), c = Math.cos(-a), sn = Math.sin(-a);
    const conv = (o: PlacedObject): PlacedObject => {
      const dx = o.x - eye.x, dz = o.z - eye.z;
      return { ...o, x: dx * c + dz * sn, z: -dx * sn + dz * c, yaw: o.yaw + a, ...(o.from ? { from: o.from.map(conv) } : {}) };
    };
    return placedRef.current.map(conv);
  }
  /** A mesh for a placed object, as put down. */
  function meshFor(o: PlacedObject, y: number): THREE.Group {
    const g = objectMesh(o.def ?? defOfRef.current(o.id));
    g.rotation.y = -o.yaw;
    g.position.set(o.x, y, o.z);
    g.scale.setScalar(modelRef.current * (o.scale ?? 1));
    castShadows(g);
    return g;
  }
  /**
   * Joins a pergola or an aiuola just put down (or moved) with the nearest of its kind when within JOIN_GAP: one object
   * covering both (joinFeet, turned like the larger), the two kept inside it so «Annulla» brings them back.
   */
  function tryJoin(a: PlacedObject, y: number): boolean {
    const t = three.current;
    if (!t || !JOINABLE.has(a.id)) return false;
    const near = nearestOfKind(a.id, footOf(a), a.uid);
    if (!near || near.gap > JOIN_GAP) return false;
    const b = near.o, U = joinFeet(footOf(a), footOf(b)), k = modelRef.current;
    const fit = fitOf(a.id, U);
    if (fit !== "fits") {
      const text = `Non uniti: ${fitWhy(fit, a.id === "pergolato")}`;
      setNotice({ text, tone: "warn" });
      window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3500);
      return false;
    }
    const base = defOfRef.current(a.id);
    const def: ArObjectDef = { ...base, w: U.w / k, d: U.d / k };
    const uid = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const joined: PlacedObject = { uid, id: a.id, x: U.x, z: U.z, yaw: -U.rot, def, from: [b, a] };
    for (const id of [a.uid, b.uid]) { const m = t.objects.get(id); if (m) t.scene.remove(m); t.objects.delete(id); }
    const g = meshFor(joined, y);
    t.scene.add(g);
    t.objects.set(uid, g);
    setPlaced((l) => [...l.filter((p) => p.uid !== a.uid && p.uid !== b.uid), joined]);
    hapticTick([40, 60, 40]);
    const pg = a.id === "pergolato";
    setNotice({ text: `${pg ? "Vele unite" : "Aiuole unite"}: ${metresText(def.w)} × ${metresText(def.d)} · Annulla li separa`, tone: "ok" });
    window.setTimeout(() => setNotice((n) => (n?.text.includes("Annulla li separa") ? null : n)), 2600);
    return true;
  }

  /** A point of the screen in the preview canvas, 0–1 each way. When the AI camera turns its view by CSS (the page
   *  locked upright, the phone held sideways) the AR view is turned the same way, so the point is turned back. */
  function toCanvas(cx: number, cy: number): { nx: number; ny: number } | null {
    const el = three.current?.renderer.domElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const rot = rotRef.current;
    if (!rot) return r.width && r.height ? { nx: (cx - r.left) / r.width, ny: (cy - r.top) / r.height } : null;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return null;
    const a = (rot * Math.PI) / 180, dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    return { nx: (dx * Math.cos(a) + dy * Math.sin(a)) / w + 0.5, ny: (-dx * Math.sin(a) + dy * Math.cos(a)) / h + 0.5 };
  }
  /** The ray from the phone's eye through a point of the screen. */
  function screenRay(cx: number, cy: number): THREE.Raycaster | null {
    const t = three.current;
    if (!t) return null;
    const xr = t.renderer.xr;
    const cam = (xr.isPresenting ? (xr.getCamera().cameras[0] ?? xr.getCamera()) : t.camera) as THREE.PerspectiveCamera;
    const n = xr.isPresenting ? { nx: cx / window.innerWidth, ny: cy / window.innerHeight } : toCanvas(cx, cy);
    if (!n || !Number.isFinite(n.nx) || !Number.isFinite(n.ny)) return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(n.nx * 2 - 1, -(n.ny * 2 - 1)), cam);
    return ray;
  }
  /** The spot on the floor under a point of the screen (the floor ARCore found, else the preview's guessed one). */
  function screenToFloor(cx: number, cy: number): V | null {
    const t = three.current;
    if (!t || t.floorY === null) return null;
    const ray = screenRay(cx, cy);
    if (!ray) return null;
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -t.floorY), p) || p.distanceTo(ray.ray.origin) > 60) return null;
    return { x: p.x, y: t.floorY, z: p.z };
  }

  /** The phone's heading in the AR frame (radians round the vertical), to turn an object as the phone turns. */
  function camYaw(t: NonNullable<typeof three.current>): number {
    const cam = t.renderer.xr.isPresenting ? t.renderer.xr.getCamera() : t.camera;
    return new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromRotationMatrix(cam.matrixWorld), "YXZ").y;
  }

  /** Where the phone's eye is, in the AR frame. */
  function eyeOf(t: NonNullable<typeof three.current>): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition((t.renderer.xr.isPresenting ? t.renderer.xr.getCamera() : t.camera).matrixWorld);
  }

  /** The reticle as wide as what a tap would put: the chosen object's footprint at the size it would have (model and
   *  pinch), a small ring for the other tools; rebuilt only when that size changes. */
  const reticleR = useRef(0.14);
  const obstacleTick = useRef(0);
  function fitReticle(reticle: THREE.Object3D) {
    const { tool: tl, selected: sel } = live.current;
    // In scale at every size: the chosen object's footprint at real size (or the model's, or the size given with two
    // fingers); in «Sposta» the footprint of the object in hand; a small ring only for measuring and aligning.
    const held = tl === "move" && grabRef.current ? placedRef.current.find((p) => p.uid === grabRef.current) : undefined;
    const footR = (d: ArObjectDef, k: number) => Math.max(0.05, Math.min(30, (Math.max(d.w, d.d) / 2) * modelRef.current * k));
    const r = held ? footR(held.def ?? defOfRef.current(held.id), held.scale ?? 1)
      : tl === "place" ? footR(defOfRef.current(sel), sizeRef.current) : 0.1;
    if (Math.abs(r - reticleR.current) / reticleR.current > 0.06) {
      reticleR.current = r;
      const m = reticle as THREE.Mesh;
      m.geometry.dispose();
      const line = Math.max(0.012, Math.min(0.25, r * 0.06));
      m.geometry = new THREE.RingGeometry(Math.max(0.005, r - line), r, 64).rotateX(-Math.PI / 2);
    }
  }

  /**
   * Does something real stand in the object's way? Points of its volume (round its footprint and in the middle, at a
   * third and two thirds of its height, up to 2 m) are seen from the phone: where ARCore's depth map finds a real
   * surface clearly nearer than such a point, something (a wall, a chair, a person) is in the way. False without depth.
   */
  function obstacleAt(def: ArObjectDef, cx: number, y: number, cz: number, yaw: number, k: number): boolean {
    const occ = depthRef.current, t = three.current;
    if (!occ?.live || !t || !t.renderer.xr.isPresenting) return false;
    const xr = t.renderer.xr.getCamera();
    const cam = xr.cameras[0] ?? xr;
    const hw = (def.w / 2) * k, hd = (def.d / 2) * k, H = Math.min(def.h * k, 2);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    let seen = 0, hits = 0;
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const [a, b] of OBSTACLE_SAMPLES) for (const hy of [0.33, 0.66]) {
      const lx = a * hw * 0.9, lz = b * hd * 0.9;
      p.set(cx + lx * c + lz * sn, y + Math.max(0.1, H * hy), cz - lx * sn + lz * c);
      const vz = -q.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
      if (vz < 0.25) continue;
      q.copy(p).project(cam);
      const u = (q.x + 1) / 2, v = (q.y + 1) / 2;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const d = occ.depthAt(u, v);
      if (d === null) continue;
      seen++;
      if (d < vz - (0.25 + 0.08 * vz)) hits++;
    }
    return seen >= 4 && hits / seen > 0.3;
  }

  /** The reach of a placed object on the floor: half its widest side at the size it is drawn, plus 30 cm. */
  const reachOf = (o: PlacedObject) => {
    const def = o.def ?? defOfRef.current(o.id);
    return Math.max(0.6, (Math.max(def.w, def.d) / 2) * modelRef.current * (o.scale ?? 1) + 0.3);
  };
  const grabOff = useRef({ x: 0, z: 0 });
  const grabTurn = useRef<{ rot0: number; cam0: number; lastDeg: number } | null>(null);
  /** «Sposta»: the first tap picks the object nearest to it, the second puts it down where tapped (with ARCore it
   *  follows the reticle meanwhile). The new spot is what «Riporta» brings back to the map. */
  function moveAt(hit: V) {
    const t = three.current;
    if (!t) return;
    const cur = grabRef.current;
    if (!cur) {
      const list = live.current.placed.map((o) => ({ o, x: o.x, z: o.z, reach: reachOf(o) }));
      const near = nearestPlaced(list, hit);
      if (!near) { setNotice({ text: "Tocca vicino a un oggetto per prenderlo", tone: "warn" }); hapticTick([60]); return; }
      const g = t.objects.get(near.o.uid);
      // With ARCore it keeps the offset from where it was picked, so it does not jump under the reticle.
      grabOff.current = session && g ? { x: g.position.x - hit.x, z: g.position.z - hit.z } : { x: 0, z: 0 };
      grabTurn.current = g ? { rot0: g.rotation.y, cam0: camYaw(t), lastDeg: 0 } : null;
      setGrabbed(near.o.uid);
      hapticTick([20]);
      return;
    }
    const o = live.current.placed.find((p) => p.uid === cur);
    const g = t.objects.get(cur);
    const x = hit.x + grabOff.current.x, z = hit.z + grabOff.current.z;
    if (g) g.position.set(x, hit.y, z);
    const yaw = g ? -g.rotation.y : o?.yaw ?? 0;
    grabTurn.current = null;
    setPlaced((l) => l.map((p) => (p.uid === cur ? { ...p, x, z, yaw } : p)));
    setGrabbed(null);
    if (o && tryJoin({ ...o, x, z, yaw }, hit.y)) return;
    hapticTick([30, 40, 30]);
    const def = o ? (o.def ?? defOfRef.current(o.id)) : null;
    const blocked = def && o ? obstacleAt(def, x, hit.y, z, o.yaw, modelRef.current * (o.scale ?? 1)) : false;
    setNotice(blocked ? { text: "Spostato, ma lì c’è un ostacolo davanti", tone: "warn" } : { text: "Spostato · tocca un altro oggetto per spostarlo", tone: "ok" });
    window.setTimeout(() => setNotice((n) => (n?.text.startsWith("Spostato") ? null : n)), 2200);
  }

  // A ring under the object picked up.
  useEffect(() => {
    const t = three.current;
    const held = grabbed ?? touchHeld;
    const g = held ? t?.objects.get(held) : undefined;
    const o = held ? placed.find((p) => p.uid === held) : undefined;
    if (!t || !g || !o) return;
    const r = reachOf(o);
    const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.05, r - 0.3), Math.max(0.08, r - 0.24), 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: "#a78bfa", transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
    ring.renderOrder = 999;
    ring.frustumCulled = false;
    ring.onBeforeRender = () => { ring.position.set(g.position.x, g.position.y + 0.02, g.position.z); ring.updateMatrixWorld(); };
    t.scene.add(ring);
    return () => { t.scene.remove(ring); ring.geometry.dispose(); (ring.material as THREE.Material).dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbed, touchHeld]);
  // Leaving «Sposta» with an object in hand puts it back where it was.
  useEffect(() => {
    if (tool === "move" || !grabRef.current) return;
    const o = placed.find((p) => p.uid === grabRef.current), g = o ? three.current?.objects.get(o.uid) : undefined;
    if (o && g) { g.position.x = o.x; g.position.z = o.z; g.rotation.y = -o.yaw; }
    grabTurn.current = null;
    setGrabbed(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  /** The «Modellino»'s scale for the space round the phone, with ARCore's depth when the phone gives it. */
  function fitModel(): { k: number; span: number | null } {
    const t = three.current;
    const defs = [...live.current.placed.map((o) => o.def ?? defOfRef.current(o.id)), defOfRef.current(live.current.selected)];
    const size = Math.max(...defs.map((d) => Math.max(d.w, d.d))), tall = Math.max(...defs.map((d) => d.h));
    let dist = 2, eyeH = 1.5;
    if (t) {
      const eye = eyeOf(t);
      if (t.hit) dist = Math.hypot(t.hit.x - eye.x, t.hit.z - eye.z);
      if (t.floorY !== null) eyeH = eye.y - t.floorY;
    }
    const span = depthRef.current?.span() ?? null;
    return { k: modelScaleFor({ size, tall, dist, eyeH, span }), span };
  }

  // Two corners touched: the drawn area lines up with the real floor.
  useEffect(() => {
    if (alignPts.length !== 2 || !area || area.ring.length < 2) return;
    const A = toEN(area.ring[0]![0], area.ring[0]![1], origin), B = toEN(area.ring[1]![0], area.ring[1]![1], origin);
    setAlignment({ a: alignTwoPoints(A, B, alignPts[0]!, alignPts[1]!), how: "corners" });
    setTool("place");
  }, [alignPts, area, origin]);

  // The area and its zones drawn on the floor once aligned.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.overlay.clear();
    if (!alignment || !area) return;
    const y = t.floorY ?? 0;
    const loop = (ring: Array<[number, number]>, color: string) => {
      const l = floorLoop(ring.map(([a, b]) => enToAr(toEN(a, b, origin), alignment.a)), color);
      l.position.y = y;
      t.overlay.add(l);
    };
    loop(area.ring, "#ffffff");
    for (const z of area.zones ?? []) if (z.ring.length >= 3) loop(z.ring, "#4ade80");
    // The project's interventions from the map, each on its own spot (views/ar-plan).
    if (!showPlan) return;
    const { group, count } = buildPlan(kind, getLab(), area, origin, alignment.a, merge, joinBeds);
    group.position.y = y;
    castShadows(group);
    t.overlay.add(group);
    // The map's trees grow as the species recognised with the AI camera in this flow (else the realistic oak).
    void growPlan(group, () => group.parent === t.overlay, castShadows, plantsRef.current);
    const kinds = count.trees ? planTreeDefs(plantsRef.current).filter((d) => d.plant).map((d) => d.label) : [];
    const said = planText(count) + (kinds.length ? ` (${kinds.join(", ")})` : "");
    if (said && planSaid.current !== `${alignment.how}:${said}`) {
      planSaid.current = `${alignment.how}:${said}`;
      setNotice({ text: `Dal progetto: ${said}${alignment.how === "gps" ? " · posizione dal GPS, tocca i 2 angoli per allinearli bene" : ""}`, tone: "ok" });
    }
  }, [alignment, area, origin, showPlan, kind, planKey, merge, joinBeds, plantKey]);

  // The measuring tape between the two points.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    t.measure.clear();
    if (measure.length === 2) {
      const geo = new THREE.BufferGeometry().setFromPoints(measure.map((p) => new THREE.Vector3(p.x, p.y + 0.01, p.z)));
      t.measure.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#facc15" })));
    }
  }, [measure]);

  const undo = () => {
    const last = placed[placed.length - 1];
    if (!last) return;
    const t = three.current, o = t?.objects.get(last.uid);
    if (t && o) { t.scene.remove(o); t.objects.delete(last.uid); }
    if (grabRef.current === last.uid) setGrabbed(null);
    // A joined pergola or aiuola: «Annulla» puts back the two it was made of.
    if (last.from && t) {
      const y = o?.position.y ?? t.floorY ?? 0;
      for (const p of last.from) { const g = meshFor(p, y); t.scene.add(g); t.objects.set(p.uid, g); }
      setPlaced((l) => [...l.slice(0, -1), ...last.from!]);
      setNotice({ text: last.id === "pergolato" ? "Vele di nuovo separate" : "Aiuole di nuovo separate", tone: "ok" });
      window.setTimeout(() => setNotice((n) => (n?.text.includes("di nuovo separat") ? null : n)), 1800);
      return;
    }
    setPlaced((l) => l.slice(0, -1));
  };
  const backToMap = () => {
    if (!placed.length) return;
    if (model) { setNotice({ text: "Nel modellino le posizioni non sono quelle vere: spegnilo per riportare sulla mappa", tone: "warn" }); return; }
    if (!area) { setNotice({ text: "Disegna prima l’area nella scheda Mappa", tone: "warn" }); return; }
    if (!alignment || (alignment.how === "gps" && !sendAfterAlign.current)) {
      // One button: «Riporta» first asks the two corners, then sends by itself.
      sendAfterAlign.current = true;
      setTool("align"); setAlignPts([]);
      return;
    }
    sendAfterAlign.current = false;
    const { kept: zones, out } = zonesInside(objectsToZones(kind, placed, alignment.a, origin), area.ring);
    if (!zones.length) { setNotice({ text: "Sono tutti fuori dall’area disegnata", tone: "warn" }); return; }
    const next: DrawnArea = { ...area, zones: [...(area.zones ?? []), ...zones] };
    // Sprinklers put in AR also count on their lever (their zone is green ground; the heads are the lever's).
    const heads = placed.filter((o) => o.id === "innaffiatoio").length;
    if (kind === "urban") setUrban({ area: next, ...(heads ? { sprinklers: Math.min(20, (getLab().urban.sprinklers ?? 0) + heads) } : {}) }); else setVineyard({ area: next });
    hapticTick([20, 40, 20]);
    setNotice({ text: `${zones.length} sulla mappa${out ? ` · ${out} fuori dall’area` : ""}`, tone: "ok" });
    window.setTimeout(end, 2200);
  };
  const sendAfterAlign = useRef(false);
  // Once the two corners are touched after «Riporta», send at once.
  useEffect(() => {
    if (alignment?.how === "corners" && sendAfterAlign.current) backToMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignment]);
  useEffect(() => { if (!notice || notice.tone === "ok" || notice.text === why) return; const t = window.setTimeout(() => setNotice(null), 5000); return () => window.clearTimeout(t); }, [notice, why]);

  const dist = measure.length === 2 ? arDistance(measure[0]!, measure[1]!) : null;
  const status = notice?.text ?? (!found
    ? "Inquadra il pavimento…"
    : adjusting
      ? "Trascina la linea sulla base dei muri"
      : tool === "align"
        ? alignPts.length === 0 ? "Tocca il punto 1 dell’area" : "Tocca il punto 2 dell’area"
        : tool === "move"
          ? grabbed ? "Punta dove metterlo e tocca: vicino a una vela o a un’aiuola si uniscono" : "Tocca l’oggetto da spostare"
        : tool === "measure"
          ? dist !== null ? `Distanza ${metresText(dist)}` : measure.length === 1 ? "Tocca il secondo punto" : "Tocca il primo punto"
          : session && surface === "raised" ? `Tocca per posare sul piano: ${defOf(selected).label}`
          : session && surface === "floor-under" ? `Il mirino è sul pavimento sotto il punto inquadrato · tocca per posare: ${defOf(selected).label}`
          : `Tocca il pavimento per posare: ${defOf(selected).label}`);
  // The bar on top stays a small pill (what a tap does, in two words); a tap opens it to the whole sentence and a
  // line on how it works. Messages open it by themselves while they last.
  const [barOpen, setBarOpen] = useState(false);
  barOpenRef.current = barOpen;
  const barShort = !found ? "Cerco il pavimento…" : adjusting ? "Regola pavimento"
    : tool === "move" ? (grabbed ? "Mettilo giù" : "Sposta") : tool === "measure" ? (dist !== null ? metresText(dist) : "Misura") : tool === "align" ? `Punto ${alignPts.length + 1} dell’area` : defOf(selected).label;
  const barHelp = !found ? "Inquadra il pavimento a un paio di metri e muovi piano il telefono di lato finché lo riconosco: aiutano una buona luce e un pavimento con disegni o venature; quello lucido o tutto di un colore si trova a fatica."
    : tool === "move" ? "Tocca un oggetto posato per prenderlo: segue il mirino e gira con il telefono, tocca di nuovo per posarlo. Avvicinato a un’altra vela o a un’altra aiuola, il telefono vibra sempre più forte e il contorno diventa verde: posato lì, i due diventano uno solo (Annulla li separa)."
    : tool === "measure" ? "Tocca due punti a terra: ti dico quanto distano."
    : tool === "align" ? "Tocca a terra i punti 1 e 2 dell’area disegnata sulla mappa: così gli oggetti tornano al posto giusto."
    : "Tocca il pavimento dove vuoi metterlo: compare a grandezza vera. Il pavimento è il piano più basso che riconosco: un tavolo o un muro non lo ingannano (il mirino scende a terra, più tenue), solo il Modellino si posa anche su un tavolo. Un oggetto già posato si trascina con un dito; con due dita lo ruoti e lo ingrandisci. Annulla toglie l’ultimo, il pulsante AI cambia oggetto.";
  const barExpanded = barOpen || !!notice || adjusting;
  const statusTone = notice ? (notice.tone === "ok" ? "bg-[#22c55e] text-black" : "bg-[#facc15] text-black") : "bg-black/55 text-white backdrop-blur";

  const dragHorizon = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = canvasHost.current;
    if (!host || (e.type === "pointermove" && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const r = host.getBoundingClientRect();
    const ny = Math.max(0.05, Math.min(0.9, (e.clientY - r.top) / r.height));
    const fl = floorRef.current;
    fl.offset = pitchForHorizon(ny, fovAt(zoomRef.current)) - fl.tilt;
  };
  const finishAdjust = () => {
    setAdjusting(false);
    saveFloorOffset(floorRef.current.offset);
    setNotice({ text: "Pavimento regolato", tone: "ok" });
    window.setTimeout(() => setNotice((n) => (n?.text.startsWith("Pavimento") ? null : n)), 1800);
  };

  // «Scatta»: the camera's picture with the objects put on it, as one photo of the project. With ARCore the browser
  // does not hand the camera's image to the page, so the phone's own screenshot is the way.
  const [flash, setFlash] = useState(0);
  const [shots, setShots] = useState(0);
  const shoot = (multi = false) => {
    const t = three.current, host = canvasHost.current;
    if (session) {
      // With ARCore the photo is taken in the next frame, from the camera's image and the objects drawn over it.
      wantShot.current = multi ? "multi" : "single";
      setFlash((n) => n + 1);
      hapticTick([25]);
      return;
    }
    if (!t || !host) return;
    const W = host.clientWidth, H = host.clientHeight, k = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement("canvas");
    c.width = Math.round(W * k); c.height = Math.round(H * k);
    const g = c.getContext("2d");
    if (!g) return;
    const v = videoRef.current;
    if (v && v.videoWidth) {
      // The video as the screen shows it (object-fit: cover).
      const s = Math.max(c.width / v.videoWidth, c.height / v.videoHeight) * zoomRef.current;
      const dw = v.videoWidth * s, dh = v.videoHeight * s;
      g.drawImage(v, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    }
    t.reticle.visible = false;
    t.renderer.render(t.scene, t.camera);
    g.drawImage(t.renderer.domElement, 0, 0, c.width, c.height);
    setFlash((n) => n + 1);
    hapticTick([25]);
    c.toBlob((b) => { if (b) savedShotRef.current(new File([b], `foto-ar-prova${multi ? "-multiplo" : ""}-${Date.now()}.jpg`, { type: "image/jpeg" }), multi); }, "image/jpeg", 0.9);
  };
  // Holding the shutter shoots a multiple shot (a photo every 200 ms) until the finger lifts, like the AI camera's.
  const holdBurst = useHoldBurst(() => shoot(true));
  const heldShot = useRef(false);
  const holdShotTimer = useRef<number | undefined>(undefined);
  const releaseShot = () => { window.clearTimeout(holdShotTimer.current); if (heldShot.current) holdBurst.onHold(false); };
  useEffect(() => () => window.clearTimeout(holdShotTimer.current), []);
  // The multiple shot goes to the AI camera's own series (tagged "AR"): the same thumbnail and review sheet here and in
  // Rileva, kept when the AR view closes and handed over with the camera's.
  const burstRef = useRef(burst);
  burstRef.current = burst;
  const savedShotRef = useRef<(f: File, multi?: boolean) => void>(() => undefined);
  savedShotRef.current = (f: File, multi = false) => {
    if (multi) {
      const id = Date.now() + Math.random();
      void burstThumbOf(f).then((thumb) => burstRef.current.push({ id, file: f, thumb, src: "ar" })).catch(() => undefined);
      return;
    }
    onShot?.(f);
    setShots((n) => n + 1);
    setNotice({ text: "Foto salvata nel progetto", tone: "ok" });
    window.setTimeout(() => setNotice((n) => (n?.text.startsWith("Foto salvata") ? null : n)), 1600);
  };
  // «Modellino» on or off: every object put down takes the new size.
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    for (const o of placed) t.objects.get(o.uid)?.scale.setScalar(modelK * (o.scale ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelK]);
  // Touch on the objects themselves (as well as the reticle's «Sposta»): one finger on an object drags it along the
  // floor, two fingers on it turn it (twist) and resize it (pinch, 0,1×…3× its real size); two fingers elsewhere act on
  // the last object put down. Adaptive feedback all along (touchMoveFeedback, the join outline of proximity).
  // The size of the last pinch (1 = real size): every object put afterwards takes it.
  const sizeRef = useRef(1);
  const placedRef = useRef(placed);
  placedRef.current = placed;
  useEffect(() => {
    type Drag = { uid: string; x0: number; y0: number; off: { x: number; z: number }; moved: boolean; from: { x: number; z: number }; y: number; lastTick: { x: number; z: number }; blocked: boolean; saidAt: number };
    type Twist = { uid: string; d0: number; a0: number; base: number; cur: number; rot0: number; lastDeg: number; saidAt: number };
    let drag: Drag | null = null, twist: Twist | null = null;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0]!.clientX - e.touches[1]!.clientX, e.touches[0]!.clientY - e.touches[1]!.clientY);
    const angle = (e: TouchEvent) => Math.atan2(e.touches[1]!.clientY - e.touches[0]!.clientY, e.touches[1]!.clientX - e.touches[0]!.clientX);
    // Not "[role=dialog]": the whole AI camera is a dialog, so every touch read as a control and nothing moved.
    const onControl = (e: TouchEvent) => !!(e.target as Element | null)?.closest?.("button, a, input, [role=slider], .ar-sheet, .ar-tutorial, [aria-label='Scatti del multiplo']");
    // The object under a finger: its 3D shape first (a tree is taken by its crown too), else the one whose footprint
    // is near the spot of floor under the finger.
    const objectAt = (x: number, y: number) => {
      const p = screenToFloor(x, y);
      const t = three.current;
      const ray = screenRay(x, y);
      if (t && ray && p) {
        let best: { uid: string; d: number } | null = null;
        for (const o of placedRef.current) {
          const g = t.objects.get(o.uid);
          if (!g) continue;
          const hit = ray.intersectObject(g, true)[0];
          if (hit && (!best || hit.distance < best.d)) best = { uid: o.uid, d: hit.distance };
        }
        const o = best ? placedRef.current.find((q) => q.uid === best!.uid) : undefined;
        if (o) return { o, p };
      }
      if (!p) return null;
      const list = placedRef.current.map((o) => ({ o, x: o.x, z: o.z, reach: reachOf(o) }));
      const near = nearestPlaced(list, p);
      return near ? { o: near.o, p } : null;
    };
    const say = (text: string, tone: "ok" | "warn" = "ok") => setNotice({ text, tone });
    const start = (e: TouchEvent) => {
      if (onControl(e) || adjustingRef.current) return;
      const tl = live.current.tool;
      if (tl === "measure" || tl === "align" || grabRef.current) return;
      const t = three.current;
      if (!t) return;
      if (e.touches.length === 1) {
        const hitO = objectAt(e.touches[0]!.clientX, e.touches[0]!.clientY);
        if (!hitO) { drag = null; return; }
        const g = t.objects.get(hitO.o.uid);
        if (!g) return;
        drag = { uid: hitO.o.uid, x0: e.touches[0]!.clientX, y0: e.touches[0]!.clientY, off: { x: g.position.x - hitO.p.x, z: g.position.z - hitO.p.z }, moved: false, from: { x: g.position.x, z: g.position.z }, y: g.position.y, lastTick: { x: g.position.x, z: g.position.z }, blocked: false, saidAt: 0 };
      } else if (e.touches.length === 2) {
        // Two fingers: the object under them (else the one being dragged, else the last put down).
        const mx = (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2, my = (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2;
        const under = objectAt(mx, my)?.o ?? (drag ? placedRef.current.find((p) => p.uid === drag!.uid) : undefined) ?? placedRef.current[placedRef.current.length - 1];
        if (drag?.moved) endDrag(false);
        drag = null;
        if (!under) return;
        const g = t.objects.get(under.uid);
        if (!g) return;
        twist = { uid: under.uid, d0: dist(e), a0: angle(e), base: under.scale ?? 1, cur: under.scale ?? 1, rot0: g.rotation.y, lastDeg: 0, saidAt: 0 };
        touchHeldRef.current = under.uid; setTouchHeld(under.uid);
        pinchUntil.current = performance.now() + 600;
        hapticTick([12]);
      }
    };
    const move = (e: TouchEvent) => {
      const t = three.current;
      if (!t) return;
      const now = performance.now();
      if (twist && e.touches.length === 2) {
        e.preventDefault();
        pinchUntil.current = now + 600;
        const g = t.objects.get(twist.uid);
        if (!g) return;
        twist.cur = Math.max(0.1, Math.min(3, twist.base * (dist(e) / twist.d0)));
        g.scale.setScalar(modelRef.current * twist.cur);
        // Turning the fingers clockwise on screen turns the object clockwise seen from above.
        const turnDeg = ((angle(e) - twist.a0) * 180) / Math.PI;
        g.rotation.y = twist.rot0 - (turnDeg * Math.PI) / 180;
        const det = turnDetents(twist.lastDeg, turnDeg);
        if (det.quarter) hapticTick([25, 30, 25]); else if (det.steps) hapticTick([8]);
        twist.lastDeg = turnDeg;
        if (now - twist.saidAt > 120) {
          twist.saidAt = now;
          const o = placedRef.current.find((p) => p.uid === twist!.uid);
          const def = o ? (o.def ?? defOfRef.current(o.id)) : null;
          const deg = Math.round(turnDeg);
          if (def) say(`${def.label} · ${metresText(def.h * twist.cur)} di altezza${twist.cur !== 1 ? ` (vero: ${metresText(def.h)})` : ""}${Math.abs(deg) >= 3 ? ` · ruotato di ${Math.abs(deg)}°` : ""}`);
        }
        return;
      }
      if (!drag || e.touches.length !== 1) return;
      const tx = e.touches[0]!.clientX, ty = e.touches[0]!.clientY;
      if (!drag.moved) {
        if (Math.hypot(tx - drag.x0, ty - drag.y0) < 8) return;
        drag.moved = true;
        touchHeldRef.current = drag.uid; setTouchHeld(drag.uid);
        hapticTick([15]);
      }
      e.preventDefault();
      pinchUntil.current = now + 600;
      const p = screenToFloor(tx, ty), g = t.objects.get(drag.uid);
      if (!p || !g) return;
      const x = p.x + drag.off.x, z = p.z + drag.off.z;
      g.position.set(x, drag.y, z);
      const o = placedRef.current.find((q) => q.uid === drag!.uid);
      const def = o ? (o.def ?? defOfRef.current(o.id)) : null;
      if (!o || !def) return;
      // A tick every half metre, longer for a heavier object.
      if (Math.hypot(x - drag.lastTick.x, z - drag.lastTick.z) >= 0.5) { drag.lastTick = { x, z }; hapticTick([dragTick(def)]); }
      // Something real in the way (ARCore's depth): a firm buzz when it starts, said in the line on top.
      if (now - drag.saidAt > 160) {
        drag.saidAt = now;
        const blocked = obstacleAt(def, x, drag.y, z, o.yaw, modelRef.current * (o.scale ?? 1));
        if (blocked && !drag.blocked) hapticTick([70]);
        drag.blocked = blocked;
        // The join feedback (proximity) speaks for itself when a pergola or an aiuola is near one of its kind.
        if (!nearState.current.said || nearState.current.stage === "far") {
          const moved = Math.hypot(x - drag.from.x, z - drag.from.z);
          say(blocked ? `${def.label}: qui c’è un ostacolo davanti` : `Sposto ${def.label.toLowerCase()} · ${metresText(Math.round(moved * 10) / 10)}`, blocked ? "warn" : "ok");
        }
      }
    };
    function endDrag(final = true) {
      const d = drag, t = three.current;
      drag = null;
      touchHeldRef.current = null; setTouchHeld(null);
      if (!d?.moved || !t) return;
      pinchUntil.current = performance.now() + 450;
      const g = t.objects.get(d.uid), o = placedRef.current.find((q) => q.uid === d.uid);
      if (!g || !o) return;
      const x = g.position.x, z = g.position.z;
      setPlaced((l) => l.map((q) => (q.uid === d.uid ? { ...q, x, z } : q)));
      if (final && tryJoin({ ...o, x, z }, d.y)) return;
      hapticTick([20, 30, 20]);
      window.setTimeout(() => setNotice((n) => (n?.text.startsWith("Sposto") || n?.text.includes("ostacolo") ? null : n)), 1600);
    }
    const end = (e: TouchEvent) => {
      if (twist && e.touches.length < 2) {
        const tw = twist, g = three.current?.objects.get(tw.uid);
        twist = null;
        touchHeldRef.current = null; setTouchHeld(null);
        const k = Math.round(tw.cur * 100) / 100;
        pinchUntil.current = performance.now() + 400;
        setPlaced((l) => l.map((p) => (p.uid === tw.uid ? { ...p, scale: k, ...(g ? { yaw: -g.rotation.y } : {}) } : p)));
        sizeRef.current = k;
        hapticTick([20]);
        window.setTimeout(() => setNotice((n) => (n?.text.includes("di altezza") ? null : n)), 1800);
        return;
      }
      if (drag && e.touches.length === 0) endDrag(true);
    };
    // Captured on the way down: the camera's own gesture layer stops touchstart before it reaches the window, so
    // listened to while bubbling the gesture never began and objects could no longer be resized nor turned.
    const cap = { capture: true } as const;
    window.addEventListener("touchstart", start, { passive: true, capture: true });
    window.addEventListener("touchmove", move, { passive: false, capture: true });
    window.addEventListener("touchend", end, cap);
    window.addEventListener("touchcancel", end, cap);
    return () => {
      window.removeEventListener("touchstart", start, cap);
      window.removeEventListener("touchmove", move, cap);
      window.removeEventListener("touchend", end, cap);
      window.removeEventListener("touchcancel", end, cap);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Without the camera's image (a phone giving ARCore no "camera-access") there is no shutter, only its room.
  const shutter = (outer: string, inner: string) => !camShotOk ? <span className={`${outer} shrink-0`} aria-hidden="true" /> : (
    <button type="button" aria-label={shots ? `Scatta una foto · tieni premuto per il multiplo · ${shots} fatte` : "Scatta una foto · tieni premuto per il multiplo"} data-no-ui-click
      onClick={() => { if (heldShot.current) { heldShot.current = false; return; } shoot(); }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        heldShot.current = false;
        window.clearTimeout(holdShotTimer.current);
        holdShotTimer.current = window.setTimeout(() => { heldShot.current = true; holdBurst.onHold(true); }, HOLD_MS);
      }}
      onPointerUp={releaseShot} onPointerCancel={releaseShot} onPointerLeave={releaseShot}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative grid ${outer} shrink-0 place-items-center rounded-full border-[3px] border-white bg-white/25 backdrop-blur active:scale-95`}>
      <span className={`${inner} rounded-full bg-white`} aria-hidden="true" />
      {shots > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[#00e5ff] px-1 text-[11px] font-bold text-black">{shots}</span>}
    </button>
  );
  // The zoom ruler is the preview's only: with ARCore the browser drives the camera.
  // No zoom with the flash on (the preview opened by ARCore's flash, or the flash lit in the preview): it stands in for
  // the AR view, which has none.
  const dialOn = !session && !adjusting && !torch && !torchOn;
  // With the zoom gone the picture goes back to 1×, not left magnified.
  useEffect(() => { if ((torch || torchOn) && zoomRef.current !== 1) setZoom(1); }, [torch, torchOn]); // eslint-disable-line react-hooks/exhaustive-deps


  // Every choice sits behind one AI button: the tray opens over the camera only when asked.
  const [trayOpen, setTrayOpen] = useState(false);
  // Landscape: in Prova the zoom is always the pills in a column beside the shutter with their ruler (the arc dial is
  // Rileva's only). The arc code stays here, off: set ARC_IN_PROVA to bring it back at rest.
  const arcOn = ARC_IN_PROVA && dialOn && !trayOpen;
  const dialBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => dialBox.current?.style.setProperty("--ar-dial-k", String(Math.min(1, (window.innerHeight - 8) / 380)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [arcOn]);
  const plantChoices = choices.filter((c) => c.def.plant);
  const objectChoices = choices.filter((c) => !c.def.plant);
  // The AI button opens a fan of round icons around itself: the plants the AI recognised (green ring), the
  // interventions, then the tools. A tap picks and folds the fan.
  const pick = (key: string) => { setSelected(key); setTool("place"); setTrayOpen(false); };
  const plantItems: FanItem[] = plantChoices.map(({ key, def: o }) => ({ key, label: o.label, Icon: plantIcon(o.plant?.form), plant: true, on: tool === "place" && selected === key,
    hint: `${o.plant?.scientificName ?? "Riconosciuta dall’AI"} · alta circa ${metresText(Math.round(o.h))}`,
    aria: `${o.label}, riconosciuto: ${o.plant?.scientificName ?? ""}, alto circa ${Math.round(o.h)} m`, onPick: () => pick(key) }));
  const objectItems: FanItem[] = objectChoices.map(({ key, def: o }) => ({ key, label: o.label, Icon: OBJECT_ICONS[o.id] ?? Sparkles, on: tool === "place" && selected === key,
    hint: `${OBJECT_HINT[o.id] ?? ""}${OBJECT_HINT[o.id] ? " · " : ""}${metresText(o.w)} × ${metresText(o.d)}`, onPick: () => pick(key) }));
  const toolItems: FanItem[] = [
    { key: "t:misura", label: "Misura", hint: "La distanza tra due punti a terra", Icon: Ruler, tool: true, on: tool === "measure", onPick: () => { setTool("measure"); setMeasure([]); setTrayOpen(false); } },
    ...(area ? [{ key: "t:progetto", label: "Progetto", hint: showPlan ? "Gli interventi della mappa sono nel loro punto: tocca per nasconderli" : "Mostra gli interventi della mappa nel loro punto", Icon: MapPinned, tool: true, on: showPlan,
      aria: showPlan ? "Nascondi gli interventi della mappa" : "Mostra gli interventi della mappa nel loro punto",
      onPick: () => { setShowPlan((v) => !v); setTrayOpen(false); setNotice({ text: showPlan ? "Interventi della mappa nascosti" : "Interventi della mappa nel loro punto", tone: "ok" }); } }] : []),
    ...(placed.length ? [{ key: "t:sposta", label: "Sposta", hint: "Prendi un oggetto posato e rimettilo altrove; vicino a uno uguale si uniscono", Icon: Move, tool: true, on: tool === "move", aria: "Sposta un oggetto già posato",
      onPick: () => { setTool("move"); setGrabbed(null); setTrayOpen(false); } }] : []),
    { key: "t:modellino", label: "Modellino", hint: model ? `Attivo, 1:${Math.round(1 / modelScale)}: tocca per tornare alla grandezza vera` : "Tutto in piccolo, in una scala adatta allo spazio intorno", Icon: Box, tool: true, on: model, aria: model ? "Torna alla grandezza vera" : "Modellino in scala adatta allo spazio intorno",
      onPick: () => {
        setTrayOpen(false);
        if (model) { setModel(false); setNotice({ text: "Grandezza vera", tone: "ok" }); return; }
        const { k, span } = fitModel();
        setModelScale(k); setModel(true);
        setNotice({ text: `Modellino 1:${Math.round(1 / k)} · adatto allo spazio ${span !== null ? `(profondità rilevata: circa ${metresText(span)})` : "davanti a te"}`, tone: "ok" });
      } },
    // ARCore's depth as a test: switching it on or off restarts the session (it is asked when the session starts).
    ...(session && onRotate ? [{ key: "t:profondita", label: "Profondità", hint: depthWanted() ? "Attiva: muri e mobili veri coprono gli oggetti (tocca per spegnerla, riavvia l’AR)" : "Muri e mobili veri coprono gli oggetti (riavvia l’AR)", Icon: Layers, tool: true, on: depthWanted(),
      aria: depthWanted() ? "Spegni la prova della profondità e riavvia l’AR" : "Accendi la profondità: muri e mobili veri coprono gli oggetti (riavvia l’AR)",
      onPick: () => { const on = !depthWanted(); setDepthWanted(on); setTrayOpen(false); setNotice({ text: on ? "Riavvio l’AR con la profondità: muri e mobili coprono gli oggetti" : "Riavvio l’AR senza profondità", tone: "ok" }); onRotate(); } }] : []),
    ...(DEPTH_TOOLS && session && depthLive ? [{ key: "t:mappa", label: `Gira mappa ${flip + 1}/${FLIP_MODES}`, Icon: RotateCw, tool: true, on: false,
      aria: "Gira la mappa di profondità, se gli oggetti spariscono nei posti sbagliati",
      onPick: () => { const n = (flip + 1) % FLIP_MODES; setFlip(n); setDepthFlip(n); depthRef.current?.setFlip(n); setDepthOn(true); setTrayOpen(false); setNotice({ text: `Mappa di profondità ${n + 1} di ${FLIP_MODES}: guarda se i pali spariscono dietro persone e mobili`, tone: "ok" }); } },
      { key: "t:pausa", label: depthOn ? "Senza copertura" : "Con copertura", Icon: Layers, tool: true, on: !depthOn,
      aria: depthOn ? "Mostra gli oggetti anche dietro muri e mobili, per confrontare" : "Muri e mobili coprono di nuovo gli oggetti",
      onPick: () => { setDepthOn((v) => !v); setTrayOpen(false); } }] : []),
    ...(!session ? [{ key: "t:pavimento", label: "Pavimento", hint: "Allinea il pavimento a quello vero, senza ARCore", Icon: MoveVertical, tool: true, on: false, aria: "Regola pavimento", onPick: () => { setAdjusting(true); setTrayOpen(false); } }] : []),
  ];
  const fanGroups: FanGroup[] = [
    { key: "piante", label: "Piante AI", Icon: Leaf, items: plantItems },
    { key: "interventi", label: "Interventi", Icon: kind === "vineyard" ? Grape : TreeDeciduous, items: objectItems },
    { key: "strumenti", label: "Strumenti", Icon: Ruler, items: toolItems },
  ];

  const round = "grid size-11 shrink-0 place-items-center rounded-full bg-black/55 backdrop-blur";
  return (
    <>
    {!session && <div ref={canvasHost} className="fixed inset-0 z-40 bg-black">{stream && <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 size-full object-cover" style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined }} />}</div>}
    {!session && adjusting && (
      <div className="pointer-events-none fixed inset-0 z-[45]">
        <div ref={horizonLine} className="absolute inset-x-0 -translate-y-1/2" style={{ top: "30%" }}>
          <div role="slider" aria-label="Linea dell’orizzonte" aria-valuetext="Trascina sulla linea dove il pavimento incontra il fondo" tabIndex={0}
            onPointerDown={dragHorizon} onPointerMove={dragHorizon}
            onKeyDown={(e) => { const fl = floorRef.current; if (e.key === "ArrowUp") fl.offset += 0.5; else if (e.key === "ArrowDown") fl.offset -= 0.5; }}
            className="pointer-events-auto relative flex h-14 touch-none cursor-ns-resize items-center">
            <div className="h-0.5 w-full bg-[#00e5ff] shadow-[0_0_10px_#00e5ff]" />
            <span className="absolute left-1/2 grid size-11 -translate-x-1/2 place-items-center rounded-full bg-[#00e5ff] text-black shadow-lg"><MoveVertical className="size-5" aria-hidden="true" /></span>
            <span className="absolute left-3 top-0 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold">Orizzonte</span>
          </div>
        </div>
      </div>
    )}
    {turned && onRotate && (
      <div className="pointer-events-none fixed inset-0 z-[55] grid place-items-center p-6">
        <button type="button" onClick={() => { setTurned(false); onRotate(); }}
          className="pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-[28px] bg-black/70 px-6 py-5 text-center text-white shadow-2xl ring-1 ring-white/15 backdrop-blur">
          <RotateCw className="size-8 text-[#00e5ff]" aria-hidden="true" />
          <span className="text-base font-semibold">Tocca per ruotare la vista AR</span>
          <span className="text-xs opacity-75">La realtà aumentata resta nel verso in cui è partita: la riavvio girata. Gli oggetti posati si azzerano.</span>
        </button>
      </div>
    )}
    {flash > 0 && <div key={flash} className="pointer-events-none fixed inset-0 z-[60] animate-out fade-out-0 bg-white duration-300 fill-mode-forwards" aria-hidden="true" />}
    <div ref={hudRef} className="ar-live-hud pointer-events-none fixed inset-0 z-50 flex select-none flex-col justify-between text-white [-webkit-touch-callout:none]" style={{ padding: `${session ? "max(env(safe-area-inset-top), 1.5rem)" : "env(safe-area-inset-top)"} env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)`, ...hudTurnStyle }}>
      {burst.open && burst.shots.length > 0 && (
      <BurstReviewSheet fixed shots={burst.shots} discarded={burst.discarded} onClose={() => burst.setOpen(false)} onAdd={burst.add} onDiscardAll={burst.discardAll} onToggleShot={burst.toggle} />
    )}
      {!session && onRetry && (
        // ARCore did not start (a refusal spends the tap's permission): one more tap asks it again with what works here.
        <button type="button" onClick={onRetry} className="pointer-events-auto absolute left-1/2 top-[calc(env(safe-area-inset-top)+5.5rem)] z-10 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-black shadow-lg">
          <RotateCcw className="size-4" aria-hidden="true" />Riprova ARCore
        </button>
      )}
      <div className={`pointer-events-auto flex items-center gap-2 p-3 ${arcOn ? "landscape:pr-[250px]" : ""}`}>
        <button type="button" onClick={end} aria-label="Esci dalla realtà aumentata e torna alla fotocamera AI"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-black/55 pl-2.5 pr-3.5 text-sm font-semibold backdrop-blur">
          <ChevronLeft className="size-5" aria-hidden="true" />Esci da AR
        </button>
        <button type="button" onClick={() => { if (notice) setNotice(null); else setBarOpen((o) => !o); }} aria-expanded={barExpanded} aria-controls="ar-live-bar-help"
          className={`flex min-h-11 min-w-0 items-center gap-2 rounded-[22px] px-4 py-2 text-left text-sm font-semibold leading-tight transition-colors ${statusTone} ${barExpanded ? "flex-1" : "max-w-[70%]"}`}>
          {!notice && <span className={`size-2 shrink-0 rounded-full ${found ? "bg-[#22c55e]" : "animate-pulse bg-[#facc15]"}`} aria-hidden="true" />}
          <span role="status" className="min-w-0 flex-1">
            <span className={notice ? "" : barExpanded ? "line-clamp-2" : "line-clamp-1"}>{barExpanded ? status : barShort}</span>
            {barExpanded && !notice && (
              <span id="ar-live-bar-help" className="mt-0.5 block text-xs font-normal opacity-80">
                {barHelp}{!session && " Anteprima: senza ARCore le misure sono indicative."}{!session && why ? ` ${why}` : ""}
                {session && (
                  <span className="mt-1 block font-mono text-[10px] opacity-70">
                    ARCore · pavimento {diag.hit === undefined ? "…" : diag.hit ? "sì" : "no"} · overlay {diag.overlay ? "sì" : "no"} · profondità {diag.depth ? "sì" : "no"} · fotogrammi {diag.frames} · trovato {found ? "sì" : "no"}{diag.feats ? ` · ${diag.feats}` : ""}{diag.error ? ` · errore: ${diag.error}` : ""}
                  </span>
                )}
              </span>
            )}
          </span>
          {!session && !notice && !barExpanded && <span className="shrink-0 rounded-full bg-[#facc15] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">Anteprima</span>}
          {!notice && <ChevronDown className={`size-4 shrink-0 opacity-80 transition-transform ${barExpanded ? "rotate-180" : ""}`} aria-hidden="true" />}
        </button>
        {session && (
          // With ARCore the phone's camera belongs to ARCore and Chrome gives the page no flash: the button stays where
          // it is in the preview, dimmed, and a tap says why.
          <button type="button" aria-label="Accendi il flash: passa all’anteprima senza ARCore" title="Flash (passa all’anteprima)"
            onClick={() => onFlashPreview ? onFlashPreview(carryOver()) : setNotice({ text: "Con ARCore il flash non si può accendere: Chrome dà la fotocamera solo ad ARCore. Accendi una luce, aiuta anche a trovare il pavimento.", tone: "warn" })}
            className={`ml-auto ${round}`}>
            <ZapOff className="size-5" />
          </button>
        )}
        {torchOk && (
          <button type="button" onClick={() => void toggleTorch()} aria-pressed={torchOn}
            aria-label={torchOn ? "Disattiva flash" : "Attiva flash"} title={torchOn ? "Disattiva flash" : "Attiva flash"}
            className={`ml-auto ${round} ${torchOn ? "bg-white/90 text-black" : ""}`}>
            {torchOn ? <Zap className="size-5 fill-yellow-400 text-yellow-500" /> : <ZapOff className="size-5" />}
          </button>
        )}

      </div>
      {trayOpen && <button type="button" tabIndex={-1} aria-label="Chiudi le funzioni AI" onClick={() => setTrayOpen(false)} className="pointer-events-auto fixed inset-0 z-30 cursor-default bg-black/35" />}
      {trayOpen && <ArSheet groups={fanGroups} turn={session ? hudTurn : rotation === 270 ? -90 : rotation === -270 ? 90 : rotation === 90 || rotation === -90 ? rotation : 0} onClose={() => setTrayOpen(false)} />}
      {!adjusting && (
        <div className={`pointer-events-auto relative z-10 flex flex-col items-start gap-2 p-3`}>
          {dialOn && !trayOpen && (
            <div className="flex w-full justify-center landscape:hidden">
              <ZoomDial zoom={zoom} max={ZOOM_MAX} onZoom={(z) => setZoom(Math.max(1, Math.min(ZOOM_MAX, z)))} />
            </div>
          )}
          {/* Portrait: AI and Annulla on the left, the shutter in the very middle of the screen (the zoom chips centred
              over it), Riporta on the right. Landscape: one row on the left, the shutter on the right edge. */}
          <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 landscape:flex">
            <div className="flex items-center gap-2">
            <div className="relative shrink-0">
            <button type="button" onClick={() => setTrayOpen((o) => !o)} aria-expanded={trayOpen} aria-controls="ar-ai-tray"
              aria-label={trayOpen ? "Chiudi le funzioni AI" : `Funzioni AI · ${tool === "measure" ? "Misura" : tool === "move" ? "Sposta" : defOf(selected).label}`}
              className="relative grid size-12 shrink-0 place-items-center rounded-full p-[2px] shadow-[0_0_18px_rgba(0,229,255,0.45)] active:scale-95"
              style={{ background: "conic-gradient(from 200deg, #00e5ff, #8b5cf6, #22c55e, #00e5ff)" }}>
              <span className={`grid size-full place-items-center rounded-full ${trayOpen ? "bg-white text-black" : "bg-[#0b1118] text-white"}`}>
                {trayOpen ? <X className="size-5" /> : <Sparkles className="size-5" />}
              </span>
            </button>
            </div>
            <button type="button" onClick={undo} disabled={!placed.length} aria-label="Annulla l’ultimo" className={`${round} disabled:opacity-40`}><Undo2 className="size-5" /></button>
            <BurstThumb shots={burst.shots} open={burst.open} onToggle={() => burst.setOpen((o) => !o)} />
            </div>
            <div className="landscape:hidden">{shutter("size-14", "size-10")}</div>
            <button type="button" onClick={backToMap} disabled={!placed.length}
              className="inline-flex h-11 items-center justify-center gap-2 justify-self-end rounded-full bg-white px-4 text-sm font-bold text-black disabled:opacity-40 landscape:ml-1">
              <MapPinned className="size-4" aria-hidden="true" />{tool === "align" ? "Tocca i 2 punti" : `Riporta${placed.length ? ` · ${placed.length}` : ""}`}
            </button>
          </div>
        </div>
      )}
      {adjusting && (
        <div className="pointer-events-auto flex justify-center p-3">
          <button type="button" onClick={finishAdjust} className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-black shadow-lg">
            <Check className="size-5" aria-hidden="true" />Fatto
          </button>
        </div>
      )}

      {arcOn && (
        // Landscape at rest: the camera's own arc dial on the right edge, the shutter at its centre, as in Rileva.
        <div className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 landscape:block" style={{ marginRight: "env(safe-area-inset-right)" }}>
          <div className="relative h-[380px] w-[280px] origin-right" style={{ transform: "scale(var(--ar-dial-k, 1))" }} ref={dialBox}>
            <ArcZoomDial zoom={zoom} max={ZOOM_MAX} onZoom={(z) => setZoom(Math.max(1, Math.min(ZOOM_MAX, z)))} />
            <div className="pointer-events-auto absolute right-[40px] top-1/2 z-20 -translate-y-1/2 translate-x-1/2">{shutter("size-[72px]", "size-[54px]")}</div>
          </div>
        </div>
      )}
      {!adjusting && !arcOn && (
        // Landscape with the AI tray open (or with ARCore): the shutter on the right edge and, in the preview, the zoom
        // pills in a column just to its left (the ruler upright beside them).
        <div className="pointer-events-none absolute right-0 top-1/2 hidden -translate-y-1/2 landscape:block" style={{ marginRight: "calc(env(safe-area-inset-right) + 1rem)" }}>
          <div className="pointer-events-auto relative">
            {shutter("size-[72px]", "size-[54px]")}
            {dialOn && (
              <div className="absolute right-full top-1/2 mr-3 -translate-y-1/2">
                <ZoomDial vertical zoom={zoom} max={ZOOM_MAX} onZoom={(z) => setZoom(Math.max(1, Math.min(ZOOM_MAX, z)))} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

const ARC_IN_PROVA = false;
/** The depth map's test tools in the AI fan («Gira mappa», «Senza copertura»): off to keep the menu simple. */
const DEPTH_TOOLS = false;

/** The 3D camera's vertical view for a zoom: the 70° preview narrowed like the cropped picture. */
function fovAt(zoom: number): number {
  return (2 * Math.atan(Math.tan((35 * Math.PI) / 180) / Math.max(1, zoom)) * 180) / Math.PI;
}

const FLOOR_KEY = "mdt-ar-floor-v1";
function readFloorOffset(): number {
  try { const v = Number(localStorage.getItem(FLOOR_KEY)); return Number.isFinite(v) ? Math.max(-40, Math.min(40, v)) : 0; } catch { return 0; }
}
function hasFloorOffset(): boolean {
  try { return localStorage.getItem(FLOOR_KEY) !== null; } catch { return false; }
}
function saveFloorOffset(v: number) {
  try { localStorage.setItem(FLOOR_KEY, String(Math.round(v * 10) / 10)); } catch { /* memory only */ }
}

const MODEL_SCALE = 0.1;
/** Where the volume of an object is looked at for obstacles: its middle and round its footprint. */
const OBSTACLE_SAMPLES: Array<[number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

/** The AI camera's multiple shot, shared with the AR view. */
export type ArBurst = {
  shots: readonly BurstShot[]; open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  discarded: ReadonlySet<number>; toggle: (id: number) => void; add: () => void; discardAll: () => void; push: (s: BurstShot) => void;
};

/**
 * A photo with ARCore (the page sees no camera otherwise): with the session's "camera-access" the camera's own image
 * is read from the frame (XRWebGLBinding.getCameraImage), the objects drawn again over it into an off-screen target
 * from the same eye, and the two put together into a JPEG. Null when this phone gives no camera image.
 */
async function captureXrPhoto(renderer: THREE.WebGLRenderer, scene: THREE.Scene, reticle: THREE.Object3D, session: XRSession, frame: XRFrame, multi = false): Promise<File | null> {
  const Binding = (globalThis as unknown as { XRWebGLBinding?: new (s: XRSession, gl: WebGLRenderingContext | WebGL2RenderingContext) => { getCameraImage: (c: unknown) => WebGLTexture | null } }).XRWebGLBinding;
  const ref = renderer.xr.getReferenceSpace();
  const view = ref ? frame.getViewerPose(ref)?.views[0] : undefined;
  const cam = (view as (XRView & { camera?: { width: number; height: number } }) | undefined)?.camera;
  if (!Binding || !cam) return null;
  const gl = renderer.getContext();
  const tex = new Binding(session, gl).getCameraImage(cam);
  if (!tex) return null;
  const w = cam.width, h = cam.height;
  // The camera's image.
  const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const camPx = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, camPx);
  gl.bindFramebuffer(gl.FRAMEBUFFER, prev);
  gl.deleteFramebuffer(fb);
  // The objects, from the same eye, on a transparent target.
  const eye = renderer.xr.getCamera().cameras[0] ?? renderer.xr.getCamera();
  const shotCam = new THREE.PerspectiveCamera();
  shotCam.matrixAutoUpdate = false;
  shotCam.matrixWorldAutoUpdate = false;
  shotCam.projectionMatrix.copy(eye.projectionMatrix);
  shotCam.projectionMatrixInverse.copy(eye.projectionMatrixInverse);
  shotCam.matrixWorld.copy(eye.matrixWorld);
  shotCam.matrixWorldInverse.copy(eye.matrixWorldInverse);
  const rt = new THREE.WebGLRenderTarget(w, h);
  const wasVisible = reticle.visible, prevRt = renderer.getRenderTarget();
  const clear = new THREE.Color(); renderer.getClearColor(clear); const alpha = renderer.getClearAlpha();
  reticle.visible = false;
  renderer.xr.enabled = false;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, shotCam);
  const objPx = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, objPx);
  renderer.setRenderTarget(prevRt);
  renderer.setClearColor(clear, alpha);
  renderer.xr.enabled = true;
  reticle.visible = wasVisible;
  rt.dispose();
  // Both read bottom-up: turned upright and put together.
  const flip = (px: Uint8Array) => {
    const out = new Uint8ClampedArray(w * h * 4), row = w * 4;
    for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    return new ImageData(out, w, h);
  };
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d");
  const o = document.createElement("canvas"); o.width = w; o.height = h;
  const og = o.getContext("2d");
  if (!g || !og) return null;
  g.putImageData(flip(camPx), 0, 0);
  og.putImageData(flip(objPx), 0, 0);
  g.drawImage(o, 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  return blob ? new File([blob], `foto-ar-prova${multi ? "-multiplo" : ""}-${Date.now()}.jpg`, { type: "image/jpeg" }) : null;
}

export type FanItem = { key: string; label: string; Icon: LucideIcon; on: boolean; plant?: boolean; tool?: boolean; aria?: string; hint?: string; onPick: () => void };
export type FanGroup = { key: string; label: string; Icon: LucideIcon; items: FanItem[] };

/** One line on what each object is for, in the AR sheet. */
const OBJECT_HINT: Record<string, string> = {
  albero: "Fa ombra e rinfresca l’aria", pergolato: "Palo centrale, falda tonda di tessuto che si apre e si chiude", aiuola: "Verde permeabile tra i ciottoli",
  nebulizzatore: "Nebbia d’acqua che rinfresca vicino agli ugelli", innaffiatoio: "Bagna aiuole e terreno",
  telo: "Rete ombreggiante sopra le viti", frangivento: "Siepe che ferma il vento", irrigazione: "Ala gocciolante lungo il filare",
};

/**
 * The AR's menu: a sheet rising from the bottom over the camera, like the camera's own sheet — a handle, then one
 * section per group (Piante riconosciute dall’AI, Interventi, Strumenti), each a list of rows with the icon in a
 * round tile, the whole name and one line on what it does; the current choice turquoise with a check. A tap picks and
 * closes it; a tap outside or ✕ closes it.
 */
export function ArSheet({ groups, onClose, turn = 0 }: { groups: FanGroup[]; onClose: () => void; turn?: number }) {
  // Turned with the HUD (ARCore held sideways), the sheet's height follows the turned box (the screen's width), and
  // its list is scrolled by hand along the turned axis, as the browser scrolls in the screen's own axes.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el || !turn) return;
    let last: { x: number; y: number } | null = null;
    // The finger's move along the turned list's own vertical: +90° (clockwise) maps local down onto the screen's left.
    const along = (dx: number) => (turn === 90 ? -dx : dx);
    const onStart = (e: TouchEvent) => { const t = e.touches[0]; last = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!last || !t) return;
      const d = along(t.clientX - last.x);
      last = { x: t.clientX, y: t.clientY };
      el.scrollTop -= d;
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => { last = null; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onEnd); el.removeEventListener("touchcancel", onEnd); };
  }, [turn]);
  const shown = groups.filter((g) => g.items.length > 0);
  const TITLES: Record<string, string> = { piante: "Piante riconosciute dall’AI", interventi: "Interventi", strumenti: "Strumenti" };
  return (
    <div id="ar-ai-tray" role="dialog" aria-label="Funzioni AI" className="ar-sheet pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto flex max-h-[78dvh] w-full max-w-lg flex-col rounded-t-[28px] border-t border-white/15 text-white shadow-[0_-20px_60px_rgba(0,0,0,0.55)] landscape:max-h-[92dvh]"
      style={{ background: "oklch(0.25 0.02 255 / 0.97)", paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)", ...(turn && typeof window !== "undefined" ? { maxHeight: `${Math.round(window.innerWidth * 0.92)}px` } : {}) }}>
      <div className="flex items-center justify-between px-5 pb-1 pt-2">
        <span className="mx-auto h-1.5 w-10 rounded-full bg-white/25" aria-hidden="true" />
      </div>
      <div className="flex items-center justify-between px-5 pb-2">
        <h2 className="text-lg font-semibold">Cosa vuoi fare?</h2>
        <button type="button" onClick={onClose} aria-label="Chiudi" className="grid size-10 place-items-center rounded-full bg-white/10"><X className="size-5" /></button>
      </div>
      <div ref={listRef} className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 ${turn ? "touch-none" : ""}`}>
        {shown.map((g) => (
          <section key={g.key} aria-label={TITLES[g.key] ?? g.label} className="mb-3">
            <h3 className="px-2 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">{TITLES[g.key] ?? g.label}</h3>
            <ul className="overflow-hidden rounded-2xl bg-white/[0.06]">
              {g.items.map((it, i) => (
                <li key={it.key} className={i ? "border-t border-white/[0.07]" : ""}>
                  <button type="button" onClick={it.onPick} aria-pressed={it.on} aria-label={it.aria ? `${it.label}: ${it.aria}` : undefined}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-white/10">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full ${it.on ? "bg-[#00e5ff] text-black" : it.plant ? "bg-[#4ade80]/15 text-[#4ade80] ring-1 ring-[#4ade80]/60" : "bg-white/10 text-white"}`}>
                      <it.Icon className="size-[22px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[15px] font-semibold leading-tight ${it.on ? "text-[#00e5ff]" : ""}`}>{it.label}</span>
                      {it.hint && <span className="mt-0.5 block text-xs leading-snug text-white/65">{it.hint}</span>}
                    </span>
                    {it.on && <Check className="size-5 shrink-0 text-[#00e5ff]" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

const OBJECT_ICONS: Record<string, LucideIcon> = {
  albero: TreeDeciduous, pergolato: Fence, aiuola: Flower2, nebulizzatore: CloudDrizzle, innaffiatoio: Droplets,
  telo: Umbrella, frangivento: Wind, irrigazione: Droplets,
};
function plantIcon(form?: string): LucideIcon {
  return form === "conical" || form === "columnar" ? TreePine : form === "shrub" ? Shrub : form === "vine" ? Grape : TreeDeciduous;
}


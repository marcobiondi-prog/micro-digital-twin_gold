import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { Box, Check, Layers, ChevronDown, ChevronLeft, RotateCw, Zap, ZapOff, CloudDrizzle, Leaf, Droplets, Fence, Flower2, Grape, Shrub, Sparkles, MapPinned, MoveVertical, Ruler, TreeDeciduous, TreePine, Umbrella, Undo2, Wind, X, type LucideIcon } from "lucide-react";
import type { ArKind } from "@/models/ar-focus";
import {
  AR_OBJECTS, alignFromFix, placeHaptic, zonesInside, horizonAt, pitchForHorizon, alignTwoPoints, arDistance, arObject, enToAr, metresText, objectsToZones, toEN,
  type Alignment, type ArObjectDef, type PlacedObject,
} from "@/models/ar-objects";
import { getLab, setUrban, setVineyard } from "@/models/lab-store";
import { drawnAreaFor, type DrawnArea } from "@/models/drawn-area";
import { readFix } from "@/lib/find-position";
import { hapticTick } from "@/lib/haptics";
import { contactShadow, floorLoop, objectMesh } from "@/views/ar-object-meshes";
import { buildPlan, growPlan, planText } from "@/views/ar-plan";
import { realTree, wantsRealTree } from "@/views/ar-tree";
import { ArShadows, castShadows } from "@/views/ar-shadow";
import { XREstimatedLight } from "three/examples/jsm/webxr/XREstimatedLight.js";
import { ZoomDial } from "@/views/ZoomDial";
import { ArcZoomDial } from "@/views/ArcZoomDial";
import { ZOOM_MAX } from "@/lib/camera-zoom";
import { probeCameraTorch, setCameraTorch, supportsCameraTorch } from "@/lib/camera-torch";
import { HOLD_MS, useHoldBurst } from "@/lib/hold-burst";
import { DEPTH_INIT, DepthOccluder, FLIP_MODES, depthFlip, depthWanted, patchGpuDepthQuery, setDepthFlip, setDepthWanted } from "@/views/ar-depth";
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

/** Asks for the AR session; call it straight from a tap (the browser wants a user gesture). The HUD overlay is
 *  required in every try — without it the AR view would have no ✕ nor tools, and only the phone's Back would get
 *  out —, hit-test first required, then optional. The camera's fullscreen (which keeps the landscape: outside it
 *  the app is locked portrait) is left only as a last try, when the phone refused both while in fullscreen, and
 *  taken back if that fails too, so a refusal falls back to the preview in the same orientation. */
export async function requestArSession(overlayRoot: HTMLElement): Promise<XRSession> {
  // Chrome on the user's Xperia refuses every immersive-ar session while the page is in fullscreen
  // ("NotSupportedError" for each configuration, the bare one too), and starts it once out of it, as the first AR
  // version did: so the camera's fullscreen is left first. Out of it the app's portrait lock comes back, so the
  // orientation the phone is held in is asked to stay (it may be refused; then the AR opens portrait).
  if (typeof document !== "undefined" && document.fullscreenElement) {
    const held = screen.orientation?.type;
    await document.exitFullscreen().catch(() => undefined);
    const o = screen.orientation as ScreenOrientation & { lock?: (v: string) => Promise<void> };
    if (held?.startsWith("landscape")) await o.lock?.(held).catch(() => undefined);
  }
  // Then tried in turn, each moving on only on NotSupportedError: with the HUD overlay first, then without it (Chrome
  // shows its own close button; a tap on the floor still puts the chosen object), then the bare session. Every
  // refusal is reported together when none starts.
  const tries: Array<[string, XRSessionInit]> = [
    // ARCore's depth first (real walls and furniture hide the objects), on unless switched off by hand. Optional, so a
    // phone without it still starts.
    ...(depthWanted() ? [["overlay+pavimento+profondità", { requiredFeatures: ["hit-test", "dom-overlay"], optionalFeatures: ["local-floor", "camera-access", "depth-sensing", "light-estimation"], depthSensing: DEPTH_INIT, domOverlay: { root: overlayRoot } } as unknown as XRSessionInit] as [string, XRSessionInit]] : []),
    ["overlay+pavimento", { requiredFeatures: ["hit-test", "dom-overlay"], optionalFeatures: ["local-floor", "camera-access", "light-estimation"], domOverlay: { root: overlayRoot } } as XRSessionInit],
    ["overlay", { requiredFeatures: ["dom-overlay"], optionalFeatures: ["hit-test", "local-floor", "camera-access", "light-estimation"], domOverlay: { root: overlayRoot } } as XRSessionInit],
    ["pavimento", { requiredFeatures: ["hit-test"], optionalFeatures: ["local-floor", "camera-access", "light-estimation"] }],
    ["base", {}],
  ];
  const report: string[] = [];
  for (const [name, init] of tries) {
    try { return await navigator.xr!.requestSession("immersive-ar", init); }
    catch (e) {
      report.push(`${name}: ${e instanceof DOMException ? e.name : e instanceof Error ? e.message : String(e)}`);
      if (!(e instanceof DOMException) || e.name !== "NotSupportedError") break;
    }
  }
  throw new Error(report.join(" · "));
}

type Tool = "place" | "align" | "measure";
type V = { x: number; y: number; z: number };

/**
 * Without ARCore (iPhone, older phones, computers) the same tools run as a preview: the objects are drawn over the
 * camera on a floor guessed from how the phone is held (eyes at 1,5 m, the floor's tilt from the phone's tilt), so sizes
 * are close but not anchored. With a session it is the real live AR.
 */
/** The "Tocca per ruotare la vista AR" notice when the phone is turned during an ARCore session. */
const ROTATE_PROMPT = false;

export function ArLive({ kind, session, stream = null, plants = [], onShot, onEnd, onRotate, why, burst, torch = false, onFlashPreview }: { burst: ArBurst; torch?: boolean; onFlashPreview?: () => void; why?: string | undefined; kind: ArKind; session: XRSession | null; stream?: MediaStream | null; plants?: ArObjectDef[]; onShot?: (file: File) => void; onEnd: () => void; onRotate?: () => void }) {
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
  const [adjusting, setAdjusting] = useState(() => !session && !hasFloorOffset());
  const adjustingRef = useRef(false);
  adjustingRef.current = adjusting;
  const floorRef = useRef({ tilt: -14, offset: readFloorOffset() });
  const horizonLine = useRef<HTMLDivElement>(null);
  // Zoom of the preview (the camera's own dial, in landscape): the picture is cropped from its middle and the 3D
  // camera narrows its view by the same amount, so the objects stay on the floor they were put on.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const [found, setFound] = useState(false);
  const [placed, setPlaced] = useState<PlacedObject[]>([]);
  // «Modellino»: everything at 1:10, to try indoors or see the whole piazza on a table (not sent to the map).
  const [model, setModel] = useState(false);
  const modelK = model ? MODEL_SCALE : 1;
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
  // What the AR session really got (shown in the open status bar): to tell, on a phone, why it does not work.
  const [diag, setDiag] = useState<{ hit?: boolean; overlay?: boolean; feats?: string; frames: number; error?: string; depth?: boolean }>({ frames: 0 });
  // ARCore's depth: real walls and furniture hide the objects behind them. «Profondità» in the fan turns it off.
  const depthRef = useRef<DepthOccluder | null>(null);
  const [depthOn, setDepthOn] = useState(true);
  const [depthLive, setDepthLive] = useState(false);
  const [flip, setFlip] = useState(depthFlip);
  useEffect(() => { if (depthRef.current) depthRef.current.enabled = depthOn; }, [depthOn]);
  const framesRef = useRef(0);
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => setDiag((d) => (d.frames === framesRef.current ? d : { ...d, frames: framesRef.current })), 1000);
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
  const planSaid = useRef("");
  const three = useRef<{ scene: THREE.Scene; reticle: THREE.Object3D; hit: V | null; objects: Map<string, THREE.Object3D>; overlay: THREE.Group; measure: THREE.Group; floorY: number | null; renderer: THREE.WebGLRenderer; camera: THREE.Camera } | null>(null);

  const lab = getLab();
  const loc = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const area: DrawnArea | null = drawnAreaFor(kind === "urban" ? lab.urban.area : lab.vineyard.area, loc);
  const u = lab.urban, vz = lab.vineyard.zones;
  const planKey = kind === "urban" ? `${u.trees}|${u.permeable}|${u.shade}|${u.misters ?? 0}|${u.sprinklers ?? 0}` : JSON.stringify(vz.map((z) => [z.irrigation, z.shade, z.windbreak]));
  // The metre frame of the map: the area's middle (else the place).
  const origin = useMemo(() => {
    if (!area) return { lat: loc.lat, lng: loc.lng };
    const r = area.ring;
    return { lat: r.reduce((s, p) => s + p[0], 0) / r.length, lng: r.reduce((s, p) => s + p[1], 0) / r.length };
  }, [area, loc.lat, loc.lng]);

  // The session: three.js on WebXR, the hit test from the screen's centre, a reticle on the floor.
  useEffect(() => {
    let disposed = false;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
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
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#00e5ff" }));
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
    if (!session) return startPreview(renderer, scene, camera, reticle, () => { disposed = true; });
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
    renderer.setAnimationLoop((_t, frame?: XRFrame) => {
      if (frame) framesRef.current += 1;
      // The estimated reflections arrive a little after the light: used as soon as they do.
      if (est?.parent && est.environment && scene.environment !== est.environment) scene.environment = est.environment;
      const t = three.current;
      if (!t) return;
      if (frame && hitSource) {
        const ref = renderer.xr.getReferenceSpace();
        const hits = ref ? frame.getHitTestResults(hitSource) : [];
        const pose = hits[0] && ref ? hits[0].getPose(ref) : null;
        if (pose) {
          reticle.visible = true;
          reticle.matrix.fromArray(pose.transform.matrix);
          const p = pose.transform.position;
          t.hit = { x: p.x, y: p.y, z: p.z };
          if (t.floorY === null) t.floorY = p.y;
          // The floor found: a clear double pulse the first time, a short one when it is found again after losing it.
          if (!sawFloor) { sawFloor = true; setFound(true); hapticTick([40, 60, 40]); }
          else if (lostAt && performance.now() - lostAt > 1500) hapticTick([30]);
          lostAt = 0;
        } else { reticle.visible = false; t.hit = null; if (sawFloor && !lostAt) lostAt = performance.now(); }
      }
      if (frame && occluder) {
        const ref = renderer.xr.getReferenceSpace();
        const view = ref ? frame.getViewerPose(ref)?.views[0] : undefined;
        const had = occluder.live;
        occluder.update(frame, view, (session as XRSession & { depthDataFormat?: string }).depthDataFormat);
        if (had !== occluder.live) { setDepthLive(occluder.live); setDiag((d) => ({ ...d, depth: occluder.live })); }
      }
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
      three.current = null;
    };
    // The session is fixed for this component's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  /** The preview without ARCore: a transparent canvas over the camera, a floor 1,5 m under the eyes. */
  function startPreview(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, reticle: THREE.Mesh, stop: () => void) {
    const host = canvasHost.current;
    if (!host) return;
    renderer.xr.enabled = false;
    const el = renderer.domElement;
    el.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
    host.appendChild(el);
    const size = () => {
      const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.fov = fovAt(zoomRef.current); camera.near = 0.05; camera.far = 200; camera.updateProjectionMatrix();
    };
    size();
    const fl = floorRef.current;
    const onTilt = (e: DeviceOrientationEvent) => { if (e.beta !== null) fl.tilt = Math.max(-80, Math.min(-8, e.beta - 90)); };
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
    renderer.setAnimationLoop(() => {
      const fov = fovAt(zoomRef.current);
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      const pitch = Math.max(-80, Math.min(10, fl.tilt + fl.offset));
      camera.rotation.set((pitch * Math.PI) / 180, 0, 0, "YXZ");
      if (horizonLine.current) horizonLine.current.style.top = `${(horizonAt(pitch, camera.fov) * 100).toFixed(2)}%`;
      camera.updateMatrixWorld();
      const t = three.current;
      const c = at(0.5, 0.62);
      if (t) t.hit = c;
      reticle.visible = !!c;
      if (c) reticle.matrix.makeTranslation(c.x, 0.01, c.z);
      if (t) shadowsRef.current?.update(t.objects.values(), t.floorY, null);
      renderer.render(scene, camera);
    });
    const onTap = (e: PointerEvent) => {
      if (adjustingRef.current) return;
      const r = el.getBoundingClientRect();
      const p = at((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (p && three.current) { three.current.hit = p; placeAtHit(); }
    };
    el.addEventListener("pointerup", onTap);
    return () => {
      stop();
      el.removeEventListener("pointerup", onTap);
      window.removeEventListener("deviceorientation", onTilt);
      window.removeEventListener("resize", size);
      renderer.setAnimationLoop(null);
      renderer.dispose();
      el.remove();
      three.current = null;
    };
  }

  function placeAtHit() {
      const t = three.current, hit = t?.hit;
      if (!t || !hit || performance.now() < pinchUntil.current) return;
      const { tool: tl } = live.current;
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
        let cx = hit.x, cz = hit.z, yaw = 0;
        if (def.id === "pergolato" || def.id === "telo") {
          const eye = new THREE.Vector3().setFromMatrixPosition((t.renderer.xr.isPresenting ? t.renderer.xr.getCamera() : t.camera).matrixWorld);
          let dx = hit.x - eye.x, dz = hit.z - eye.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.05) {
            dx /= len; dz /= len;
            const reach = (def.d / 2 - 0.12) * modelRef.current;
            cx = hit.x + dx * reach; cz = hit.z + dz * reach;
            g.rotation.y = Math.atan2(dx, dz);
            yaw = -g.rotation.y;
          }
        }
        g.position.set(cx, hit.y, cz);
        g.scale.setScalar(modelRef.current);
        castShadows(g);
        t.scene.add(g);
        t.objects.set(uid, g);
        setPlaced((l) => [...l, { uid, id: def.id, x: cx, z: cz, yaw, ...(def.plant ? { def } : {}) }]);
        hapticTick(placeHaptic(def));
      } else if (tl === "align") {
        setAlignPts((pts) => (pts.length >= 2 ? [hit] : [...pts, hit]));
        hapticTick([30]);
      } else {
        setMeasure((pts) => (pts.length >= 2 ? [hit] : [...pts, hit]));
        hapticTick([30]);
      }
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
    const { group, count } = buildPlan(kind, getLab(), area, origin, alignment.a);
    group.position.y = y;
    castShadows(group);
    t.overlay.add(group);
    void growPlan(group, () => group.parent === t.overlay, castShadows);
    const said = planText(count);
    if (said && planSaid.current !== `${alignment.how}:${said}`) {
      planSaid.current = `${alignment.how}:${said}`;
      setNotice({ text: `Dal progetto: ${said}${alignment.how === "gps" ? " · posizione dal GPS, tocca i 2 angoli per allinearli bene" : ""}`, tone: "ok" });
    }
  }, [alignment, area, origin, showPlan, kind, planKey]);

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
        : tool === "measure"
          ? dist !== null ? `Distanza ${metresText(dist)}` : measure.length === 1 ? "Tocca il secondo punto" : "Tocca il primo punto"
          : `Tocca il pavimento per posare: ${defOf(selected).label}`);
  // The bar on top stays a small pill (what a tap does, in two words); a tap opens it to the whole sentence and a
  // line on how it works. Messages open it by themselves while they last.
  const [barOpen, setBarOpen] = useState(false);
  const barShort = !found ? "Cerco il pavimento…" : adjusting ? "Regola pavimento"
    : tool === "measure" ? (dist !== null ? metresText(dist) : "Misura") : tool === "align" ? `Punto ${alignPts.length + 1} dell’area` : defOf(selected).label;
  const barHelp = !found ? "Muovi piano il telefono verso il pavimento finché lo riconosco."
    : tool === "measure" ? "Tocca due punti a terra: ti dico quanto distano."
    : tool === "align" ? "Tocca a terra i punti 1 e 2 dell’area disegnata sulla mappa: così gli oggetti tornano al posto giusto."
    : "Tocca il pavimento dove vuoi metterlo: compare a grandezza vera. Annulla toglie l’ultimo, il pulsante AI cambia oggetto.";
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
  // Two fingers on the screen resize the last object put down (0,1×…3× its real size), its height said as it changes.
  const placedRef = useRef(placed);
  placedRef.current = placed;
  useEffect(() => {
    let d0 = 0, base = 1, uid = "", cur = 1, lastSaid = 0;
    const dist = (e: TouchEvent) => Math.hypot(e.touches[0]!.clientX - e.touches[1]!.clientX, e.touches[0]!.clientY - e.touches[1]!.clientY);
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const last = placedRef.current[placedRef.current.length - 1];
      if (!last) return;
      d0 = dist(e); uid = last.uid; base = last.scale ?? 1; cur = base;
      pinchUntil.current = performance.now() + 600;
    };
    const move = (e: TouchEvent) => {
      if (!uid || e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      pinchUntil.current = performance.now() + 600;
      cur = Math.max(0.1, Math.min(3, base * (dist(e) / d0)));
      three.current?.objects.get(uid)?.scale.setScalar(modelRef.current * cur);
      const now = performance.now();
      if (now - lastSaid > 120) {
        lastSaid = now;
        const o = placedRef.current.find((p) => p.uid === uid);
        const def = o ? (o.def ?? defOfRef.current(o.id)) : null;
        if (def) setNotice({ text: `${def.label} · ${metresText(def.h * cur)} di altezza${cur !== 1 ? ` (vero: ${metresText(def.h)})` : ""}`, tone: "ok" });
      }
    };
    const end = (e: TouchEvent) => {
      if (!uid || e.touches.length >= 2) return;
      const id = uid, k = Math.round(cur * 100) / 100;
      uid = ""; d0 = 0;
      pinchUntil.current = performance.now() + 400;
      setPlaced((l) => l.map((p) => (p.uid === id ? { ...p, scale: k } : p)));
      hapticTick([20]);
      window.setTimeout(() => setNotice((n) => (n?.text.includes("di altezza") ? null : n)), 1800);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
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
  const dialOn = !session && !adjusting;


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
    aria: `${o.label}, riconosciuto: ${o.plant?.scientificName ?? ""}, alto circa ${Math.round(o.h)} m`, onPick: () => pick(key) }));
  const objectItems: FanItem[] = objectChoices.map(({ key, def: o }) => ({ key, label: o.label, Icon: OBJECT_ICONS[o.id] ?? Sparkles, on: tool === "place" && selected === key, onPick: () => pick(key) }));
  const toolItems: FanItem[] = [
    { key: "t:misura", label: "Misura", Icon: Ruler, tool: true, on: tool === "measure", onPick: () => { setTool("measure"); setMeasure([]); setTrayOpen(false); } },
    ...(area ? [{ key: "t:progetto", label: showPlan ? "Nascondi progetto" : "Mostra progetto", Icon: MapPinned, tool: true, on: showPlan,
      aria: showPlan ? "Nascondi gli interventi della mappa" : "Mostra gli interventi della mappa nel loro punto",
      onPick: () => { setShowPlan((v) => !v); setTrayOpen(false); setNotice({ text: showPlan ? "Interventi della mappa nascosti" : "Interventi della mappa nel loro punto", tone: "ok" }); } }] : []),
    { key: "t:modellino", label: model ? "Grandezza vera" : "Modellino", Icon: Box, tool: true, on: model, aria: model ? "Torna alla grandezza vera" : "Modellino in scala 1:10",
      onPick: () => { setModel((m) => !m); setTrayOpen(false); setNotice({ text: model ? "Grandezza vera" : "Modellino 1:10 · per provare al chiuso o su un tavolo", tone: "ok" }); } },
    // ARCore's depth as a test: switching it on or off restarts the session (it is asked when the session starts).
    ...(session && onRotate ? [{ key: "t:profondita", label: depthWanted() ? "Spegni profondità" : "Profondità", Icon: Layers, tool: true, on: depthWanted(),
      aria: depthWanted() ? "Spegni la prova della profondità e riavvia l’AR" : "Accendi la profondità: muri e mobili veri coprono gli oggetti (riavvia l’AR)",
      onPick: () => { const on = !depthWanted(); setDepthWanted(on); setTrayOpen(false); setNotice({ text: on ? "Riavvio l’AR con la profondità: muri e mobili coprono gli oggetti" : "Riavvio l’AR senza profondità", tone: "ok" }); onRotate(); } }] : []),
    ...(session && depthLive ? [{ key: "t:mappa", label: `Gira mappa ${flip + 1}/${FLIP_MODES}`, Icon: RotateCw, tool: true, on: false,
      aria: "Gira la mappa di profondità, se gli oggetti spariscono nei posti sbagliati",
      onPick: () => { const n = (flip + 1) % FLIP_MODES; setFlip(n); setDepthFlip(n); depthRef.current?.setFlip(n); setDepthOn(true); setTrayOpen(false); setNotice({ text: `Mappa di profondità ${n + 1} di ${FLIP_MODES}: guarda se i pali spariscono dietro persone e mobili`, tone: "ok" }); } },
      { key: "t:pausa", label: depthOn ? "Senza copertura" : "Con copertura", Icon: Layers, tool: true, on: !depthOn,
      aria: depthOn ? "Mostra gli oggetti anche dietro muri e mobili, per confrontare" : "Muri e mobili coprono di nuovo gli oggetti",
      onPick: () => { setDepthOn((v) => !v); setTrayOpen(false); } }] : []),
    ...(!session ? [{ key: "t:pavimento", label: "Pavimento", Icon: MoveVertical, tool: true, on: false, aria: "Regola pavimento", onPick: () => { setAdjusting(true); setTrayOpen(false); } }] : []),
  ];
  const fanGroups: FanGroup[] = [
    { key: "piante", label: "Piante AI", Icon: Leaf, items: plantItems },
    { key: "interventi", label: "Interventi", Icon: kind === "vineyard" ? Grape : TreeDeciduous, items: objectItems },
    { key: "strumenti", label: "Strumenti", Icon: Ruler, items: toolItems },
  ];
  const fanStart = tool === "measure" ? "strumenti" : plantItems.some((i) => i.on) ? "piante" : objectItems.some((i) => i.on) ? "interventi" : plantItems.length ? "piante" : "interventi";
  const chip = (key: string, o: ArObjectDef, icon: React.ReactNode) => {
    const on = tool === "place" && selected === key;
    return (
      <button key={key} type="button" role="radio" aria-checked={on} onClick={() => { setSelected(key); setTool("place"); setTrayOpen(false); }}
        aria-label={o.plant ? `${o.label}, riconosciuto: ${o.plant.scientificName}, alto circa ${Math.round(o.h)} m` : undefined}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${on ? "bg-[#00e5ff] text-black" : "bg-white/10"}`}>
        {icon}{o.label}
      </button>
    );
  };

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
    <div ref={hudRef} className="ar-live-hud pointer-events-none fixed inset-0 z-50 flex select-none flex-col justify-between text-white [-webkit-touch-callout:none]" style={{ padding: `${session ? "max(env(safe-area-inset-top), 1.5rem)" : "env(safe-area-inset-top)"} env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)` }}>
      {burst.open && burst.shots.length > 0 && (
      <BurstReviewSheet fixed shots={burst.shots} discarded={burst.discarded} onClose={() => burst.setOpen(false)} onAdd={burst.add} onDiscardAll={burst.discardAll} onToggleShot={burst.toggle} />
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
            onClick={() => onFlashPreview ? onFlashPreview() : setNotice({ text: "Con ARCore il flash non si può accendere: Chrome dà la fotocamera solo ad ARCore. Accendi una luce, aiuta anche a trovare il pavimento.", tone: "warn" })}
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
      {trayOpen && <button type="button" tabIndex={-1} aria-label="Chiudi le funzioni AI" onClick={() => setTrayOpen(false)} className="pointer-events-auto fixed inset-0 z-0 cursor-default" />}
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
            {trayOpen && <AiFan groups={fanGroups} start={fanStart} />}
            <button type="button" onClick={() => setTrayOpen((o) => !o)} aria-expanded={trayOpen} aria-controls="ar-ai-tray"
              aria-label={trayOpen ? "Chiudi le funzioni AI" : `Funzioni AI · ${tool === "measure" ? "Misura" : defOf(selected).label}`}
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

type FanItem = { key: string; label: string; Icon: LucideIcon; on: boolean; plant?: boolean; tool?: boolean; aria?: string; onPick: () => void };
type FanGroup = { key: string; label: string; Icon: LucideIcon; items: FanItem[] };

const OBJECT_ICONS: Record<string, LucideIcon> = {
  albero: TreeDeciduous, pergolato: Fence, aiuola: Flower2, nebulizzatore: CloudDrizzle, innaffiatoio: Droplets,
  telo: Umbrella, frangivento: Wind, irrigazione: Droplets,
};
function plantIcon(form?: string): LucideIcon {
  return form === "conical" || form === "columnar" ? TreePine : form === "shrub" ? Shrub : form === "vine" ? Grape : TreeDeciduous;
}

/** The AI fan: three round groups fanned out over a quarter circle from the AI button (up → right) — Piante AI,
 *  Interventi, Strumenti — and, on a wider arc beyond them, the icons of the open group (the group of the current
 *  choice at first). Each comes out of the button a few ms after the one before; a tap outside folds it. */
function AiFan({ groups, start }: { groups: FanGroup[]; start: string }) {
  const [open, setOpen] = useState(start);
  const shown = groups.filter((g) => g.items.length > 0);
  const group = shown.find((g) => g.key === open) ?? shown[0];
  const arc = (n: number, i: number, from: number, to: number) => (n === 1 ? (from + to) / 2 : from - (i * (from - to)) / (n - 1));
  const at = (deg: number, r: number) => { const a = (deg * Math.PI) / 180; return { x: Math.round(r * Math.cos(a)), y: Math.round(-r * Math.sin(a)) }; };
  const items = group?.items ?? [];
  return (
    <div id="ar-ai-tray" role="menu" aria-label="Funzioni AI" className="absolute left-1/2 top-1/2 z-10 size-0">
      {shown.map((g, i) => {
        const { x, y } = at(arc(shown.length, i, 90, 24), 118);
        const on = g.key === group?.key;
        return (
          <button key={g.key} type="button" role="menuitem" aria-expanded={on} aria-label={g.label} onClick={() => setOpen(g.key)}
            className="ar-fan-item absolute left-0 top-0 flex w-16 flex-col items-center gap-1"
            style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`, animationDelay: `${i * 40}ms` }}>
            <span className={`grid size-12 place-items-center rounded-full shadow-[0_6px_18px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors ${on ? "bg-white text-black" : "bg-black/60 text-white ring-1 ring-white/25"}`}>
              <g.Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-[10px] font-semibold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">{g.label}</span>
          </button>
        );
      })}
      {items.map((it, i) => {
        // Kept above the bottom row (from straight up to 18°); with many icons every other one sits on a wider arc,
        // so neighbours and their names never overlap.
        const { x, y } = at(arc(items.length, i, 90, 18), items.length > 4 ? (i % 2 ? 252 : 192) : 196);
        return (
          <button key={`${group!.key}-${it.key}`} type="button" role="menuitemradio" aria-checked={it.on} aria-label={it.aria ?? it.label} onClick={it.onPick}
            className="ar-fan-item absolute left-0 top-0 flex w-16 flex-col items-center gap-1"
            style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`, animationDelay: `${120 + i * 30}ms` }}>
            <span className={`grid size-12 place-items-center rounded-full shadow-[0_6px_18px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors ${
              it.on ? "bg-[#00e5ff] text-black" : it.plant ? "bg-black/60 text-[#4ade80] ring-2 ring-[#4ade80]/80" : "bg-black/60 text-white ring-1 ring-white/25"}`}>
              <it.Icon className="size-[22px]" aria-hidden="true" />
            </span>
            <span className="max-w-full truncate text-[10px] font-semibold leading-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

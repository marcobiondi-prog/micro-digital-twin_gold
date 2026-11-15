import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { Check, Crosshair, Leaf, MapPinned, MoveVertical, Ruler, Undo2, X } from "lucide-react";
import type { ArKind } from "@/models/ar-focus";
import {
  AR_OBJECTS, alignFromFix, zonesInside, horizonAt, pitchForHorizon, alignTwoPoints, arDistance, arObject, enToAr, metresText, objectsToZones, toEN,
  type Alignment, type ArObjectDef, type PlacedObject,
} from "@/models/ar-objects";
import { getLab, setUrban, setVineyard } from "@/models/lab-store";
import { drawnAreaFor, type DrawnArea } from "@/models/drawn-area";
import { readFix } from "@/lib/find-position";
import { hapticTick } from "@/lib/haptics";
import { contactShadow, floorLoop, objectMesh } from "@/views/ar-object-meshes";

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
export function requestArSession(overlayRoot: HTMLElement): Promise<XRSession> {
  const init = {
    requiredFeatures: ["hit-test"],
    optionalFeatures: ["dom-overlay", "local-floor", "light-estimation", "anchors"],
    domOverlay: { root: overlayRoot },
  } as XRSessionInit;
  return navigator.xr!.requestSession("immersive-ar", init);
}

type Tool = "place" | "align" | "measure";
type V = { x: number; y: number; z: number };

/**
 * Without ARCore (iPhone, older phones, computers) the same tools run as a preview: the objects are drawn over the
 * camera on a floor guessed from how the phone is held (eyes at 1,5 m, the floor's tilt from the phone's tilt), so sizes
 * are close but not anchored. With a session it is the real live AR.
 */
export function ArLive({ kind, session, stream = null, plants = [], onEnd }: { kind: ArKind; session: XRSession | null; stream?: MediaStream | null; plants?: ArObjectDef[]; onEnd: () => void }) {
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
  const [found, setFound] = useState(false);
  const [placed, setPlaced] = useState<PlacedObject[]>([]);
  const [alignPts, setAlignPts] = useState<V[]>([]);
  const [alignment, setAlignment] = useState<{ a: Alignment; how: "corners" | "gps" } | null>(null);
  const [measure, setMeasure] = useState<V[]>([]);
  const hudRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Messages written over the camera: the app's toasts sit under the camera's dialog.
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
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
  const three = useRef<{ scene: THREE.Scene; reticle: THREE.Object3D; hit: V | null; objects: Map<string, THREE.Object3D>; overlay: THREE.Group; measure: THREE.Group; floorY: number | null } | null>(null);

  const lab = getLab();
  const loc = kind === "urban" ? lab.urban.location : lab.vineyard.location;
  const area: DrawnArea | null = drawnAreaFor(kind === "urban" ? lab.urban.area : lab.vineyard.area, loc);
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
    const reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#00e5ff" }));
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);
    const overlay = new THREE.Group(), measureG = new THREE.Group();
    scene.add(overlay, measureG);
    three.current = { scene, reticle, hit: null, objects: new Map(), overlay, measure: measureG, floorY: null };

    // Where the phone is and points at the start: the map's alignment until the two corners are touched.
    void readFix().then((fix) => {
      if (disposed || !fix || fix.heading === null) return;
      setAlignment((cur) => cur ?? { a: alignFromFix(toEN(fix.lat, fix.lng, origin), fix.heading!), how: "gps" });
    });
    let hitSource: XRHitTestSource | null = null;
    if (!session) return startPreview(renderer, scene, camera, reticle, () => { disposed = true; });
    void (async () => {
      try {
        await renderer.xr.setSession(session as unknown as Parameters<THREE.WebXRManager["setSession"]>[0]);
        const viewer = await session.requestReferenceSpace("viewer");
        hitSource = (await session.requestHitTestSource?.({ space: viewer })) ?? null;
      } catch (e) {
        toast.error("La realtà aumentata non è partita", { description: e instanceof Error ? e.message : String(e) });
        void session.end().catch(() => undefined);
      }
    })();

    let sawFloor = false;
    renderer.setAnimationLoop((_t, frame?: XRFrame) => {
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
          if (!sawFloor) { sawFloor = true; setFound(true); hapticTick([15]); }
        } else { reticle.visible = false; t.hit = null; }
      }
      renderer.render(scene, camera);
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
      camera.aspect = w / h; camera.fov = 70; camera.near = 0.05; camera.far = 200; camera.updateProjectionMatrix();
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
      const pitch = Math.max(-80, Math.min(10, fl.tilt + fl.offset));
      camera.rotation.set((pitch * Math.PI) / 180, 0, 0, "YXZ");
      if (horizonLine.current) horizonLine.current.style.top = `${(horizonAt(pitch, camera.fov) * 100).toFixed(2)}%`;
      camera.updateMatrixWorld();
      const t = three.current;
      const c = at(0.5, 0.62);
      if (t) t.hit = c;
      reticle.visible = !!c;
      if (c) reticle.matrix.makeTranslation(c.x, 0.01, c.z);
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
      if (!t || !hit) return;
      const { tool: tl } = live.current;
      if (tl === "place") {
        const def = defOfRef.current(live.current.selected);
        const uid = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const g = objectMesh(def);
        g.add(contactShadow(def));
        g.position.set(hit.x, hit.y, hit.z);
        t.scene.add(g);
        t.objects.set(uid, g);
        setPlaced((l) => [...l, { uid, id: def.id, x: hit.x, z: hit.z, yaw: 0, ...(def.plant ? { def } : {}) }]);
        hapticTick([20]);
      } else if (tl === "align") {
        setAlignPts((pts) => (pts.length >= 2 ? [hit] : [...pts, hit]));
        hapticTick([15]);
      } else {
        setMeasure((pts) => (pts.length >= 2 ? [hit] : [...pts, hit]));
        hapticTick([15]);
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
  }, [alignment, area, origin]);

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
    if (!area) { setNotice({ text: "Prima disegna l’area nella scheda Mappa: gli oggetti diventano zone dentro l’area.", tone: "warn" }); return; }
    if (!alignment) {
      setTool("align"); setAlignPts([]);
      setNotice({ text: "Prima allinea l’area: tocca sul pavimento i punti 1 e 2 dell’area disegnata.", tone: "warn" });
      return;
    }
    const { kept: zones, out } = zonesInside(objectsToZones(kind, placed, alignment.a, origin), area.ring);
    if (!zones.length) { setNotice({ text: "Gli oggetti cadono fuori dall’area disegnata: mettili dentro, o allinea di nuovo l’area.", tone: "warn" }); return; }
    const next: DrawnArea = { ...area, zones: [...(area.zones ?? []), ...zones] };
    if (kind === "urban") setUrban({ area: next }); else setVineyard({ area: next });
    hapticTick([20, 40, 20]);
    setNotice({
      text: `${zones.length} ${zones.length === 1 ? "oggetto riportato" : "oggetti riportati"} sulla mappa · ${alignment.how === "corners" ? "sono zone della simulazione, le trovi nella scheda Mappa" : "posizione dal GPS e dalla bussola: controllale nella scheda Mappa"}.${out ? ` ${out} fuori dall’area non riportat${out === 1 ? "o" : "i"}.` : ""}`,
      tone: "ok",
    });
    window.setTimeout(end, 2200);
  };
  useEffect(() => { if (alignPts.length === 2) setNotice({ text: "Area allineata: l’area disegnata ora è sul pavimento vero.", tone: "ok" }); }, [alignPts.length]);
  useEffect(() => { if (!notice || notice.tone === "ok") return; const t = window.setTimeout(() => setNotice(null), 5000); return () => window.clearTimeout(t); }, [notice]);

  const dist = measure.length === 2 ? arDistance(measure[0]!, measure[1]!) : null;
  const status = !found
    ? "Muovi piano il telefono verso il pavimento…"
    : tool === "align"
      ? alignPts.length === 0 ? "Tocca sul pavimento il punto 1 dell’area" : "Ora tocca il punto 2 dell’area"
      : tool === "measure"
        ? dist !== null ? `Distanza ${metresText(dist)}` : measure.length === 1 ? "Tocca il secondo punto" : "Tocca il primo punto da misurare"
        : `Tocca il pavimento per mettere: ${defOf(selected).label}`;

  const dragHorizon = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = canvasHost.current;
    if (!host || (e.type === "pointermove" && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    const r = host.getBoundingClientRect();
    const ny = Math.max(0.05, Math.min(0.9, (e.clientY - r.top) / r.height));
    const fl = floorRef.current;
    fl.offset = pitchForHorizon(ny, 70) - fl.tilt;
  };
  const finishAdjust = () => {
    setAdjusting(false);
    saveFloorOffset(floorRef.current.offset);
    setNotice({ text: "Pavimento regolato: tocca dove vuoi mettere gli oggetti.", tone: "ok" });
    window.setTimeout(() => setNotice((n) => (n?.text.startsWith("Pavimento") ? null : n)), 2200);
  };

  const pill = "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold";
  return (
    <>
    {!session && <div ref={canvasHost} className="fixed inset-0 z-40 bg-black">{stream && <video ref={videoRef} muted playsInline autoPlay className="absolute inset-0 size-full object-cover" />}</div>}
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
    <div ref={hudRef} className="ar-live-hud pointer-events-none fixed inset-0 z-50 flex flex-col justify-between text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="pointer-events-auto flex items-center gap-2 p-3">
        <button type="button" onClick={end} aria-label="Esci dalla realtà aumentata" className="grid size-11 place-items-center rounded-full bg-black/55 backdrop-blur"><X className="size-5" /></button>
        <p role="status" className="flex-1 truncate rounded-full bg-black/55 px-4 py-2.5 text-sm font-semibold backdrop-blur">
          <span className={`mr-2 inline-block size-2 rounded-full ${found ? "bg-[#22c55e]" : "animate-pulse bg-[#facc15]"}`} aria-hidden="true" />{status}
        </p>
      </div>
      <div className="pointer-events-none space-y-2 p-3 [&>*]:pointer-events-auto">
        {notice && <p role="alert" className={`mx-auto max-w-sm rounded-2xl px-4 py-2.5 text-center text-sm font-semibold shadow-lg ${notice.tone === "ok" ? "bg-[#22c55e] text-black" : "bg-[#facc15] text-black"}`}>{notice.text}</p>}
        {!session && adjusting && <p className="mx-auto max-w-sm rounded-2xl bg-black/70 px-4 py-2.5 text-center text-sm backdrop-blur">Trascina la linea azzurra dove il pavimento incontra il fondo (la base dei muri, l’orizzonte). Così gli oggetti poggiano a terra.</p>}
        {!session && (
          <div className="flex items-center justify-center gap-2">
            <p className="w-fit rounded-full bg-[#facc15]/90 px-3 py-1 text-xs font-bold text-black">Anteprima: senza ARCore le misure sono indicative</p>
            {adjusting
              ? <button type="button" onClick={finishAdjust} className="h-8 rounded-full bg-white px-3 text-xs font-bold text-black">Fatto</button>
              : <button type="button" onClick={() => setAdjusting(true)} className="inline-flex h-8 items-center gap-1 rounded-full bg-black/55 px-3 text-xs font-semibold backdrop-blur"><MoveVertical className="size-3.5" aria-hidden="true" />Regola pavimento</button>}
          </div>
        )}
        {alignment && <p className="mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-xs backdrop-blur">{alignment.how === "corners" ? "Area allineata sul pavimento" : "Allineata col GPS e la bussola · tocca Allinea per precisione"}</p>}
        <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Oggetto da mettere">
          {choices.map(({ key, def: o }) => (
            <button key={key} type="button" role="radio" aria-checked={tool === "place" && selected === key} onClick={() => { setSelected(key); setTool("place"); }}
              aria-label={o.plant ? `${o.label}, riconosciuto: ${o.plant.scientificName}, alto circa ${Math.round(o.h)} m` : undefined}
              className={`${pill} shrink-0 ${tool === "place" && selected === key ? "bg-[#00e5ff] text-black" : o.plant ? "bg-[#14532d]/80 ring-1 ring-[#4ade80]/60 backdrop-blur" : "bg-black/55 backdrop-blur"}`}>
              {o.plant && <Leaf className="size-4" aria-hidden="true" />}{o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {area && <button type="button" onClick={() => { setTool("align"); setAlignPts([]); }} aria-pressed={tool === "align"} className={`${pill} ${tool === "align" ? "bg-white text-black" : "bg-black/55 backdrop-blur"}`}><Crosshair className="size-4" />Allinea</button>}
          <button type="button" onClick={() => { setTool(tool === "measure" ? "place" : "measure"); setMeasure([]); }} aria-pressed={tool === "measure"} className={`${pill} ${tool === "measure" ? "bg-white text-black" : "bg-black/55 backdrop-blur"}`}><Ruler className="size-4" />Misura</button>
          <button type="button" onClick={undo} disabled={!placed.length} className={`${pill} bg-black/55 backdrop-blur disabled:opacity-40`}><Undo2 className="size-4" />Annulla</button>
          <button type="button" onClick={backToMap} disabled={!placed.length} className={`${pill} bg-white text-black disabled:opacity-40`}>{placed.length ? <MapPinned className="size-4" /> : <Check className="size-4" />}Riporta sulla mappa{placed.length ? ` · ${placed.length}` : ""}</button>
        </div>
      </div>
    </div>
    </>
  );
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

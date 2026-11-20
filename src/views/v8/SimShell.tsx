import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Map as MapIcon, MapPin, EllipsisVertical, Radar, Scale, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useTabSwipe } from "@/lib/use-tab-swipe";
import { useAutoHistory } from "@/lib/use-auto-history";
import { SimMap } from "@/views/v10/SimMap";
import { useSideBySide } from "@/lib/use-desktop";
import { Ambient, HeroButton, PageHero, Panels, TabRow, openSimTab, showSimMedia, startOnMap, simMediaId, useSimTab, type SimKind, type SimTab } from "./console";

const loadMenu = () => import("@/views/v8/SimMenu");
const SimMenu = lazy(loadMenu);
const MENU_BUTTON = "grid size-11 place-items-center rounded-full bg-foreground/10 text-foreground outline-none backdrop-blur transition-colors hover:bg-foreground/[0.16] focus-visible:ring-2 focus-visible:ring-ring";

const TABS: ReadonlyArray<{ id: SimTab; label: string; icon: LucideIcon }> = [
  { id: "mappa", label: "Mappa", icon: MapIcon },
  { id: "simula", label: "Simula", icon: SlidersHorizontal },
  { id: "sensori", label: "Sensori AI", icon: Radar },
];
// Desktop: the map and the simulation side by side in one tab.
const DESK_TABS: ReadonlyArray<{ id: SimTab; label: string; icon: LucideIcon }> = [
  { id: "mappa", label: "Mappa e simulazione", icon: MapIcon },
  { id: "sensori", label: "Sensori AI", icon: Radar },
];
const TONE: Record<SimKind, string> = { urban: "rgb(28 112 210 / 0.42)", vineyard: "rgb(150 36 110 / 0.42)" };

/**
 * The sticky tabs leave room while scrolling down, once half the map has gone up past them (more of the map preview and the simulation on screen) and come back
 * on scrolling up or near the top of the page, like the bottom bar; the sticky readings under them move up with them
 * through --sim-tabs-shift on the page (a transform, like the bar).
 */
function useHideOnScroll(bar: RefObject<HTMLDivElement | null>, root: RefObject<HTMLDivElement | null>) {
  // The bar follows the scroll the other way round (as asked): past half the map, scrolling up (back towards the top)
  // lifts it out of the screen by as much as the page moved, scrolling down lowers it back the same way (no jump, no fade). Straight
  // on the DOM, once per frame, with no React state.
  useEffect(() => {
    let lastY = window.scrollY, off = 0, frame = 0;
    const apply = () => {
      frame = 0;
      const el = bar.current;
      if (!el) return;
      const h = el.offsetHeight + (parseFloat(getComputedStyle(el).top) || 0) + 8;
      el.style.transform = off ? `translate3d(0, ${-off.toFixed(1)}px, 0)` : "";
      if (off >= h - 1) el.setAttribute("data-hidden", ""); else el.removeAttribute("data-hidden");
      root.current?.style.setProperty("--sim-tabs-shift", `${(-Math.min(off, h) * 0.8).toFixed(1)}px`);
    };
    const onScroll = () => {
      const y = window.scrollY, dy = y - lastY;
      lastY = y;
      const el = bar.current;
      if (!el) return;
      const stickyTop = parseFloat(getComputedStyle(el).top) || 0, h = el.offsetHeight + stickyTop + 8;
      // Where the bar would be without its own shift: it moves only once it is stuck at the top of the screen; before
      // that (the page near its top, the bar still in the flow under the title) it stays where it is, never over the
      // title nor leaving a gap under it.
      const r = el.getBoundingClientRect(), naturalTop = r.top + off, stuck = naturalTop <= stickyTop + 1;
      let next = off;
      if (!stuck || y <= 0) next = 0;
      else if (dy < 0) {
        // The bar stays until half the map (or the map preview) has gone up past it.
        const map = [...document.querySelectorAll("[data-sim-map-box]")].map((e) => e.getBoundingClientRect()).find((b) => b.height > 0);
        const pastHalf = map ? map.top + map.height / 2 < r.bottom + off : y > 160;
        if (pastHalf) next = Math.min(h, off - dy);
      } else next = Math.max(0, off - dy);
      if (next === off) return;
      off = next;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", onScroll); };
  }, [bar, root]);
}

/**
 * v8 simulator page: ambient light, the place (touch to change it) above a big thin title, Confronta and
 * the ⋮ context menu on the right, then pill tabs (Mappa · Simula · Sensori AI) and one panel.
 * Simula shows the simulation with its photos and videos below it.
 */
export function SimShell({ kind, place, onCompare, onReset, onSend, simula, media, sensori }: { kind: SimKind; place: string; onCompare?: (() => void) | undefined; onReset: () => void; onSend?: () => void; simula: ReactNode; media: ReactNode; sensori: ReactNode }) {
  const tab = useSimTab(kind);
  // Desktop: Mappa and Simula are one tab with the map on the left (kept in view) and the simulation on the right.
  const desk = useSideBySide();
  // Entering the page always starts on Mappa (unless a tab was asked for on the way in).
  useLayoutEffect(() => startOnMap(kind), [kind]);
  const go = (t: SimTab) => openSimTab(kind, t);
  // The place's name in the small line above the title (Piazza / Vigneto); a position from the GPS reads its street or
  // town instead of "La mia posizione".
  const parts = place.split(" · ").map((x) => x.trim()).filter(Boolean);
  const own = parts[0]?.startsWith("La mia posizione") && parts.length > 1 ? parts.slice(1) : parts;
  const title = own[0] ?? place;
  const barRef = useRef<HTMLDivElement>(null), rootRef = useRef<HTMLDivElement>(null);
  useHideOnScroll(barRef, rootRef);
  // The place is shown and changed in the Mappa tab.
  const toMap = () => go("mappa");
  // A sideways swipe drags the panel with the finger and turns to the neighbouring tab, like the tutorial's slides; sliders, maps and rows that scroll sideways keep their own moves.
  useAutoHistory(kind);
  const swipe = useTabSwipe(TABS.map((t) => t.id), tab, go);
  const [menu, setMenu] = useState<"none" | "idle" | "open">("none");
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const go2 = () => { void loadMenu().then(() => setMenu((m) => (m === "none" ? "idle" : m))); };
    const id = idle ? idle(go2, { timeout: 4000 }) : window.setTimeout(go2, 2500);
    return () => { if (!idle) window.clearTimeout(id); };
  }, []);
  return (
    <div ref={rootRef} className="space-y-4">
      <Ambient tone={TONE[kind]} />
      <PageHero kicker={title} kickerIcon={MapPin} onKicker={toMap} title={kind === "urban" ? "Piazza" : "Vigneto"}
        actions={<>
          {onCompare && <HeroButton icon={Scale} label="Confronta" onClick={onCompare} showLabel />}
          {/* The ⋮ menu's code comes on the first tap (it then opens at once) or when the page is idle. */}
          {menu === "none"
            ? <button type="button" aria-label="Altre azioni" aria-haspopup="menu" className={MENU_BUTTON} onClick={() => setMenu("open")}><EllipsisVertical className="size-6" aria-hidden="true" /></button>
            : <Suspense fallback={<span className={MENU_BUTTON} aria-hidden="true"><EllipsisVertical className="size-6" /></span>}>
                <SimMenu open={menu === "open"} onCamera={() => setCameraSheetOpen(true)} onMedia={() => showSimMedia(kind)} onSensors={() => go("sensori")} onMap={toMap} onSend={onSend} onReset={onReset} />
              </Suspense>}
        </>} />
      <div ref={barRef} data-sim-tabs="" className="sticky top-[var(--nav-h)] z-[999999997] -mx-4 bg-transparent px-4 py-2 md:mx-[calc(50%-50vw+2.5rem)] md:px-[calc(50vw-2.5rem-50%)] lg:mx-[calc(50%-50vw+7.5rem)] lg:px-[calc(50vw-7.5rem-50%)] backdrop-blur-xl will-change-transform data-[hidden]:pointer-events-none">
        <TabRow label="Sezioni" items={desk ? DESK_TABS : TABS} value={desk && tab === "simula" ? "mappa" : tab} onChange={go} />
      </div>
      {/* The open tab follows the finger and the next slides in once it turns; nothing peeks beside it. */}
      <div ref={swipe.ref} style={swipe.style} className="relative">
      {desk ? <Panels value={tab === "sensori" ? "sensori" : "mappa"} panels={[
        { id: "mappa", always: true, content: (
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-6">
            <div className="no-scrollbar sticky top-[calc(var(--nav-h)+4.5rem)] max-h-[calc(100vh-var(--nav-h)-5.5rem)] overflow-y-auto overscroll-contain rounded-3xl"><SimMap kind={kind} /></div>
            <div className="min-w-0 space-y-6">{simula}<section id={simMediaId(kind)} aria-label="Foto e video" className="fuse-canvas scroll-mt-[calc(var(--nav-h)+5rem)] rounded-t-3xl px-5 pt-4 pb-6">{media}</section></div>
          </div>) },
        { id: "sensori", content: sensori },
      ]} /> : <Panels value={tab} panels={[
        // In the tabs' order (Mappa · Simula · Sensori AI), so a later tab enters from the right.
        { id: "mappa", content: <SimMap kind={kind} /> },
        // Simula carries the photos and videos under the simulation, so it stays mounted: the camera dock reaches LabMedia from any tab.
        { id: "simula", always: true, content: <div className="space-y-6">{tab === "simula" && <SimMap kind={kind} preview />}{simula}<section id={simMediaId(kind)} aria-label="Foto e video" className="fuse-canvas scroll-mt-[calc(var(--nav-h)+5rem)] rounded-t-3xl px-3 pt-4 pb-6 sm:px-5">{media}</section></div> },
        { id: "sensori", content: sensori },
      ]} />}
      </div>
    </div>
  );
}

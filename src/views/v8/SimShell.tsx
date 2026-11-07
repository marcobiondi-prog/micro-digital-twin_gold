import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { Camera, Images, Map as MapIcon, MapPin, EllipsisVertical, Radar, RotateCcw, Scale, Send, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { setCameraSheetOpen } from "@/lib/camera-dock";
import { useTabSwipe } from "@/lib/use-tab-swipe";
import { useAutoHistory } from "@/lib/use-auto-history";
import { SimMap } from "@/views/v10/SimMap";
import { Ambient, HeroButton, PageHero, Panels, TabRow, openSimTab, showSimMedia, startOnMap, simMediaId, useSimTab, type SimKind, type SimTab } from "./console";

const TABS: ReadonlyArray<{ id: SimTab; label: string; icon: LucideIcon }> = [
  { id: "mappa", label: "Mappa", icon: MapIcon },
  { id: "simula", label: "Simula", icon: SlidersHorizontal },
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

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect} className="min-h-12 gap-3 rounded-xl px-3 text-[15px] font-medium focus:bg-accent focus:text-accent-foreground"><Icon className="size-5 text-muted-foreground" aria-hidden="true" />{label}</DropdownMenuItem>;
}

/**
 * v8 simulator page: ambient light, the place (touch to change it) above a big thin title, Confronta and
 * the ⋮ context menu on the right, then pill tabs (Mappa · Simula · Sensori AI) and one panel.
 * Simula shows the simulation with its photos and videos below it.
 */
export function SimShell({ kind, place, onCompare, onReset, onSend, simula, media, sensori }: { kind: SimKind; place: string; onCompare?: (() => void) | undefined; onReset: () => void; onSend?: () => void; simula: ReactNode; media: ReactNode; sensori: ReactNode }) {
  const tab = useSimTab(kind);
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
  return (
    <div ref={rootRef} className="space-y-4">
      <Ambient tone={TONE[kind]} />
      <PageHero kicker={title} kickerIcon={MapPin} onKicker={toMap} title={kind === "urban" ? "Piazza" : "Vigneto"}
        actions={<>
          {onCompare && <HeroButton icon={Scale} label="Confronta" onClick={onCompare} showLabel />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="Altre azioni" className="grid size-11 place-items-center rounded-full bg-foreground/10 text-foreground outline-none backdrop-blur transition-colors hover:bg-foreground/[0.16] focus-visible:ring-2 focus-visible:ring-ring"><EllipsisVertical className="size-6" aria-hidden="true" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="z-[999999999] w-64 rounded-2xl p-1.5 shadow-2xl">
              <Item icon={Camera} label="Fotocamera" onSelect={() => setCameraSheetOpen(true)} />
              <Item icon={Images} label="Foto e video salvati" onSelect={() => showSimMedia(kind)} />
              <Item icon={Radar} label="Dove mettere i sensori" onSelect={() => go("sensori")} />
              <Item icon={MapPin} label="Cambia luogo" onSelect={toMap} />
              <DropdownMenuSeparator />
              {onSend && <Item icon={Send} label="Invia all’agronomo" onSelect={onSend} />}
              <Item icon={RotateCcw} label="Ricomincia" onSelect={onReset} />
            </DropdownMenuContent>
          </DropdownMenu>
        </>} />
      <div ref={barRef} data-sim-tabs="" className="sticky top-[var(--nav-h)] z-[999999997] -mx-4 bg-transparent px-4 py-2 backdrop-blur-xl will-change-transform data-[hidden]:pointer-events-none">
        <TabRow label="Sezioni" items={TABS} value={tab} onChange={go} />
      </div>
      {/* The open tab follows the finger and the next slides in once it turns; nothing peeks beside it. */}
      <div ref={swipe.ref} style={swipe.style} className="relative">
      <Panels value={tab} panels={[
        // In the tabs' order (Mappa · Simula · Sensori AI), so a later tab enters from the right.
        { id: "mappa", content: <SimMap kind={kind} /> },
        // Simula carries the photos and videos under the simulation, so it stays mounted: the camera dock reaches LabMedia from any tab.
        { id: "simula", always: true, content: <div className="space-y-6">{tab === "simula" && <SimMap kind={kind} preview />}{simula}<section id={simMediaId(kind)} aria-label="Foto e video" className="fuse-canvas scroll-mt-[calc(var(--nav-h)+5rem)] rounded-t-3xl px-3 pt-4 pb-6 sm:px-5">{media}</section></div> },
        { id: "sensori", content: sensori },
      ]} />
      </div>
    </div>
  );
}

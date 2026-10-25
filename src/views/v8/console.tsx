import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_CHANGED, THEME_DARK, THEME_META } from "@/views/theme-toggle";

/**
 * v8 "Console": the PlayStation-app design language shared by every page.
 * A page is an ambient glow, a hero (small kicker, big thin title, actions on the right),
 * a row of pill tabs, and one panel at a time below it.
 */

export type SimKind = "urban" | "vineyard";
export type SimTab = "simula" | "sensori";

// Which place the Mappa page shows when it opens: the simulator that sent there sets it ("Cambia luogo", the place name).
let mapPlace: SimKind = "urban";
export const setMapPlace = (kind: SimKind) => { mapPlace = kind; };
export const getMapPlace = () => mapPlace;

// The open tab of each simulator lives at module level, so the ⋯ menu and the camera can switch it.
const tabs: Record<SimKind, SimTab> = { urban: "simula", vineyard: "simula" };
const listeners = new Set<() => void>();
export function openSimTab(kind: SimKind, tab: SimTab) {
  if (tabs[kind] === tab) return;
  tabs[kind] = tab;
  listeners.forEach((l) => l());
}
/** Id of the photo and video block under a simulator, which the camera and the ⋮ menu bring into view. */
export const simMediaId = (kind: SimKind) => `sim-media-${kind}`;
/** Opens Simula and scrolls to its photos and videos, once the panel shows and the closing menu or sheet has handed focus back. */
export function showSimMedia(kind: SimKind) {
  openSimTab(kind, "simula");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.setTimeout(() => document.getElementById(simMediaId(kind))?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }), 250);
}
export function useSimTab(kind: SimKind): SimTab {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => tabs[kind], () => "simula");
}

/** Soft coloured light behind the top of the page, like the art behind the PS5 home. The transparent header
 * repaints it on its own solid background, and the phone status bar takes the same tint (the light blended on the page colour). */
export function Ambient({ tone }: { tone: string }) {
  useEffect(() => {
    const meta = () => document.querySelector<HTMLMetaElement>(THEME_META);
    const paint = () => {
      const m = meta(), g = document.createElement("canvas").getContext("2d");
      if (!m || !g) return;
      g.fillStyle = getComputedStyle(document.body).backgroundColor; g.fillRect(0, 0, 1, 1);
      // The glow reaches the top edge at about 70% of its strength (the ellipse is centred above the screen).
      g.globalAlpha = 0.72; g.fillStyle = tone; g.fillRect(0, 0, 1, 1);
      const [r = 0, gr = 0, b = 0] = g.getImageData(0, 0, 1, 1).data;
      m.content = `rgb(${r} ${gr} ${b})`;
    };
    paint();
    // The header paints the same light on its own opaque background (styles.css .app-header-tint).
    document.documentElement.style.setProperty("--ambient-tone", tone);
    // The page colour fades for 0.2 s after a theme switch: read it once it has settled.
    let timer = 0;
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(paint, 260); };
    window.addEventListener(THEME_CHANGED, later);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(THEME_CHANGED, later);
      document.documentElement.style.removeProperty("--ambient-tone");
      meta()?.setAttribute("content", document.documentElement.classList.contains("dark") ? THEME_DARK : "#ffffff");
    };
  }, [tone]);
  return <div className="console-ambient pointer-events-none fixed inset-x-0 top-0 -z-10 h-[48vh] transition-[background] duration-700 motion-reduce:transition-none" style={{ background: `radial-gradient(130% 85% at 50% -15%, ${tone}, transparent 72%)` }} aria-hidden="true" />;
}

export function PageHero({ kicker, kickerIcon: KIcon, onKicker, title, actions }: { kicker?: string; kickerIcon?: LucideIcon; onKicker?: () => void; title: string; actions?: ReactNode }) {
  const k = kicker && (
    <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
      {KIcon && <KIcon className="size-4 shrink-0" aria-hidden="true" />}<span className="truncate">{kicker}</span>
    </span>
  );
  return (
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        {k && (onKicker ? <button type="button" onClick={onKicker} className="-mx-1 max-w-full rounded-md px-1 py-0.5 text-left outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring">{k}</button> : k)}
        <h1 className="mt-0.5 truncate font-display text-4xl font-light tracking-tight text-foreground sm:text-5xl">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div>}
    </div>
  );
}

/** Round slate icon button of the hero. */
export function HeroButton({ icon: Icon, label, onClick, showLabel }: { icon: LucideIcon; label: string; onClick?: () => void; showLabel?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={showLabel ? undefined : label} title={label}
      className={cn("inline-flex h-11 items-center justify-center gap-2 rounded-full bg-foreground/10 text-foreground outline-none backdrop-blur transition-colors hover:bg-foreground/[0.16] focus-visible:ring-2 focus-visible:ring-ring", showLabel ? "px-4 text-sm font-semibold" : "w-11")}>
      <Icon className="size-5" aria-hidden="true" />{showLabel && label}
    </button>
  );
}

/** PS pill tabs ("PS Blog | Official News"): the open one on a slate pill, the others plain white; one swipeable row. */
export function TabRow<T extends string>({ items, value, onChange, label }: { items: ReadonlyArray<{ id: T; label: string; icon?: LucideIcon }>; value: T; onChange: (v: T) => void; label: string }) {
  const active = useRef<HTMLButtonElement>(null);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Centre the open pill by scrolling the row only (scrollIntoView would also move the page).
    const r = row.current, a = active.current;
    if (!r || !a) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    r.scrollTo({ left: a.offsetLeft - (r.clientWidth - a.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }, [value]);
  return (
    <div ref={row} role="tablist" aria-label={label} className="no-scrollbar relative -mx-4 flex snap-x gap-1.5 overflow-x-auto px-4 touch-pan-x">
      {items.map(({ id, label: l, icon: Icon }) => {
        const on = id === value;
        return (
          <button key={id} ref={on ? active : undefined} type="button" role="tab" aria-selected={on} onClick={() => onChange(id)}
            className={cn("inline-flex h-11 shrink-0 snap-center items-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              on ? "bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]" : "text-foreground/85 hover:bg-foreground/[0.06]")}>
            {Icon && <Icon className="size-4" aria-hidden="true" />}{l}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One panel at a time. A panel mounts the first time it is opened and then stays mounted (hidden when
 * closed), so maps keep their size and cameras keep their state; `always` panels mount from the start.
 */
export function Panels<T extends string>({ value, panels }: { value: T; panels: ReadonlyArray<{ id: T; always?: boolean; content: ReactNode }> }) {
  const [seen, setSeen] = useState<ReadonlySet<T>>(() => new Set([value]));
  useEffect(() => { setSeen((s) => (s.has(value) ? s : new Set([...s, value]))); }, [value]);
  return (
    <>
      {panels.map((p) => (p.always || seen.has(p.id) || p.id === value) && (
        <div key={p.id} role="tabpanel" hidden={p.id !== value} className="animate-in fade-in-0 duration-300 motion-reduce:animate-none">{p.content}</div>
      ))}
    </>
  );
}

/** Flat slate surface for content blocks. */
export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl bg-card/90 p-4 ring-1 ring-foreground/[0.05] backdrop-blur sm:p-5", className)}>{children}</section>;
}

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { hapticTick } from "@/lib/haptics";
import { simTabSwipeStep, startsOnOwnGesture } from "@/lib/sim-tab-swipe";

/** The tutorial's settle: the same curve and length as the screens of the index. */
export const SLIDE_EASE = "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)";
/** Space between the open panel and the next one sliding in beside it. */
export const PEEK_GAP = 16;

/** When a swipe last turned the tab: that panel already slides in with the finger, so Panels skips its own entrance. */
let swipedAt = 0;
export const justSwiped = () => Date.now() - swipedAt < 150;
/**
 * A sub-tab row (scoped swipe) that can turn in the swipe's direction claims the gesture, so the page's tabs stay
 * put; at its first or last sub-tab it lets go and the page's tabs move instead. Its listeners sit on its own
 * element, so they run before the page's document listeners for the same event.
 */
let claimed = false;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export type TabSwipe<T extends string> = {
  /** The track: the open panel, and the next one beside it while dragging. */
  ref: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  /** The tab coming in while the finger drags, shown beside the open one (null at rest). */
  peek: T | null;
  /** Which side it comes from: 1 on the right (next tab), −1 on the left. */
  peekSide: 1 | -1;
  /** How far down the track the peeking panel sits, so its top shows just under the tabs even when the page is scrolled. */
  peekTop: number;
};

/** Where the visible part of the track starts: under its tab row (sticky or not) or under the pinned header. */
function visibleTop(track: HTMLElement): number {
  const bar = track.parentElement?.querySelector('[role="tablist"]');
  const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;
  return Math.max(nav, (bar?.getBoundingClientRect().bottom ?? 0) + 12);
}

/**
 * Tabs that slide like the tutorial's screens. A sideways swipe (finger, or mouse drag on desktop) anywhere on the
 * page drags the open panel with the finger, with the next tab's panel coming in beside it (only a little give past
 * the first and the last tab); past 50 px it turns to that tab, which settles where the finger left it; shorter, it
 * springs back. A mostly vertical move scrolls the page and drags nothing. No transform at rest, so fixed elements
 * inside keep their place. With `scope` (sub-tabs) only swipes starting inside that element count, and they take
 * the gesture from the page's tabs while they can turn.
 */
export function useTabSwipe<T extends string>(ids: ReadonlyArray<T>, value: T, onChange: (id: T) => void, scope?: RefObject<HTMLElement | null>): TabSwipe<T> {
  const start = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const [slide, setSlide] = useState<{ x: number; animate: boolean; peek: T | null; side: 1 | -1; top: number }>({ x: 0, animate: false, peek: null, side: 1, top: 0 });
  const latest = useRef({ ids, value, onChange });
  latest.current = { ids, value, onChange };
  useEffect(() => {
    // Sub-tabs listen on their own element, the page's tabs on the document (same events, typed as an element's).
    const host = (scope ? scope.current : document) as HTMLElement | null;
    if (!host) return;
    let frame = 0, rest = 0, dragged = 0, top = 0;
    const stop = () => { cancelAnimationFrame(frame); clearTimeout(rest); };
    const settle = (from: number) => {
      stop();
      dragged = 0;
      if (from === 0 || reduced()) { setSlide({ x: 0, animate: false, peek: null, side: 1, top: 0 }); return; }
      setSlide({ x: from, animate: false, peek: null, side: 1, top: 0 });
      // Two frames: the browser paints the start before the transition to rest begins; then the transform goes away.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        setSlide({ x: 0, animate: true, peek: null, side: 1, top: 0 });
        rest = window.setTimeout(() => setSlide({ x: 0, animate: false, peek: null, side: 1, top: 0 }), 420);
      }); });
    };
    const begin = (x: number, y: number, target: EventTarget | null) => {
      claimed = false;
      start.current = document.documentElement.hasAttribute("data-ar-camera") || startsOnOwnGesture(target, scope?.current ?? document.body) ? null : { x, y, axis: null };
    };
    const move = (x: number, y: number) => {
      const s = start.current;
      if (!s) return;
      const dx = x - s.x, dy = y - s.y;
      const { ids: list, value: cur } = latest.current;
      const i = list.indexOf(cur);
      const edge = (dx > 0 && i <= 0) || (dx < 0 && i >= list.length - 1);
      if (!scope && claimed) { if (s.axis === "x") settle(dragged); start.current = null; return; }
      if (!s.axis) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s.axis = "y"; return; }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          // Sub-tabs at their end in this direction let the page's tabs have the swipe.
          if (scope && edge) { start.current = null; return; }
          s.axis = "x";
          if (scope) claimed = true;
          const t = track.current;
          top = t ? Math.max(0, visibleTop(t) - t.getBoundingClientRect().top) : 0;
        }
      }
      if (s.axis !== "x") return;
      stop();
      dragged = edge ? dx * 0.25 : dx;
      const side: 1 | -1 = dx < 0 ? 1 : -1;
      setSlide({ x: dragged, animate: false, peek: edge ? null : (list[i + side] ?? null), side, top });
    };
    const finish = (x: number, y: number) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = x - s.x, dy = y - s.y;
      const { ids: list, value: cur, onChange: set } = latest.current;
      const i = list.indexOf(cur), next = s.axis === "y" ? i : simTabSwipeStep(i, list.length, dx, dy), to = list[next];
      if (i >= 0 && to !== undefined && next !== i) {
        hapticTick();
        swipedAt = Date.now();
        set(to);
        // The page scrolls so the new panel's top sits where its peek was showing, then it settles from where the finger left it.
        if (top > 0) window.scrollBy({ top: -top, behavior: "instant" as ScrollBehavior });
        const w = (track.current?.offsetWidth ?? window.innerWidth) + PEEK_GAP;
        settle(next > i ? w + Math.min(0, dx) : -w + Math.max(0, dx));
      } else if (s.axis === "x") settle(dragged); // too short: spring back
    };
    const cancel = () => { if (start.current?.axis === "x") settle(dragged); start.current = null; };
    const ts = (e: TouchEvent) => { const t = e.touches[0]; if (t && e.touches.length === 1) begin(t.clientX, t.clientY, e.target); else cancel(); };
    const tm = (e: TouchEvent) => { const t = e.touches[0]; if (t && e.touches.length === 1) move(t.clientX, t.clientY); };
    const te = (e: TouchEvent) => { const t = e.changedTouches[0]; if (t) finish(t.clientX, t.clientY); else cancel(); };
    const pd = (e: PointerEvent) => { if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY, e.target); };
    const pm = (e: PointerEvent) => { if (e.pointerType === "mouse" && e.buttons & 1) move(e.clientX, e.clientY); };
    const pu = (e: PointerEvent) => { if (e.pointerType === "mouse") finish(e.clientX, e.clientY); };
    host.addEventListener("touchstart", ts, { passive: true });
    host.addEventListener("touchmove", tm, { passive: true });
    host.addEventListener("touchend", te, { passive: true });
    host.addEventListener("touchcancel", cancel, { passive: true });
    host.addEventListener("pointerdown", pd);
    host.addEventListener("pointermove", pm);
    host.addEventListener("pointerup", pu);
    return () => {
      stop();
      host.removeEventListener("touchstart", ts);
      host.removeEventListener("touchmove", tm);
      host.removeEventListener("touchend", te);
      host.removeEventListener("touchcancel", cancel);
      host.removeEventListener("pointerdown", pd);
      host.removeEventListener("pointermove", pm);
      host.removeEventListener("pointerup", pu);
    };
  }, []);
  const style: CSSProperties = slide.x === 0 && !slide.animate ? {}
    : { transform: slide.x === 0 ? "translateX(0)" : `translateX(${slide.x}px)`, transition: slide.animate ? SLIDE_EASE : "none", willChange: "transform" };
  return { ref: track, style, peek: slide.peek, peekSide: slide.side, peekTop: slide.top };
}

/** Style for the panel peeking beside the open one: placed one track width (plus the gap) to its side, under the tabs. */
export const peekStyle = (side: 1 | -1, top: number): CSSProperties => ({
  position: "absolute", left: 0, right: 0, top, pointerEvents: "none",
  transform: `translateX(calc(${side * 100}% + ${side * PEEK_GAP}px))`,
});

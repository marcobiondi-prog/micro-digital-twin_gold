import { useEffect, useRef, useState, type CSSProperties } from "react";
import { hapticTick } from "@/lib/haptics";
import { simTabSwipeStep, startsOnOwnGesture } from "@/lib/sim-tab-swipe";

/** The tutorial's settle: the same curve and length as the screens of the index. */
export const SLIDE_EASE = "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)";
/** When a swipe last turned the tab: that panel already slides in with the finger, so Panels skips its own entrance. */
let swipedAt = 0;
export const justSwiped = () => Date.now() - swipedAt < 150;
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Tabs that slide like the tutorial's screens. A sideways swipe (finger, or mouse drag on desktop) anywhere on the
 * page drags the open panel with the finger (only a little past the first and the last tab); past 50 px it turns
 * to the neighbouring tab, whose panel comes in from that side where the finger left it and settles; shorter, it
 * springs back. A mostly vertical move scrolls the page and drags nothing. Returns the style for the panels' track:
 * no transform at rest, so fixed elements inside keep their place.
 */
export function useTabSwipe<T extends string>(ids: ReadonlyArray<T>, value: T, onChange: (id: T) => void): CSSProperties {
  const start = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const [slide, setSlide] = useState<{ x: number; animate: boolean }>({ x: 0, animate: false });
  const latest = useRef({ ids, value, onChange });
  latest.current = { ids, value, onChange };
  useEffect(() => {
    let frame = 0, rest = 0, dragged = 0;
    const stop = () => { cancelAnimationFrame(frame); clearTimeout(rest); };
    const settle = (from: number) => {
      stop();
      dragged = 0;
      if (from === 0 || reduced()) { setSlide({ x: 0, animate: false }); return; }
      setSlide({ x: from, animate: false });
      // Two frames: the browser paints the start before the transition to rest begins; then the transform goes away.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        setSlide({ x: 0, animate: true });
        rest = window.setTimeout(() => setSlide({ x: 0, animate: false }), 420);
      }); });
    };
    const begin = (x: number, y: number, target: EventTarget | null) => {
      start.current = document.documentElement.hasAttribute("data-ar-camera") || startsOnOwnGesture(target, document.body) ? null : { x, y, axis: null };
    };
    const move = (x: number, y: number) => {
      const s = start.current;
      if (!s) return;
      const dx = x - s.x, dy = y - s.y;
      if (!s.axis) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s.axis = "y"; return; }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) s.axis = "x";
      }
      if (s.axis !== "x") return;
      const { ids: list, value: cur } = latest.current;
      const i = list.indexOf(cur);
      const edge = (dx > 0 && i <= 0) || (dx < 0 && i >= list.length - 1);
      stop();
      dragged = edge ? dx * 0.25 : dx;
      setSlide({ x: dragged, animate: false });
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
        // The new panel enters from the side the finger moved away from, where the old one's edge was.
        const w = window.innerWidth;
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
    document.addEventListener("touchstart", ts, { passive: true });
    document.addEventListener("touchmove", tm, { passive: true });
    document.addEventListener("touchend", te, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    document.addEventListener("pointerdown", pd);
    document.addEventListener("pointermove", pm);
    document.addEventListener("pointerup", pu);
    return () => {
      stop();
      document.removeEventListener("touchstart", ts);
      document.removeEventListener("touchmove", tm);
      document.removeEventListener("touchend", te);
      document.removeEventListener("touchcancel", cancel);
      document.removeEventListener("pointerdown", pd);
      document.removeEventListener("pointermove", pm);
      document.removeEventListener("pointerup", pu);
    };
  }, []);
  if (slide.x === 0 && !slide.animate) return {};
  return { transform: slide.x === 0 ? "translateX(0)" : `translateX(${slide.x}px)`, transition: slide.animate ? SLIDE_EASE : "none", willChange: "transform" };
}

import { useEffect, type RefObject } from "react";
import { hapticTick } from "@/lib/haptics";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * A swipe to the right goes back (the forms' "Indietro"): the page follows the finger sideways once the move is
 * clearly sideways (8 px, more across than down), and past 70 px — or a quick flick — it calls onBack; shorter it
 * springs back. Vertical moves only scroll; sliders, maps and sideways rows ([data-map-gestures], range inputs) keep
 * their own moves. Still with reduced motion (only the back, no follow).
 */
export function useSwipeBack(ref: RefObject<HTMLElement | null>, onBack: (() => void) | null) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !onBack) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let start: { x: number; y: number; t: number } | null = null, axis: "x" | "y" | null = null, dx = 0;
    const place = (x: number, ms = 0) => {
      if (reduce) return;
      el.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
      el.style.transform = x ? `translate3d(${x}px,0,0)` : "";
    };
    const ts = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || !t) { start = null; return; }
      const target = e.target as Element | null;
      if (target?.closest("[data-map-gestures], input[type=range], [role=slider]")) { start = null; return; }
      start = { x: t.clientX, y: t.clientY, t: performance.now() }; axis = null; dx = 0;
    };
    const tm = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!start || !t) return;
      const mx = t.clientX - start.x, my = t.clientY - start.y;
      if (!axis) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        axis = Math.abs(mx) > Math.abs(my) * 1.2 && mx > 0 ? "x" : "y";
      }
      if (axis !== "x") return;
      dx = Math.max(0, mx);
      place(dx * 0.6);
    };
    const te = () => {
      if (!start) return;
      const fast = dx > 24 && dx / Math.max(1, performance.now() - start.t) > 0.5;
      if (axis === "x" && (dx > 70 || fast)) {
        hapticTick();
        place(0);
        onBack();
      } else if (axis === "x") place(0, 220);
      start = null; axis = null; dx = 0;
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: true });
    el.addEventListener("touchend", te, { passive: true });
    el.addEventListener("touchcancel", te, { passive: true });
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
      el.removeEventListener("touchcancel", te);
      el.style.transform = ""; el.style.transition = "";
    };
  }, [ref, onBack]);
}

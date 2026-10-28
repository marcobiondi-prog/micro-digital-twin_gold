import { useEffect, useRef } from "react";
import { hapticTick } from "@/lib/haptics";
import { simTabSwipeStep, startsOnOwnGesture } from "@/lib/sim-tab-swipe";

/** A sideways swipe (finger, or mouse drag on desktop) anywhere on the page moves to the neighbouring tab; the ends stay put. */
export function useTabSwipe<T extends string>(ids: ReadonlyArray<T>, value: T, onChange: (id: T) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const latest = useRef({ ids, value, onChange });
  latest.current = { ids, value, onChange };
  useEffect(() => {
    const begin = (x: number, y: number, target: EventTarget | null) => {
      start.current = document.documentElement.hasAttribute("data-ar-camera") || startsOnOwnGesture(target, document.body) ? null : { x, y };
    };
    const finish = (x: number, y: number) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const { ids: list, value: cur, onChange: set } = latest.current;
      const i = list.indexOf(cur), next = simTabSwipeStep(i, list.length, x - s.x, y - s.y), to = list[next];
      if (i >= 0 && to !== undefined && next !== i) { hapticTick(); set(to); }
    };
    const ts = (e: TouchEvent) => { const t = e.touches[0]; if (t && e.touches.length === 1) begin(t.clientX, t.clientY, e.target); else start.current = null; };
    const te = (e: TouchEvent) => { const t = e.changedTouches[0]; if (t) finish(t.clientX, t.clientY); else start.current = null; };
    const tc = () => { start.current = null; };
    const pd = (e: PointerEvent) => { if (e.pointerType === "mouse" && e.button === 0) begin(e.clientX, e.clientY, e.target); };
    const pu = (e: PointerEvent) => { if (e.pointerType === "mouse") finish(e.clientX, e.clientY); };
    document.addEventListener("touchstart", ts, { passive: true });
    document.addEventListener("touchend", te, { passive: true });
    document.addEventListener("touchcancel", tc, { passive: true });
    document.addEventListener("pointerdown", pd);
    document.addEventListener("pointerup", pu);
    return () => {
      document.removeEventListener("touchstart", ts);
      document.removeEventListener("touchend", te);
      document.removeEventListener("touchcancel", tc);
      document.removeEventListener("pointerdown", pd);
      document.removeEventListener("pointerup", pu);
    };
  }, []);
}

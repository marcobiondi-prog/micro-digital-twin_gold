import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { hapticTick } from "@/lib/haptics";
import { simTabSwipeStep, startsOnOwnGesture } from "@/lib/sim-tab-swipe";

/** The tutorial's curve, for the settle. */
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const SLIDE_EASE = `transform 380ms ${EASE}`;
/** Space between the open panel and the next one sliding in beside it. */
export const PEEK_GAP = 16;
/** A flick: this fast (px per ms) turns the tab even when it has moved less than 50 px (MIN_SWIPE), from this far. */
const FLICK_SPEED = 0.45, FLICK_MIN = 16;

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
  /** Kept for the callers' style prop: the track is moved directly, so it is always empty. */
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
 * page drags the open panel with the finger — moved straight on the element, once per frame, so the page itself is
 * not redrawn while dragging — with only a little give past the first and the last tab; past 50 px, or with a quick
 * flick, it turns to the neighbouring tab, which slides in from where the finger left it and settles in a time that
 * follows the distance left; shorter, it springs back. A mostly vertical move scrolls the page and drags nothing.
 * No transform at rest, so fixed elements inside keep their place. With `scope` (sub-tabs) only swipes starting
 * inside that element count, and they take the gesture from the page's tabs while they can turn.
 */
export function useTabSwipe<T extends string>(ids: ReadonlyArray<T>, value: T, onChange: (id: T) => void, scope?: RefObject<HTMLElement | null>): TabSwipe<T> {
  const track = useRef<HTMLDivElement | null>(null);
  const [peekState, setPeekState] = useState<{ peek: T | null; side: 1 | -1; top: number }>({ peek: null, side: 1, top: 0 });
  const latest = useRef({ ids, value, onChange });
  latest.current = { ids, value, onChange };
  // A turn waiting for the new panel to render: it then starts from this offset and settles to 0.
  const pendingFrom = useRef<number | null>(null);

  const place = (x: number, ms = 0) => {
    const el = track.current;
    if (!el) return;
    if (x === 0 && ms === 0) { el.style.transform = ""; el.style.transition = ""; el.style.willChange = ""; return; }
    el.style.willChange = "transform";
    el.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
    el.style.transform = `translate3d(${x}px, 0, 0)`;
  };
  /** From `from` back to rest, in a time that follows the distance (180–380 ms); styles cleared once there. */
  const settleFrom = (from: number) => {
    const el = track.current;
    if (!el || from === 0 || reduced()) { place(0); return; }
    place(from);
    void el.offsetWidth; // the start is laid out before the transition begins
    const ms = Math.round(Math.min(380, Math.max(180, (Math.abs(from) / Math.max(1, el.offsetWidth)) * 380)));
    place(0.0001, ms);
    const done = () => { el.removeEventListener("transitionend", done); if (track.current === el) place(0); };
    el.addEventListener("transitionend", done);
    window.setTimeout(done, ms + 60);
  };

  // A turn: once the new tab's panel is in the page (before it is painted), slide it in from the finger's side.
  useLayoutEffect(() => {
    const from = pendingFrom.current;
    if (from === null) return;
    pendingFrom.current = null;
    settleFrom(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    // Sub-tabs listen on their own element, the page's tabs on the document (same events, typed as an element's).
    const host = (scope ? scope.current : document) as HTMLElement | null;
    if (!host) return;
    let frame = 0, dragged = 0, top = 0, nextX = 0;
    // The last few positions with their time, for the flick's speed.
    let trail: Array<[number, number]> = [];
    let start: { x: number; y: number; axis: "x" | "y" | null } | null = null;
    const showPeek = (peek: T | null, side: 1 | -1) => setPeekState((p) => (p.peek === peek && p.side === side && p.top === top ? p : { peek, side, top }));
    const begin = (x: number, y: number, target: EventTarget | null) => {
      claimed = false;
      trail = [[x, performance.now()]];
      start = document.documentElement.hasAttribute("data-ar-camera") || startsOnOwnGesture(target, scope?.current ?? document.body) ? null : { x, y, axis: null };
    };
    const move = (x: number, y: number) => {
      const s = start;
      if (!s) return;
      const dx = x - s.x, dy = y - s.y;
      const { ids: list, value: cur } = latest.current;
      const i = list.indexOf(cur);
      const edge = (dx > 0 && i <= 0) || (dx < 0 && i >= list.length - 1);
      if (!scope && claimed) { if (s.axis === "x") { place(0); showPeek(null, 1); } start = null; return; }
      if (!s.axis) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s.axis = "y"; return; }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          // Sub-tabs at their end in this direction let the page's tabs have the swipe.
          if (scope && edge) { start = null; return; }
          s.axis = "x";
          if (scope) claimed = true;
          const t = track.current;
          top = t ? Math.max(0, visibleTop(t) - t.getBoundingClientRect().top) : 0;
        }
      }
      if (s.axis !== "x") return;
      const now = performance.now();
      trail.push([x, now]);
      while (trail.length > 2 && now - trail[0]![1] > 90) trail.shift();
      // Past the ends the drag only gives a little, softening as it goes.
      dragged = edge ? Math.sign(dx) * Math.min(80, Math.abs(dx) * 0.28) : dx;
      nextX = dragged;
      const side: 1 | -1 = dx < 0 ? 1 : -1;
      showPeek(edge ? null : (list[i + side] ?? null), side);
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(nextX); });
    };
    const finish = (x: number, y: number) => {
      const s = start;
      start = null;
      cancelAnimationFrame(frame); frame = 0;
      if (!s) return;
      const dx = x - s.x, dy = y - s.y;
      const { ids: list, value: cur, onChange: set } = latest.current;
      const i = list.indexOf(cur);
      // A quick flick turns even a short swipe.
      const [x0, t0] = trail[0] ?? [x, performance.now()];
      const speed = (x - x0) / Math.max(1, performance.now() - t0);
      let next = s.axis === "y" ? i : simTabSwipeStep(i, list.length, dx, dy);
      if (s.axis === "x" && next === i && Math.abs(speed) > FLICK_SPEED && Math.abs(dx) >= FLICK_MIN && Math.sign(speed) === Math.sign(dx)) {
        next = Math.min(list.length - 1, Math.max(0, i + (dx < 0 ? 1 : -1)));
      }
      const to = list[next];
      showPeek(null, 1);
      if (i >= 0 && to !== undefined && next !== i) {
        hapticTick();
        swipedAt = Date.now();
        // The page scrolls so the new panel's top sits where its peek was showing.
        if (top > 0) window.scrollBy({ top: -top, behavior: "instant" as ScrollBehavior });
        const w = (track.current?.offsetWidth ?? window.innerWidth) + PEEK_GAP;
        // The new panel enters from the side the finger moved away from, where the old one's edge was.
        pendingFrom.current = next > i ? w + Math.min(0, dragged) : -w + Math.max(0, dragged);
        place(0);
        set(to);
      } else if (s.axis === "x") settleFrom(dragged); // too short: spring back
      dragged = 0;
    };
    const cancel = () => { if (start?.axis === "x") { settleFrom(dragged); showPeek(null, 1); } start = null; dragged = 0; };
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
      cancelAnimationFrame(frame);
      host.removeEventListener("touchstart", ts);
      host.removeEventListener("touchmove", tm);
      host.removeEventListener("touchend", te);
      host.removeEventListener("touchcancel", cancel);
      host.removeEventListener("pointerdown", pd);
      host.removeEventListener("pointermove", pm);
      host.removeEventListener("pointerup", pu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref: track, style: EMPTY, peek: peekState.peek, peekSide: peekState.side, peekTop: peekState.top };
}

const EMPTY: CSSProperties = {};

/** Style for the panel peeking beside the open one: placed one track width (plus the gap) to its side, under the tabs. */
export const peekStyle = (side: 1 | -1, top: number): CSSProperties => ({
  position: "absolute", left: 0, right: 0, top, pointerEvents: "none",
  transform: `translateX(calc(${side * 100}% + ${side * PEEK_GAP}px))`,
});

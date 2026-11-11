import { useEffect, useRef } from "react";

// Steps inside an open panel (a page shown within it) can take the Back gesture first: the latest guard that returns true
// handles it, and the panel stays open.
const guards: Array<() => boolean> = [];
export function pushBackGuard(guard: () => boolean) {
  guards.push(guard);
  return () => { const i = guards.lastIndexOf(guard); if (i >= 0) guards.splice(i, 1); };
}

/**
 * While `open`, the phone/browser back gesture closes the panel instead of
 * leaving the page: a same-URL history entry is pushed on open and consumed
 * on close.
 */
let backCloseCounter = 0;

export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!open) return;
    let popped = false;
    const key = `__panel_${++backCloseCounter}`;
    window.history.pushState({ ...(window.history.state ?? {}), [key]: true, __panel: true }, "");
    const onPop = () => {
      if (guards.length && guards[guards.length - 1]!()) return;
      if (window.history.state?.[key]) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && !openRef.current && window.history.state?.[key]) window.history.back();
    };
  }, [open]);
}

import { useCallback, useEffect, useRef } from "react";

/** How long the shutter must be held before the multiple shot starts, and how often it shoots while held. */
export const HOLD_MS = 350;
export const BURST_EVERY_MS = 300;

/**
 * Hold-to-burst: once the shutter has been held for HOLD_MS, `onHold(true)` shoots at once and then every
 * BURST_EVERY_MS until `onHold(false)` (the finger lifts). `holding` says whether a held burst is under way.
 */
export function useHoldBurst(shoot: () => void, onStart?: () => void) {
  const shootRef = useRef(shoot);
  shootRef.current = shoot;
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const holding = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const onHold = useCallback((on: boolean) => {
    window.clearInterval(timer.current);
    holding.current = on;
    if (!on) return;
    startRef.current?.();
    shootRef.current();
    timer.current = window.setInterval(() => shootRef.current(), BURST_EVERY_MS);
  }, []);
  useEffect(() => () => window.clearInterval(timer.current), []);
  return { holding, onHold };
}

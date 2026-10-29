import { useEffect, useRef } from "react";
import { addHistory } from "@/lib/use-history";
import { urbanMix, urbanSummary, vineyardMix, vineyardSummary } from "@/models/history-summary";
import { useLab } from "@/models/lab-store";
import { getSimWhen } from "@/models/sim-when";
import { splitLocation } from "@/views/SimulationGrid";
import type { SimKind } from "@/views/v8/console";

const WAIT_MS = 4000;

/** What the user can change in the simulation: when this changes, an intervention has been made. */
const leversOf = (kind: SimKind, lab: ReturnType<typeof useLab>) =>
  kind === "urban"
    ? JSON.stringify([lab.urban.trees, lab.urban.permeable, lab.urban.shade])
    : JSON.stringify([lab.vineyard.irrigation, lab.vineyard.shade, lab.vineyard.windbreak, lab.vineyard.zones.map((z) => [z.irrigation, z.shade, z.windbreak])]);

/** No lever moved off zero: nothing was put in, so there is no intervention to record. */
const isEmpty = (kind: SimKind, lab: ReturnType<typeof useLab>) => {
  const m = kind === "urban" ? urbanMix(lab.urban) : vineyardMix(lab.vineyard);
  return m.kind === "piazza"
    ? m.trees === 0 && m.permeable === 0 && m.shade === 0
    : m.zones.every((z) => z.irrigation === 0 && z.shade === 0 && z.windbreak === 0);
};

/**
 * Records an intervention in the history once the levers stop moving, signed in or not (guests keep it on this
 * device). Nothing is recorded for what was already there on opening, nor for an empty mix. A change still waiting
 * is recorded at once when the page is left, hidden or closed, so leaving within the wait loses nothing.
 */
export function useAutoHistory(kind: SimKind) {
  const lab = useLab();
  const levers = leversOf(kind, lab);
  const seen = useRef(levers);
  const latest = useRef(lab);
  latest.current = lab;
  const record = useRef(() => {});
  record.current = () => {
    const l = latest.current, now = leversOf(kind, l);
    if (now === seen.current) return;
    seen.current = now;
    if (isEmpty(kind, l)) return;
    const text = kind === "urban" ? urbanSummary(l.urban) : vineyardSummary(l.vineyard);
    const place = splitLocation((kind === "urban" ? l.urban : l.vineyard).location.label).name;
    void addHistory(kind === "urban" ? "piazza" : "vigneto", text, place, kind === "urban" ? urbanMix(l.urban) : vineyardMix(l.vineyard), getSimWhen(kind));
  };
  useEffect(() => {
    if (levers === seen.current) return;
    const timer = window.setTimeout(() => record.current(), WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [levers]);
  useEffect(() => {
    const flush = () => record.current();
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
}

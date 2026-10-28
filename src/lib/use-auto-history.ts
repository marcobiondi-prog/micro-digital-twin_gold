import { useEffect, useRef } from "react";
import { addHistory } from "@/lib/use-history";
import { urbanSummary, vineyardSummary } from "@/models/history-summary";
import { useLab } from "@/models/lab-store";
import { splitLocation } from "@/views/SimulationGrid";
import type { SimKind } from "@/views/v8/console";

const WAIT_MS = 4000;

/** What the user can change in the simulation: when this changes, an intervention has been made. */
const leversOf = (kind: SimKind, lab: ReturnType<typeof useLab>) =>
  kind === "urban"
    ? JSON.stringify([lab.urban.trees, lab.urban.permeable, lab.urban.shade])
    : JSON.stringify([lab.vineyard.irrigation, lab.vineyard.shade, lab.vineyard.windbreak, lab.vineyard.zones.map((z) => [z.irrigation, z.shade, z.windbreak])]);

/** Records an intervention in the history once the levers stop moving; nothing is recorded for what was already there on opening. */
export function useAutoHistory(kind: SimKind) {
  const lab = useLab();
  const levers = leversOf(kind, lab);
  const seen = useRef(levers);
  const latest = useRef(lab);
  latest.current = lab;
  useEffect(() => {
    if (levers === seen.current) return;
    const timer = window.setTimeout(() => {
      seen.current = levers;
      const l = latest.current;
      const text = kind === "urban" ? urbanSummary(l.urban) : vineyardSummary(l.vineyard);
      const place = splitLocation((kind === "urban" ? l.urban : l.vineyard).location.label).name;
      void addHistory(kind === "urban" ? "piazza" : "vigneto", text, place);
    }, WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [levers, kind]);
}

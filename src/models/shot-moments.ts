/**
 * The photos and videos of the Cronologia's time line gathered into "moments": shots taken one after another, no more
 * than MOMENT_GAP_MS apart, read as one stop of the day (a series of photos of the piazza), placed at the hour of its
 * latest shot among the day's interventions.
 */
export const MOMENT_GAP_MS = 20 * 60_000;

export type Moment<S> = { key: string; at: number; first: number; shots: S[] };

/** Moments of shots with a time (newest first in each moment and among the moments); shots without a time are left out. */
export function momentsOf<S extends { id: string; at: number | null }>(shots: readonly S[], gap = MOMENT_GAP_MS): Moment<S>[] {
  const timed = shots.filter((s): s is S & { at: number } => typeof s.at === "number").sort((a, b) => b.at - a.at);
  const out: Moment<S>[] = [];
  for (const s of timed) {
    const last = out[out.length - 1];
    if (last && last.first - s.at <= gap) { last.shots.push(s); last.first = s.at; }
    else out.push({ key: `m-${s.id}`, at: s.at, first: s.at, shots: [s] });
  }
  return out;
}

/** The local calendar day of a time: "2026-11-25". */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

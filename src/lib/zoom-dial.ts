import { ZOOM_MIN } from "@/lib/camera-zoom";

/** Pixels of sideways swipe for each doubling of the zoom (1→2, 2→4): a logarithmic dial like the Xperia camera's. */
export const DIAL_PX = 110;

/** The zoom a sideways swipe of `dx` px gives, starting from `from`: left (negative) zooms in, right zooms out. */
export function dialZoom(from: number, dx: number, max: number): number {
  const z = 2 ** (Math.log2(Math.max(ZOOM_MIN, from)) - dx / DIAL_PX);
  return Math.min(max, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
}

export type RulerTick = { value: number; major: boolean; label: string | null };

/** The ruler's marks from 1× to `max`: a mark every 0.1×, a longer one on each half, a number on each whole step. */
export function rulerTicks(max: number): RulerTick[] {
  const ticks: RulerTick[] = [];
  for (let i = 10; i <= Math.round(max * 10); i++) {
    const value = i / 10;
    const whole = i % 10 === 0;
    ticks.push({ value, major: whole || i % 5 === 0, label: whole ? String(i / 10) : null });
  }
  return ticks;
}

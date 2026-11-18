/**
 * The AR's floor, found from ARCore's hit tests (pure, so it can be tested off the phone).
 *
 * ARCore answers a hit test with the first surface under the screen's centre: the floor, but also a table, a sofa or a
 * wall. The floor is the lowest flat level seen again and again, so every flat hit is kept for a while and the floor is
 * the lowest level that gathers enough of them; a lone hit lower down (noise) does not count, a table above it never
 * becomes the floor.
 */

/** A hit's surface as seen by ARCore: its height and how much its normal points up (1 flat, 0 a wall). */
export type SurfaceHit = { x: number; y: number; z: number; up: number };

export type SurfaceKind = "flat" | "slope" | "wall";

/** Flat enough to put something on (within about 25°), a wall (beyond about 65°), else a slope. */
export function surfaceKind(up: number): SurfaceKind {
  if (up >= 0.9) return "flat";
  if (up <= 0.42) return "wall";
  return "slope";
}

/** How the floor's height is gathered: hits binned every BIN m, the floor needs MIN_HITS of them in its bin. */
export const FLOOR_BIN = 0.04;
export const FLOOR_MIN_HITS = 6;
/** A flat surface higher than this over the floor is a raised one (a table, a bench, a step). */
export const RAISED_M = 0.15;

export class FloorTracker {
  private samples: { y: number; t: number }[] = [];
  private keepMs: number;
  private max: number;

  constructor(keepMs = 20_000, max = 600) { this.keepMs = keepMs; this.max = max; }

  /** Adds a flat hit. */
  add(y: number, now: number) {
    this.samples.push({ y, t: now });
    if (this.samples.length > this.max) this.samples.splice(0, this.samples.length - this.max);
    const old = now - this.keepMs;
    while (this.samples.length && this.samples[0]!.t < old && this.samples.length > FLOOR_MIN_HITS * 2) this.samples.shift();
  }

  get count() { return this.samples.length; }

  /**
   * The floor's height: the lowest bin (with its two neighbours) holding at least FLOOR_MIN_HITS hits, read as the
   * median of the hits in it; null while too few flat hits were seen.
   */
  floorY(): number | null {
    if (this.samples.length < FLOOR_MIN_HITS) return null;
    const bins = new Map<number, number[]>();
    for (const s of this.samples) {
      const k = Math.round(s.y / FLOOR_BIN);
      const list = bins.get(k);
      if (list) list.push(s.y); else bins.set(k, [s.y]);
    }
    const keys = [...bins.keys()].sort((a, b) => a - b);
    for (const k of keys) {
      const near = [...(bins.get(k - 1) ?? []), ...(bins.get(k) ?? []), ...(bins.get(k + 1) ?? [])];
      if (near.length >= FLOOR_MIN_HITS) {
        near.sort((a, b) => a - b);
        return near[Math.floor(near.length / 2)]!;
      }
    }
    return null;
  }

  reset() { this.samples = []; }
}

/** Where an object would be put, from the hit and the floor: on the floor, on a raised flat surface (only for a
 *  model, which may stand on a table), or on the floor right under the screen's centre when the hit is a wall, a slope
 *  or a raised surface while working at real size. */
export type Placement = { kind: "floor" | "raised" | "floor-under"; y: number };

export function placementFor(hit: SurfaceHit | null, floorY: number | null, model: boolean): Placement | null {
  if (!hit) return floorY === null ? null : { kind: "floor-under", y: floorY };
  const kind = surfaceKind(hit.up);
  if (kind === "flat") {
    if (floorY === null || hit.y - floorY < RAISED_M) return { kind: "floor", y: floorY === null ? hit.y : floorY };
    if (model) return { kind: "raised", y: hit.y };
  }
  return floorY === null ? null : { kind: "floor-under", y: floorY };
}

/**
 * The reticle eased towards where it should be, so ARCore's small jitters do not shake it: a little of the way each
 * frame (alpha), straight there when the spot jumped (a new surface, the phone turned fast).
 */
export function easeTo(prev: { x: number; y: number; z: number } | null, next: { x: number; y: number; z: number }, alpha = 0.35, jump = 0.6) {
  if (!prev) return { ...next };
  const d = Math.hypot(next.x - prev.x, next.y - prev.y, next.z - prev.z);
  if (d > jump) return { ...next };
  return { x: prev.x + (next.x - prev.x) * alpha, y: prev.y + (next.y - prev.y) * alpha, z: prev.z + (next.z - prev.z) * alpha };
}

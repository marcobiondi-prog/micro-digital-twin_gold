import { ringAreaM2, ringContains, type Ring } from "./place-area";

/**
 * The simulation drawn inside the area: where the piazza's trees, lawn and shade go, or how the vineyard's three zones,
 * drip lines, shade cloth and windbreak sit. Automatic from the levers (counts and percentages), with optional hand
 * edits: a tree moved, the lawn's or the shade's centre moved, the windbreak's side. Pure geometry in [lat, lng].
 */
export type LatLng = [number, number];
export type LayoutEdits = { trees?: Array<LatLng | null>; lawnAt?: LatLng | null; shadeAt?: LatLng | null; windAt?: LatLng | null };

export type Patch = { ring: Ring; kind: "lawn" | "shade" | "zone" | "cloth"; zone?: number };
export type Line = { line: Ring; kind: "drip" | "wind"; zone?: number; strength?: number };
export type PiazzaLayout = { trees: LatLng[]; patches: Patch[]; lawnAt: LatLng; shadeAt: LatLng; cell: number };
export type VineLayout = { patches: Patch[]; lines: Line[]; windAt: LatLng; zones: LatLng[] };

/** The tree crown's radius on the map (m): about an 8 m crown. */
export const TREE_RADIUS_M = 4;
const M = 111_195;

type Frame = { lat0: number; lng0: number; k: number };
const frameOf = (ring: Ring): Frame => {
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length, lng0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { lat0, lng0, k: M * Math.cos((lat0 * Math.PI) / 180) };
};
const toXY = (f: Frame, [lat, lng]: LatLng): [number, number] => [(lng - f.lng0) * f.k, (lat - f.lat0) * M];
const toLL = (f: Frame, x: number, y: number): LatLng => [f.lat0 + y / M, f.lng0 + x / f.k];
const inside = (ring: Ring, f: Frame, x: number, y: number) => { const [lat, lng] = toLL(f, x, y); return ringContains(ring, lat, lng); };

type Cell = { i: number; j: number; x: number; y: number };

/** The area cut into square cells (whole cells inside it), sized so a usual area has 150–250 of them. */
function cellsOf(ring: Ring) {
  const f = frameOf(ring), xy = ring.map((p) => toXY(f, p));
  const area = ringAreaM2(ring);
  const c = Math.max(2, Math.min(25, Math.sqrt(area / 180)));
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cells: Cell[] = [];
  for (let j = 0; minY + (j + 0.5) * c <= maxY; j++) {
    for (let i = 0; minX + (i + 0.5) * c <= maxX; i++) {
      const x = minX + (i + 0.5) * c, y = minY + (j + 0.5) * c;
      // The whole cell inside (its four corners), so lawn, shade and zones never spill past the outline.
      const h = c / 2;
      if ([[0, 0], [-h, -h], [h, -h], [h, h], [-h, h]].every(([dx, dy]) => inside(ring, f, x + dx!, y + dy!))) cells.push({ i, j, x, y });
    }
  }
  return { f, c, cells, minX, maxX, minY, maxY, xy };
}

/** Cells of one kind merged into strips along each row (fewer shapes to draw). */
function strips(f: Frame, c: number, cells: Cell[], kind: Patch["kind"], zone?: number): Patch[] {
  const rows = new Map<number, Cell[]>();
  for (const cell of cells) rows.set(cell.j, [...(rows.get(cell.j) ?? []), cell]);
  const out: Patch[] = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a.i - b.i);
    let start = row[0]!, prev = row[0]!;
    const flush = () => {
      const x0 = start.x - c / 2, x1 = prev.x + c / 2, y0 = prev.y - c / 2, y1 = prev.y + c / 2;
      out.push({ kind, ...(zone !== undefined ? { zone } : {}), ring: [toLL(f, x0, y0), toLL(f, x1, y0), toLL(f, x1, y1), toLL(f, x0, y1)] });
    };
    for (const cell of row.slice(1)) {
      if (cell.i !== prev.i + 1) { flush(); start = cell; }
      prev = cell;
    }
    flush();
  }
  return out;
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearestCell = (cells: Cell[], p: [number, number]) => cells.reduce((b, c) => (dist([c.x, c.y], p) < dist([b.x, b.y], p) ? c : b), cells[0]!);

/** Up to `n` tree spots spread evenly inside the area, kept 2 m from its edge. */
function treeSpots(ring: Ring, f: Frame, n: number, box: { minX: number; maxX: number; minY: number; maxY: number }): Array<[number, number]> {
  if (n <= 0) return [];
  const area = ringAreaM2(ring);
  const fits = (x: number, y: number) => [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => inside(ring, f, x + dx!, y + dy!));
  let t = Math.sqrt(area / n), spots: Array<[number, number]> = [];
  for (let k = 0; k < 40; k++) {
    spots = [];
    for (let y = box.minY + t / 2; y <= box.maxY; y += t) for (let x = box.minX + t / 2; x <= box.maxX; x += t) if (fits(x, y)) spots.push([x, y]);
    if (spots.length >= n || t < 2.5) break;
    t *= 0.88;
  }
  if (spots.length <= n) return spots;
  // More spots than trees: take them evenly through the grid.
  return Array.from({ length: n }, (_, i) => spots[Math.floor(((i + 0.5) * spots.length) / n)]!);
}

/** The piazza inside the area: `trees` trees, `lawn` % of it lawn, `shade` % of it under shade, with the hand edits. */
export function piazzaLayout(ring: Ring, trees: number, lawn: number, shade: number, edits: LayoutEdits = {}): PiazzaLayout | null {
  if (ring.length < 3) return null;
  const { f, c, cells, minX, maxX, minY, maxY } = cellsOf(ring);
  if (!cells.length) return null;
  const cy = (minY + maxY) / 2;
  // By default the lawn gathers on the west side and the shade on the east; a hand edit moves either centre.
  const lawnAt = edits.lawnAt ? toXY(f, edits.lawnAt) : ([minX + (maxX - minX) * 0.25, cy] as [number, number]);
  const shadeAt = edits.shadeAt ? toXY(f, edits.shadeAt) : ([minX + (maxX - minX) * 0.75, cy] as [number, number]);
  const byDist = (p: [number, number]) => (a: Cell, b: Cell) => dist([a.x, a.y], p) - dist([b.x, b.y], p);
  const nLawn = Math.round((Math.max(0, Math.min(100, lawn)) / 100) * cells.length);
  const nShade = Math.round((Math.max(0, Math.min(100, shade)) / 100) * cells.length);
  const lawnCells = [...cells].sort(byDist(lawnAt)).slice(0, nLawn);
  const taken = new Set(lawnCells);
  const shadeCells = cells.filter((x) => !taken.has(x)).sort(byDist(shadeAt)).slice(0, nShade);
  const auto = treeSpots(ring, f, Math.max(0, Math.round(trees)), { minX, maxX, minY, maxY });
  const placed = auto.map((p, i) => edits.trees?.[i] ?? toLL(f, p[0], p[1]));
  return {
    trees: placed, cell: c,
    patches: [...strips(f, c, lawnCells, "lawn"), ...strips(f, c, shadeCells, "shade")],
    lawnAt: toLL(f, ...(nLawn ? (() => { const n = nearestCell(cells, lawnAt); return [n.x, n.y] as [number, number]; })() : lawnAt)),
    shadeAt: toLL(f, ...(nShade ? (() => { const n = nearestCell(cells.filter((x) => !taken.has(x)).length ? cells.filter((x) => !taken.has(x)) : cells, shadeAt); return [n.x, n.y] as [number, number]; })() : shadeAt)),
  };
}

export type ZoneMix = { irrigation: number; shade: number; windbreak: number };

/**
 * The vineyard inside the area: three zones side by side (west → east), each with drip lines along its rows (closer
 * with more irrigation), its shade cloth (that share of its cells, from the north) and a windbreak along the side
 * nearest `windAt` (the west side by default), as thick as its strength.
 */
export function vineLayout(ring: Ring, mixes: ZoneMix[], edits: LayoutEdits = {}): VineLayout | null {
  if (ring.length < 3) return null;
  const { f, c, cells, xy } = cellsOf(ring);
  if (!cells.length) return null;
  const n = Math.max(1, mixes.length);
  const sorted = [...cells].sort((a, b) => a.x - b.x || a.y - b.y);
  const zoneOf = new Map<Cell, number>(sorted.map((cell, k) => [cell, Math.min(n - 1, Math.floor((k * n) / sorted.length))]));
  const patches: Patch[] = [], lines: Line[] = [], zones: LatLng[] = [];
  for (let z = 0; z < n; z++) {
    const mine = cells.filter((x) => zoneOf.get(x) === z), mix = mixes[z] ?? { irrigation: 0, shade: 0, windbreak: 0 };
    if (!mine.length) continue;
    patches.push(...strips(f, c, mine, "zone", z));
    const mx = mine.reduce((s, x) => s + x.x, 0) / mine.length, my = mine.reduce((s, x) => s + x.y, 0) / mine.length;
    zones.push(toLL(f, mx, my));
    // Shade cloth: that share of the zone's cells, the northern rows first.
    const cloth = [...mine].sort((a, b) => b.y - a.y || a.x - b.x).slice(0, Math.round((Math.max(0, Math.min(100, mix.shade)) / 100) * mine.length));
    patches.push(...strips(f, c, cloth, "cloth", z));
    // Drip lines: one every `step` rows, closer with more irrigation (+20 % = every row).
    if (mix.irrigation > 0) {
      const step = Math.max(1, Math.round(5 - mix.irrigation / 5));
      const rows = new Map<number, Cell[]>();
      for (const cell of mine) rows.set(cell.j, [...(rows.get(cell.j) ?? []), cell]);
      for (const [j, row] of rows) {
        if (j % step) continue;
        const x0 = Math.min(...row.map((r) => r.x)) - c / 2.5, x1 = Math.max(...row.map((r) => r.x)) + c / 2.5;
        lines.push({ kind: "drip", zone: z, line: [toLL(f, x0, row[0]!.y), toLL(f, x1, row[0]!.y)] });
      }
    }
  }
  // Windbreak: the edge nearest its handle (by default the westernmost edge), when there is any windbreak.
  const strength = mixes.reduce((s, m) => s + m.windbreak, 0) / n;
  const mids = xy.map((p, i) => { const q = xy[(i + 1) % xy.length]!; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as [number, number]; });
  const target = edits.windAt ? toXY(f, edits.windAt) : mids.reduce((b, m) => (m[0] < b[0] ? m : b), mids[0]!);
  const e = mids.reduce((b, m, i) => (dist(m, target) < dist(mids[b]!, target) ? i : b), 0);
  if (strength > 0) lines.push({ kind: "wind", strength, line: [ring[e]!, ring[(e + 1) % ring.length]!] });
  return { patches, lines, zones, windAt: toLL(f, ...mids[e]!) };
}

/** A tree's crown as a small polygon (for the 3D views). */
export function crownRing([lat, lng]: LatLng, radius = TREE_RADIUS_M, sides = 10): Ring {
  const k = M * Math.cos((lat * Math.PI) / 180);
  return Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2; return [lat + (Math.sin(a) * radius) / M, lng + (Math.cos(a) * radius) / k] as LatLng; });
}

/** One piece of a tree in 3D: a horizontal slab from `base` to `height` metres. */
export type TreePart = { ring: Ring; base: number; height: number; color: string };

const CROWN_GREENS = ["#2f7d32", "#3a8f3c", "#2b6e2f", "#46963f", "#357a3a"];

/**
 * A tree for the 3D views: a brown trunk 3.5 m tall and a rounded crown from 3 m to 10 m, built from `step` m slabs whose
 * radius follows an ellipsoid (widest at mid-height, narrow at the top), slightly darker below; each tree takes its
 * own green from its place so a row of trees is not uniform.
 */
export function treeParts(at: LatLng, radius = TREE_RADIUS_M, step = 0.5): TreePart[] {
  const seed = Math.abs(Math.round(at[0] * 1e6 + at[1] * 1e6));
  const green = CROWN_GREENS[seed % CROWN_GREENS.length]!;
  const r = radius * (0.9 + ((seed >> 3) % 5) * 0.05);
  const parts: TreePart[] = [{ ring: crownRing(at, 0.4, 8), base: 0, height: 3.6, color: "#6b4f2e" }];
  const bottom = 3, top = 10, centre = (bottom + top) / 2, half = (top - bottom) / 2;
  for (let h = bottom; h < top - 1e-6; h += step) {
    const mid = h + step / 2, k = Math.sqrt(Math.max(0, 1 - ((mid - centre) / half) ** 2));
    // Darker under the crown, lighter on top, as if lit from above.
    const shade = 0.8 + 0.3 * ((mid - bottom) / (top - bottom));
    parts.push({ ring: crownRing(at, Math.max(0.5, r * k), 16), base: h, height: h + step, color: tint(green, shade) });
  }
  return parts;
}

/** A hex colour made darker (< 1) or lighter (> 1). */
function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16), ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

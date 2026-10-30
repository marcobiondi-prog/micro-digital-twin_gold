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
function treeSpots(ring: Ring, f: Frame, n: number, box: { minX: number; maxX: number; minY: number; maxY: number }, allowed: (x: number, y: number) => boolean = () => true, room = ringAreaM2(ring)): Array<[number, number]> {
  if (n <= 0) return [];
  const area = room;
  const fits = (x: number, y: number) => allowed(x, y) && [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([dx, dy]) => inside(ring, f, x + dx!, y + dy!));
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

/** A smaller area inside the big one (models/drawn-area SubArea, its kind only matters here). */
export type InnerZone = { kind: string; ring: Ring };

const inZone = (f: Frame, zones: InnerZone[], kind: string) => {
  const rings = zones.filter((z) => z.kind === kind && z.ring.length >= 3).map((z) => z.ring);
  return (x: number, y: number) => { if (!rings.length) return false; const [lat, lng] = toLL(f, x, y); return rings.some((r) => ringContains(r, lat, lng)); };
};

/**
 * The piazza inside the area: `trees` trees, `lawn` % of it lawn, `shade` % of it under shade, with the hand edits and
 * the smaller zones inside it: nothing goes in a zone left free (and its cells do not count); a "prato" or "ombra" zone
 * is lawn or pergola first, the rest of the lever's share placed automatically; with "alberi" zones the trees go in them.
 */
export function piazzaLayout(ring: Ring, trees: number, lawn: number, shade: number, edits: LayoutEdits = {}, zones: InnerZone[] = []): PiazzaLayout | null {
  if (ring.length < 3) return null;
  const grid = cellsOf(ring), { f, c, minX, maxX, minY, maxY } = grid;
  const isFree = inZone(f, zones, "libera"), isLawn = inZone(f, zones, "prato"), isShade = inZone(f, zones, "ombra"), isTrees = inZone(f, zones, "alberi");
  const cells = grid.cells.filter((x) => !isFree(x.x, x.y));
  if (!cells.length) return null;
  const cy = (minY + maxY) / 2;
  // By default the lawn gathers on the west side and the shade on the east; a hand edit moves either centre.
  const lawnAt = edits.lawnAt ? toXY(f, edits.lawnAt) : ([minX + (maxX - minX) * 0.25, cy] as [number, number]);
  const shadeAt = edits.shadeAt ? toXY(f, edits.shadeAt) : ([minX + (maxX - minX) * 0.75, cy] as [number, number]);
  const byDist = (p: [number, number]) => (a: Cell, b: Cell) => dist([a.x, a.y], p) - dist([b.x, b.y], p);
  const nLawn = Math.round((Math.max(0, Math.min(100, lawn)) / 100) * cells.length);
  const nShade = Math.round((Math.max(0, Math.min(100, shade)) / 100) * cells.length);
  // The zones drawn for lawn or pergola come first (only while the lever has some), then the rest of the share around its centre.
  const fixedLawn = nLawn ? cells.filter((x) => isLawn(x.x, x.y)) : [];
  const fixedShade = nShade ? cells.filter((x) => isShade(x.x, x.y) && !fixedLawn.includes(x)) : [];
  const reserved = new Set([...fixedLawn, ...fixedShade]);
  // The automatic lawn and pergolas keep off the zones drawn for trees, unless there is no other room.
  const forTrees = new Set(cells.filter((x) => isTrees(x.x, x.y)));
  const pool = (skip: Set<Cell>, need: number) => {
    const open = cells.filter((x) => !skip.has(x) && !forTrees.has(x));
    return open.length >= need ? open : cells.filter((x) => !skip.has(x));
  };
  const lawnNeed = Math.max(0, nLawn - fixedLawn.length);
  const lawnCells = [...fixedLawn, ...pool(reserved, lawnNeed).sort(byDist(lawnAt)).slice(0, lawnNeed)];
  const taken = new Set([...lawnCells, ...fixedShade]);
  const shadeNeed = Math.max(0, nShade - fixedShade.length);
  const shadeCells = [...fixedShade, ...pool(taken, shadeNeed).sort(byDist(shadeAt)).slice(0, shadeNeed)];
  // Trees stand outside the pergolas and the free zones, inside the "alberi" zones when there are any; spots under a
  // shade cell are skipped (looked for on a finer grid), unless there is no room.
  const n = Math.max(0, Math.round(trees)), box = { minX, maxX, minY, maxY };
  const treeZones = zones.filter((z) => z.kind === "alberi" && z.ring.length >= 3);
  const room = treeZones.length ? treeZones.reduce((s2, z) => s2 + ringAreaM2(z.ring), 0) : ringAreaM2(ring);
  const allowed = (x: number, y: number) => !isFree(x, y) && (!treeZones.length || isTrees(x, y));
  const underShade = (x: number, y: number) => shadeCells.some((sc) => Math.abs(sc.x - x) <= c / 2 + 1 && Math.abs(sc.y - y) <= c / 2 + 1);
  let auto = treeSpots(ring, f, n, box, allowed, room);
  if (shadeCells.length && auto.some(([x, y]) => underShade(x, y))) {
    const free = treeSpots(ring, f, Math.ceil(n / Math.max(0.15, 1 - shadeCells.length / cells.length)) + 4, box, allowed, room).filter(([x, y]) => !underShade(x, y));
    if (free.length >= n) auto = Array.from({ length: n }, (_, i) => free[Math.floor(((i + 0.5) * free.length) / n)]!);
  }
  const placed = auto.map((p, i) => edits.trees?.[i] ?? toLL(f, p[0], p[1]));
  const rest = cells.filter((x) => !new Set(lawnCells).has(x));
  return {
    trees: placed, cell: c,
    patches: [...strips(f, c, lawnCells, "lawn"), ...strips(f, c, shadeCells, "shade")],
    lawnAt: toLL(f, ...(nLawn ? (() => { const m = nearestCell(cells, lawnAt); return [m.x, m.y] as [number, number]; })() : lawnAt)),
    shadeAt: toLL(f, ...(nShade ? (() => { const m = nearestCell(rest.length ? rest : cells, shadeAt); return [m.x, m.y] as [number, number]; })() : shadeAt)),
  };
}

export type ZoneMix = { irrigation: number; shade: number; windbreak: number };

/**
 * The vineyard inside the area: three zones side by side (west → east), each with drip lines along its rows (closer
 * with more irrigation), its shade cloth (that share of its cells, from the north) and a windbreak along the side
 * nearest `windAt` (the west side by default), as thick as its strength.
 */
export function vineLayout(ring: Ring, mixes: ZoneMix[], edits: LayoutEdits = {}, inner: InnerZone[] = []): VineLayout | null {
  if (ring.length < 3) return null;
  const grid = cellsOf(ring), { f, c, xy } = grid;
  // Nothing grows in a zone left free: its cells are not part of the vineyard's zones.
  const isFree = inZone(f, inner, "libera");
  const cells = grid.cells.filter((x) => !isFree(x.x, x.y));
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
 * A tree for the 3D views: a brown trunk and a pointed crown like a fir, three tiers of branches from 2.5 m to 11 m,
 * each tier a cone wider at its foot, the upper ones narrower, ending in a tip; built from `step` m slabs, darker
 * below and lighter on top; each tree takes its own green from its place so a row of trees is not uniform.
 */
export function treeParts(at: LatLng, radius = TREE_RADIUS_M, step = 0.5): TreePart[] {
  const seed = Math.abs(Math.round(at[0] * 1e6 + at[1] * 1e6));
  const green = CROWN_GREENS[seed % CROWN_GREENS.length]!;
  const r = radius * 0.85 * (0.9 + ((seed >> 3) % 5) * 0.05);
  const parts: TreePart[] = [{ ring: crownRing(at, 0.35, 8), base: 0, height: 3, color: "#6b4f2e" }];
  const bottom = 2.5, top = 11, tiers = [[2.5, 6], [5, 8.6], [7.6, 11]] as const;
  for (let h = bottom; h < top - 1e-6; h += step) {
    const mid = h + step / 2;
    // The widest of the tiers at this height: each tier narrows from its foot to its top, the higher tiers start narrower.
    let k = 0;
    tiers.forEach(([a, b], i) => { if (mid >= a && mid <= b) k = Math.max(k, (1 - i * 0.28) * (1 - (mid - a) / (b - a)) ** 0.9); });
    if (k <= 0.02) continue;
    const shade = 0.78 + 0.32 * ((mid - bottom) / (top - bottom));
    parts.push({ ring: crownRing(at, Math.max(0.15, r * k), 16), base: h, height: h + step, color: tint(green, shade) });
  }
  return parts;
}

/** A hex colour made darker (< 1) or lighter (> 1). */
function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16), ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, "0");
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Pergola wood: posts and beams darker, the slats of the roof lighter. */
export const PERGOLA_COLORS = { post: "#7a4a22", beam: "#6b4019", slat: "#c99a63" } as const;

/**
 * A pergola over a shade strip (a row rectangle from piazzaLayout) for the 3D views: posts about every 4 m along both
 * long sides (0–2.9 m), a beam on top of each long side (2.8–3.1 m) and a roof of slats across it every 0.7 m
 * (3.1–3.25 m), leaving light between them. Built as slabs like the trees.
 */
export function pergolaParts(strip: Ring): TreePart[] {
  if (strip.length < 4) return [];
  const f = frameOf(strip);
  const [a, b, , d] = strip.map((p) => toXY(f, p)) as Array<[number, number]>;
  // The strip runs from a to b (its length) and from a to d (its depth).
  const len = dist(a!, b!), dep = dist(a!, d!);
  if (len < 1 || dep < 1) return [];
  const ux = [(b![0] - a![0]) / len, (b![1] - a![1]) / len], vy = [(d![0] - a![0]) / dep, (d![1] - a![1]) / dep];
  const at = (s: number, t: number): [number, number] => [a![0] + ux[0]! * s + vy[0]! * t, a![1] + ux[1]! * s + vy[1]! * t];
  const box = (s0: number, s1: number, t0: number, t1: number): Ring => [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)].map(([x, y]) => toLL(f, x, y));
  const inset = 0.3, parts: TreePart[] = [];
  const posts = Math.max(2, Math.round(len / 4) + 1);
  for (let i = 0; i < posts; i++) {
    const s = inset + ((len - 2 * inset) * i) / (posts - 1);
    for (const t of [inset, dep - inset]) parts.push({ ring: box(s - 0.12, s + 0.12, t - 0.12, t + 0.12), base: 0, height: 2.9, color: PERGOLA_COLORS.post });
  }
  for (const t of [inset, dep - inset]) parts.push({ ring: box(0, len, t - 0.14, t + 0.14), base: 2.8, height: 3.1, color: PERGOLA_COLORS.beam });
  for (let s = 0.35; s < len - 0.2; s += 0.7) parts.push({ ring: box(s - 0.12, s + 0.12, 0, dep), base: 3.1, height: 3.25, color: PERGOLA_COLORS.slat });
  return parts;
}

import { ringAreaM2, ringContains, type Ring } from "./place-area";
import { sunPath, sunShare } from "./sun-exposure";

/**
 * The simulation drawn inside the area: where the piazza's trees, lawn and shade go, or how the vineyard's three zones,
 * drip lines, shade cloth and windbreak sit. Automatic from the levers (counts and percentages), with optional hand
 * edits: a tree moved, the lawn's or the shade's centre moved, the windbreak's side. Pure geometry in [lat, lng].
 */
export type LatLng = [number, number];
/** `best`: the piazza laid out where the summer sun hits most (models/sun-exposure) instead of lawn west, shade east. */
export type LayoutEdits = { trees?: Array<LatLng | null>; lawnAt?: LatLng | null; shadeAt?: LatLng | null; windAt?: LatLng | null; best?: boolean };

/** `exact`: the very ring of a zone drawn by hand (a Prato or Pergolato zone), not a strip of grid cells. */
export type Patch = { ring: Ring; kind: "lawn" | "shade" | "zone" | "cloth"; zone?: number; exact?: boolean };
export type Line = { line: Ring; kind: "drip" | "wind" | "seam"; zone?: number; strength?: number };
/** `sunny`: with `best`, the share of the area in the summer sun for most of the day (0–1), to say why. */
export type PiazzaLayout = { trees: LatLng[]; patches: Patch[]; lawnAt: LatLng; shadeAt: LatLng; cell: number; sunny?: number };
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

/** How far a trunk keeps from every edge so the whole drawn crown (4 m in 2D, a little less in 3D) stays inside. */
export const CROWN_REACH_M = TREE_RADIUS_M + 0.2;

/**
 * `n` tree spots spread evenly inside the area with their whole crown inside it (and inside its trees zone): the trunk is
 * kept a crown's reach from every edge; with more trees than room the spots get closer (crowns may overlap) and are
 * shared, never pushed past the edge; only a place too narrow for one whole crown lets the margin shrink. Also returns
 * the test a spot must pass, so a tree moved by hand is kept inside too.
 */
function treeSpots(ring: Ring, f: Frame, n: number, box: { minX: number; maxX: number; minY: number; maxY: number }, allowed: (x: number, y: number) => boolean = () => true, room = ringAreaM2(ring)): { spots: Array<[number, number]>; fits: (x: number, y: number) => boolean } {
  const ring8 = (m: number) => [[0, 0], ...Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6) * m, Math.sin((i * Math.PI) / 6) * m])];
  let spots: Array<[number, number]> = [];
  let fits: (x: number, y: number) => boolean = () => false;
  if (n <= 0) return { spots, fits: (x, y) => allowed(x, y) && inside(ring, f, x, y) };
  for (const margin of [CROWN_REACH_M, 3, 2, 1, 0]) {
    const offs = ring8(margin);
    fits = (x: number, y: number) => offs.every(([dx, dy]) => allowed(x + dx!, y + dy!) && inside(ring, f, x + dx!, y + dy!));
    let t = Math.sqrt(room / n);
    for (let k = 0; k < 60; k++) {
      spots = [];
      for (let y = box.minY + t / 2; y <= box.maxY; y += t) for (let x = box.minX + t / 2; x <= box.maxX; x += t) if (fits(x, y)) spots.push([x, y]);
      if (spots.length >= n || t < 0.8) break;
      t *= 0.88;
    }
    // Any room for a whole crown: the trees share those spots rather than leave the area.
    if (spots.length) break;
  }
  if (!spots.length) return { spots, fits };
  return { spots: Array.from({ length: n }, (_, i) => spots[Math.floor(((i + 0.5) * spots.length) / n) % spots.length]!), fits };
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
const exactRings = (zones: InnerZone[], kind: string, as: "lawn" | "shade"): Patch[] =>
  zones.filter((z) => z.kind === kind && z.ring.length >= 3).map((z) => ({ ring: z.ring, kind: as, exact: true }));

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
  // "Posizione migliore": every cell scored by its summer sun; the pergolas take the sunniest cells (shade where the heat
  // hits), the lawn the sunniest of the rest (a cool surface instead of hot paving), the trees the sunniest free spots.
  const best = !!edits.best;
  const sun = best ? sunPath((minY + maxY) / 2 / M + f.lat0) : [];
  const ptsM = grid.xy;
  const sunAt = new Map<Cell, number>();
  const sunOf = (cell: Cell) => { let v = sunAt.get(cell); if (v === undefined) { v = sunShare(ptsM, sun, cell.x, cell.y); sunAt.set(cell, v); } return v; };
  const bySun = (a: Cell, b: Cell) => sunOf(b) - sunOf(a) || a.y - b.y;
  const shadeNeed = Math.max(0, nShade - fixedShade.length);
  const lawnNeed = Math.max(0, nLawn - fixedLawn.length);
  let lawnCells: Cell[], shadeCells: Cell[];
  if (best) {
    shadeCells = [...fixedShade, ...pool(reserved, shadeNeed).sort(bySun).slice(0, shadeNeed)];
    const takenB = new Set([...shadeCells, ...fixedLawn]);
    lawnCells = [...fixedLawn, ...pool(takenB, lawnNeed).sort(bySun).slice(0, lawnNeed)];
  } else {
    lawnCells = [...fixedLawn, ...pool(reserved, lawnNeed).sort(byDist(lawnAt)).slice(0, lawnNeed)];
    const taken = new Set([...lawnCells, ...fixedShade]);
    shadeCells = [...fixedShade, ...pool(taken, shadeNeed).sort(byDist(shadeAt)).slice(0, shadeNeed)];
  }
  // Trees stand outside the pergolas and the free zones, inside the "alberi" zones when there are any; spots under a
  // shade cell are skipped (looked for on a finer grid), unless there is no room.
  const n = Math.max(0, Math.round(trees)), box = { minX, maxX, minY, maxY };
  const treeZones = zones.filter((z) => z.kind === "alberi" && z.ring.length >= 3);
  const room = treeZones.length ? treeZones.reduce((s2, z) => s2 + ringAreaM2(z.ring), 0) : ringAreaM2(ring);
  const allowed = (x: number, y: number) => !isFree(x, y) && (!treeZones.length || isTrees(x, y));
  const underShade = (x: number, y: number) => shadeCells.some((sc) => Math.abs(sc.x - x) <= c / 2 + 1 && Math.abs(sc.y - y) <= c / 2 + 1);
  const first = treeSpots(ring, f, n, box, allowed, room);
  let auto = first.spots;
  if (best && n > 0) {
    // The sunniest spots that keep the whole crown inside, off the pergolas, at least a crown apart while there is room.
    const cand: Array<[number, number]> = [];
    for (let y = minY; y <= maxY; y += 1.5) for (let x = minX; x <= maxX; x += 1.5) if (first.fits(x, y) && !underShade(x, y)) cand.push([x, y]);
    const score = new Map(cand.map((p) => [p, sunShare(ptsM, sun, p[0], p[1])]));
    cand.sort((a, b) => score.get(b)! - score.get(a)! || a[1] - b[1]);
    for (const gap of [TREE_RADIUS_M * 1.6, TREE_RADIUS_M, 2, 0]) {
      const picked: Array<[number, number]> = [];
      for (const p of cand) { if (picked.length >= n) break; if (picked.every((q) => dist(p, q) >= gap)) picked.push(p); }
      if (picked.length >= n || gap === 0) { if (picked.length) auto = picked.length >= n ? picked : [...picked, ...auto].slice(0, n); break; }
    }
  } else if (shadeCells.length && auto.some(([x, y]) => underShade(x, y))) {
    const free = treeSpots(ring, f, Math.ceil(n / Math.max(0.15, 1 - shadeCells.length / cells.length)) + 4, box, allowed, room).spots.filter(([x, y]) => !underShade(x, y));
    if (free.length >= n) auto = Array.from({ length: n }, (_, i) => free[Math.floor(((i + 0.5) * free.length) / n)]!);
  }
  // A tree moved by hand stays where it was put only with its whole crown inside; past the edge it goes back to the
  // nearest spot that keeps it inside.
  let room1: Array<[number, number]> | null = null;
  const keepInside = (p: LatLng): LatLng => {
    const [x, y] = toXY(f, p);
    if (first.fits(x, y)) return p;
    room1 ??= (() => { const out: Array<[number, number]> = []; for (let yy = minY; yy <= maxY; yy += 1) for (let xx = minX; xx <= maxX; xx += 1) if (first.fits(xx, yy)) out.push([xx, yy]); return out; })();
    if (!room1.length) return p;
    const best = room1.reduce((b, q) => (dist(q, [x, y]) < dist(b, [x, y]) ? q : b), room1[0]!);
    return toLL(f, best[0], best[1]);
  };
  const placed = auto.map((p, i) => { const e = edits.trees?.[i]; return e ? keepInside(e) : toLL(f, p[0], p[1]); });
  const rest = cells.filter((x) => !new Set(lawnCells).has(x));
  const centre = (list: Cell[], fallback: [number, number]): [number, number] => list.length ? [list.reduce((t, q) => t + q.x, 0) / list.length, list.reduce((t, q) => t + q.y, 0) / list.length] : fallback;
  return {
    trees: placed, cell: c,
    ...(best ? { sunny: cells.filter((x) => sunOf(x) >= 0.6).length / cells.length } : {}),
    // A Prato or Pergolato zone is drawn as its own outline, exactly as big as it was drawn; only the rest of the
    // lever's share is made of grid strips.
    patches: [
      ...(fixedLawn.length ? exactRings(zones, "prato", "lawn") : []), ...strips(f, c, lawnCells.filter((x) => !fixedLawn.includes(x)), "lawn"),
      ...(fixedShade.length ? exactRings(zones, "ombra", "shade") : []), ...strips(f, c, shadeCells.filter((x) => !fixedShade.includes(x)), "shade"),
    ],
    lawnAt: toLL(f, ...(best ? (() => { const m = nearestCell(lawnCells.length ? lawnCells : cells, centre(lawnCells, lawnAt)); return [m.x, m.y] as [number, number]; })() : nLawn ? (() => { const m = nearestCell(cells, lawnAt); return [m.x, m.y] as [number, number]; })() : lawnAt)),
    shadeAt: toLL(f, ...(best ? (() => { const m = nearestCell(shadeCells.length ? shadeCells : cells, centre(shadeCells, shadeAt)); return [m.x, m.y] as [number, number]; })() : nShade ? (() => { const m = nearestCell(rest.length ? rest : cells, shadeAt); return [m.x, m.y] as [number, number]; })() : shadeAt)),
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
  // Seams between neighbouring zones (white in the maps): on every row, a short line where one zone ends and the next begins.
  const rows = new Map<number, Cell[]>();
  for (const cell of cells) rows.set(cell.j, [...(rows.get(cell.j) ?? []), cell]);
  for (const row of rows.values()) {
    row.sort((p, q) => p.i - q.i);
    for (let k = 1; k < row.length; k++) {
      const p = row[k - 1]!, q = row[k]!;
      if (zoneOf.get(p) === zoneOf.get(q) || q.i !== p.i + 1) continue;
      const x = p.x + c / 2;
      lines.push({ kind: "seam", line: [toLL(f, x, p.y - c / 2), toLL(f, x, p.y + c / 2)] });
    }
  }
  // Where the border steps from one row to the next, the short horizontal piece that joins it.
  const at = new Map(cells.map((cell) => [`${cell.i},${cell.j}`, cell]));
  for (const cell of cells) {
    const up = at.get(`${cell.i},${cell.j + 1}`);
    if (up && zoneOf.get(up) !== zoneOf.get(cell)) lines.push({ kind: "seam", line: [toLL(f, cell.x - c / 2, cell.y + c / 2), toLL(f, cell.x + c / 2, cell.y + c / 2)] });
  }
  // Windbreak: the edge nearest its handle (by default the westernmost edge), when there is any windbreak.
  const strength = mixes.reduce((s, m) => s + m.windbreak, 0) / n;
  const mids = xy.map((p, i) => { const q = xy[(i + 1) % xy.length]!; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as [number, number]; });
  const target = edits.windAt ? toXY(f, edits.windAt) : mids.reduce((b, m) => (m[0] < b[0] ? m : b), mids[0]!);
  const e = mids.reduce((b, m, i) => (dist(m, target) < dist(mids[b]!, target) ? i : b), 0);
  // The hedge stands inside the area: moved in from its edge by half its width (plus a little) and kept off the corners.
  if (strength > 0) {
    const a = xy[e]!, b = xy[(e + 1) % xy.length]!, len = dist(a, b);
    if (len > 0.5) {
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      let nx = -uy, ny = ux;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (!inside(ring, f, mx + nx, my + ny)) { nx = -nx; ny = -ny; }
      const off = hedgeWidthM(strength) / 2 + 0.4, cut = Math.min(off, len / 2 - 0.1);
      lines.push({ kind: "wind", strength, line: [toLL(f, a[0] + ux * cut + nx * off, a[1] + uy * cut + ny * off), toLL(f, b[0] - ux * cut + nx * off, b[1] - uy * cut + ny * off)] });
    }
  }
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
export function pergolaParts(strip: Ring, lite = false): TreePart[] {
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
  // Lite (the photorealistic 3D, where every shape costs): posts about every 8 m and one see-through roof instead of slats.
  const posts = Math.max(2, Math.round(len / (lite ? 8 : 4)) + 1);
  for (let i = 0; i < posts; i++) {
    const s = inset + ((len - 2 * inset) * i) / (posts - 1);
    for (const t of [inset, dep - inset]) parts.push({ ring: box(s - 0.12, s + 0.12, t - 0.12, t + 0.12), base: 0, height: 2.9, color: PERGOLA_COLORS.post });
  }
  for (const t of [inset, dep - inset]) parts.push({ ring: box(0, len, t - 0.14, t + 0.14), base: 2.8, height: 3.1, color: PERGOLA_COLORS.beam });
  if (lite) { parts.push({ ring: box(0, len, 0, dep), base: 3.1, height: 3.25, color: `${PERGOLA_COLORS.slat}b3` }); return parts; }
  for (let s = 0.35; s < len - 0.2; s += 0.7) parts.push({ ring: box(s - 0.12, s + 0.12, 0, dep), base: 3.1, height: 3.25, color: PERGOLA_COLORS.slat });
  return parts;
}

/**
 * A pergola over any outline (a Pergolato zone as drawn): posts at every corner and along every edge (about every 4 m,
 * 8 m when `lite`), a beam along each edge (2.8–3.1 m) and a roof of the outline's very shape (3.1–3.25 m), light wood
 * and see-through so the shade under it shows.
 */
export function pergolaRingParts(ring: Ring, lite = false): TreePart[] {
  if (ring.length < 3) return [];
  const f = frameOf(ring), pts = ring.map((p) => toXY(f, p));
  const parts: TreePart[] = [];
  const square = (x: number, y: number, r: number): Ring => [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]].map(([a, b]) => toLL(f, a!, b!));
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!, len = dist(a, b);
    const n = Math.max(1, Math.round(len / (lite ? 8 : 4)));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      parts.push({ ring: square(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.12), base: 0, height: 2.9, color: PERGOLA_COLORS.post });
    }
    if (!lite && len > 0.5) {
      const nx = (-(b[1] - a[1]) / len) * 0.14, ny = ((b[0] - a[0]) / len) * 0.14;
      parts.push({ ring: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]].map(([x, y]) => toLL(f, x!, y!)), base: 2.8, height: 3.1, color: PERGOLA_COLORS.beam });
    }
  });
  parts.push({ ring, base: 3.1, height: 3.25, color: `${PERGOLA_COLORS.slat}b3` });
  return parts;
}

/**
 * Mowing stripes across a lawn for the 3D view: east–west lines every `spacing` m, cut to the lawn's outline (each
 * scanline split where it crosses the edges), at most `max` of them so a big lawn stays light.
 */
export function mowStripes(ring: Ring, spacing = 3, max = 24): Ring[] {
  if (ring.length < 3) return [];
  const f = frameOf(ring), pts = ring.map((p) => toXY(f, p));
  const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const step = Math.max(spacing, (y1 - y0) / max);
  const out: Ring[] = [];
  for (let y = y0 + step / 2; y < y1; y += step) {
    const xs: number[] = [];
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length]!;
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    });
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1]! - xs[k]! > 0.5) out.push([toLL(f, xs[k]! + 0.3, y), toLL(f, xs[k + 1]! - 0.3, y)]);
  }
  return out;
}

/** Vineyard 3D colours: the hedge of the windbreak and the shade net. */
export const VINE_3D = { hedge: "#2f6b2a", hedgeTop: "#3d8a35", net: "#1f2933" } as const;

/**
 * The windbreak in 3D: a hedge along its edge, a 1.6 m wide wall whose height follows its strength (1.8 m at 10 %,
 * up to 4 m at full), in two slabs, the top a lighter green.
 */
/** The hedge's width on the ground (m): 1,5 m for a light windbreak, up to 3 m at full strength. */
export const hedgeWidthM = (strength: number) => 1.5 + 1.5 * Math.min(1, Math.max(0, strength) / 100);

export function hedgeParts(edge: Ring, strength: number): TreePart[] {
  if (edge.length < 2 || strength <= 0) return [];
  const f = frameOf(edge);
  const [a, b] = edge.map((p) => toXY(f, p)) as [[number, number], [number, number]];
  const len = dist(a, b);
  if (len < 1) return [];
  const half = hedgeWidthM(strength) / 2;
  const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len, nx = -uy * half, ny = ux * half;
  const ring: Ring = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]].map(([x, y]) => toLL(f, x!, y!));
  const h = 1.8 + 2.2 * Math.min(1, strength / 100);
  return [{ ring, base: 0, height: h - 0.5, color: VINE_3D.hedge }, { ring, base: h - 0.5, height: h, color: VINE_3D.hedgeTop }];
}

/**
 * The shade net in 3D: a mesh of thin dark threads (every 1.2 m both ways) 2.2 m up over its strip, see-through
 * between them, held by posts at its corners.
 */
export function netParts(strip: Ring, lite = false): TreePart[] {
  if (strip.length < 4) return [];
  const f = frameOf(strip);
  const [a, b, , d] = strip.map((p) => toXY(f, p)) as Array<[number, number]>;
  const len = dist(a!, b!), dep = dist(a!, d!);
  if (len < 1 || dep < 1) return [];
  const ux = [(b![0] - a![0]) / len, (b![1] - a![1]) / len], vy = [(d![0] - a![0]) / dep, (d![1] - a![1]) / dep];
  const at = (s2: number, t: number): [number, number] => [a![0] + ux[0]! * s2 + vy[0]! * t, a![1] + ux[1]! * s2 + vy[1]! * t];
  const box = (s0: number, s1: number, t0: number, t1: number): Ring => [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)].map(([x, y]) => toLL(f, x, y));
  const parts: TreePart[] = strip.map((p) => ({ ring: crownRing(p, 0.1, 6), base: 0, height: 2.2, color: "#5b4a3a" }));
  // Lite (the photorealistic 3D): one see-through dark sheet instead of the threads.
  if (lite) { parts.push({ ring: box(0, len, 0, dep), base: 2.15, height: 2.2, color: `${VINE_3D.net}8c` }); return parts; }
  const t = 0.07, step = 1.2;
  for (let s2 = 0; s2 <= len + 1e-6; s2 += step) parts.push({ ring: box(s2 - t, s2 + t, 0, dep), base: 2.15, height: 2.2, color: VINE_3D.net });
  for (let t2 = 0; t2 <= dep + 1e-6; t2 += step) parts.push({ ring: box(0, len, t2 - t, t2 + t), base: 2.15, height: 2.2, color: VINE_3D.net });
  return parts;
}

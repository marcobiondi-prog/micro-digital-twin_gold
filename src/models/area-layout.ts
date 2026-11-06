import { ringAreaM2, ringContains, type Ring } from "./place-area";
import { sunPath, sunShare } from "./sun-exposure";
import { clipBox } from "./drape";

/**
 * The simulation drawn inside the area: where the piazza's trees, lawn and shade go, or how the vineyard's three zones,
 * drip lines, pestAnimal cloth and pestPlant sit. Automatic from the levers (counts and percentages), with optional hand
 * edits: a tree moved, the lawn's or the pestAnimal's centre moved, the pestPlant's side. Pure geometry in [lat, lng].
 */
export type LatLng = [number, number];
/**
 * `best`: the piazza laid out where the summer sun hits most (models/sun-exposure) instead of lawn west, shade east.
 * `onlyDrawn`: only what was drawn by hand — the Prato and Pergolato zones, the trees in the Alberi zones — and nothing
 * placed automatically around them.
 */
export type LayoutEdits = { trees?: Array<LatLng | null>; lawnAt?: LatLng | null; shadeAt?: LatLng | null; windAt?: LatLng | null; best?: boolean; onlyDrawn?: boolean };

/** `exact`: the very ring of a zone drawn by hand (a Prato or Pergolato zone), not a strip of grid cells. */
export type Patch = { ring: Ring; kind: "lawn" | "shade" | "zone" | "treat"; zone?: number; exact?: boolean };
export type Line = { line: Ring; kind: "drip" | "main" | "seam"; zone?: number };
/**
 * `sunny`: with `best`, the share of the area in the summer sun for most of the day (0–1), to say why. `lawnM2` /
 * `shadeM2`: the m² actually drawn as lawn and pergola; `lawnTarget` / `shadeTarget`: the m² the simulation counts
 * (the lever's share of the usable surface), so the map can say when there is no room for all of it.
 */
/** `misters`: every misting pole, those in the zones drawn for them first (`mistersInZones` of them), then the ones the app places. */
export type PiazzaLayout = { misters: LatLng[]; mistersInZones: number; trees: LatLng[]; patches: Patch[]; lawnAt: LatLng; shadeAt: LatLng; cell: number; sunny?: number; lawnM2: number; shadeM2: number; lawnTarget: number; shadeTarget: number };
export type VineLayout = { patches: Patch[]; lines: Line[]; zones: LatLng[]; traps: LatLng[] };

/** The shade one tree gives in the simulation (m², models/project-summary) and so its crown on the map: about 6,2 m wide. */
export const TREE_SHADE_M2 = 30;
export const TREE_RADIUS_M = Math.sqrt(TREE_SHADE_M2 / Math.PI);
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
  const grid = (test: (x: number, y: number) => boolean) => {
    let t = Math.sqrt(room / n), out: Array<[number, number]> = [];
    for (let k = 0; k < 60; k++) {
      out = [];
      for (let y = box.minY + t / 2; y <= box.maxY; y += t) for (let x = box.minX + t / 2; x <= box.maxX; x += t) if (test(x, y)) out.push([x, y]);
      if (out.length >= n || t < 0.8) break;
      t *= 0.88;
    }
    return out;
  };
  for (const margin of [CROWN_REACH_M, 3, 2, 1, 0]) {
    const offs = ring8(margin);
    fits = (x: number, y: number) => offs.every(([dx, dy]) => allowed(x + dx!, y + dy!) && inside(ring, f, x + dx!, y + dy!));
    spots = grid(fits);
    // A trees zone too small for that many whole crowns: the trunks still stand inside it, each on its own spot, with
    // the crown allowed past the zone's edge (never past the area's), instead of all the trees piled on one spot.
    if (spots.length < n) {
      const loose = (x: number, y: number) => allowed(x, y) && offs.every(([dx, dy]) => inside(ring, f, x + dx!, y + dy!));
      const extra = grid(loose).filter(([x, y]) => spots.every(([a, b]) => Math.hypot(a - x, b - y) > 0.5));
      spots = [...spots, ...extra];
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

export function piazzaLayout(ring: Ring, trees: number, lawn: number, shade: number, edits: LayoutEdits = {}, zones: InnerZone[] = [], misters = 0): PiazzaLayout | null {
  if (ring.length < 3) return null;
  const grid = cellsOf(ring), { f, c, minX, maxX, minY, maxY } = grid;
  const isFree = inZone(f, zones, "libera"), isLawn = inZone(f, zones, "prato"), isShade = inZone(f, zones, "ombra"), isTrees = inZone(f, zones, "alberi"), isMist = inZone(f, zones, "nebulizzatori");
  const cells = grid.cells.filter((x) => !isFree(x.x, x.y));
  const mistZones = zones.filter((z) => z.kind === "nebulizzatori" && z.ring.length >= 3), mistCells = cells.filter((x) => isMist(x.x, x.y));
  if (!cells.length) return null;
  const cy = (minY + maxY) / 2;
  // By default the lawn gathers on the west side and the shade on the east; a hand edit moves either centre.
  const lawnAt = edits.lawnAt ? toXY(f, edits.lawnAt) : ([minX + (maxX - minX) * 0.25, cy] as [number, number]);
  const shadeAt = edits.shadeAt ? toXY(f, edits.shadeAt) : ([minX + (maxX - minX) * 0.75, cy] as [number, number]);
  // Cells gathered round a centre as a compact block shaped like the area (a square-ish rectangle in its proportions),
  // not a round blob: pergolas and beds come out as tidy rectangles instead of stepped strips.
  const ax = Math.max(1, (maxX - minX) / 2), ay = Math.max(1, (maxY - minY) / 2);
  const block = (q: Cell, p: [number, number]) => Math.max(Math.abs(q.x - p[0]) / ax, Math.abs(q.y - p[1]) / ay);
  const byDist = (p: [number, number]) => (a: Cell, b: Cell) => block(a, p) - block(b, p) || dist([a.x, a.y], p) - dist([b.x, b.y], p);
  // The m² the simulation counts: the lever's share of the usable surface (the area less the zones left free). The
  // zones drawn for lawn or pergola count with their own surface; the rest is made of whole cells (c² each).
  const zoneM2 = (kind: string) => zones.filter((z) => z.kind === kind && z.ring.length >= 3).reduce((t, z) => t + ringAreaM2(z.ring), 0);
  const usable = Math.max(0, ringAreaM2(ring) - zoneM2("libera"));
  const lawnTarget = (Math.max(0, Math.min(100, lawn)) / 100) * usable, shadeTarget = (Math.max(0, Math.min(100, shade)) / 100) * usable;
  const exactLawnM2 = lawnTarget > 0 ? zoneM2("prato") : 0, exactShadeM2 = shadeTarget > 0 ? zoneM2("ombra") : 0;
  // The zones drawn for lawn or pergola come first (only while the lever has some), then the rest of the share around its centre.
  // "Solo quello disegnato": the zones alone, whatever the levers say (they are set from the zones).
  const only = !!edits.onlyDrawn;
  const fixedLawn = lawnTarget > 0 || only ? cells.filter((x) => isLawn(x.x, x.y)) : [];
  const fixedShade = shadeTarget > 0 || only ? cells.filter((x) => isShade(x.x, x.y) && !fixedLawn.includes(x)) : [];
  // With a zone drawn for it, the rest of the share is laid around it only when it is more than one lever step (10 %
  // of the usable surface): the lever raised in 10 % steps to fill a zone no longer spills strips out of the zone.
  const restOf = (target: number, exact: number) => { const r = Math.max(0, target - exact); return exact > 0 && r < usable * 0.1 ? 0 : r; };
  const nLawn = fixedLawn.length + (only ? 0 : Math.round(restOf(lawnTarget, exactLawnM2) / (c * c)));
  const nShade = fixedShade.length + (only ? 0 : Math.round(restOf(shadeTarget, exactShadeM2) / (c * c)));
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
  const treeZones = zones.filter((z) => z.kind === "alberi" && z.ring.length >= 3);
  const n = only && !treeZones.length ? 0 : Math.max(0, Math.round(trees)), box = { minX, maxX, minY, maxY };
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
  // A tree moved by hand goes where it was put — even out of a trees zone — as long as its whole crown stays inside the
  // area and its trunk is not in a zone left free.
  const crown = Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6) * CROWN_REACH_M, Math.sin((i * Math.PI) / 6) * CROWN_REACH_M]);
  const handFits = (x: number, y: number) => !isFree(x, y) && inside(ring, f, x, y) && crown.every(([dx, dy]) => inside(ring, f, x + dx!, y + dy!));
  let room1: Array<[number, number]> | null = null;
  const keepInside = (p: LatLng): LatLng => {
    const [x, y] = toXY(f, p);
    if (handFits(x, y)) return p;
    room1 ??= (() => { const out: Array<[number, number]> = []; for (let yy = minY; yy <= maxY; yy += 1) for (let xx = minX; xx <= maxX; xx += 1) if (handFits(xx, yy)) out.push([xx, yy]); return out; })();
    if (!room1.length) return p;
    const best = room1.reduce((b, q) => (dist(q, [x, y]) < dist(b, [x, y]) ? q : b), room1[0]!);
    return toLL(f, best[0], best[1]);
  };
  const placed = auto.map((p, i) => { const e = edits.trees?.[i]; return e ? keepInside(e) : toLL(f, p[0], p[1]); });
  const rest = cells.filter((x) => !new Set(lawnCells).has(x));
  const centre = (list: Cell[], fallback: [number, number]): [number, number] => list.length ? [list.reduce((t, q) => t + q.x, 0) / list.length, list.reduce((t, q) => t + q.y, 0) / list.length] : fallback;
  const autoLawn = lawnCells.filter((x) => !fixedLawn.includes(x)).length, autoShade = shadeCells.filter((x) => !fixedShade.includes(x)).length;
  // Misting poles: the zones drawn for them hold about one every 40 m² each (at least one a zone), the rest of the
  // lever the app places itself as before (under and near the pergolas, else on the paving), off those zones.
  const nMist = Math.max(0, Math.round(misters));
  const zoneCap = mistZones.reduce((t, z) => t + Math.max(1, Math.round(ringAreaM2(z.ring) / 40)), 0);
  const inZones = Math.min(nMist, zoneCap);
  const trunks = n > 0 ? placed.map((p) => toXY(f, p)) : [];
  const zoneMisters: LatLng[] = !inZones ? [] : mistCells.length
    ? misterSpots(f, c, trunks, mistCells, mistCells, inZones)
    : mistZones.slice(0, inZones).map((z) => { const xy = z.ring.map((p) => toXY(f, p)); return toLL(f, xy.reduce((s2, p) => s2 + p[0], 0) / xy.length, xy.reduce((s2, p) => s2 + p[1], 0) / xy.length); });
  const autoMisters = misterSpots(f, c, trunks, shadeCells.filter((x) => !isMist(x.x, x.y)), cells.filter((x) => !lawnCells.includes(x) && !isLawn(x.x, x.y) && !isMist(x.x, x.y)), nMist - zoneMisters.length);
  return {
    misters: [...zoneMisters, ...autoMisters], mistersInZones: zoneMisters.length,
    trees: placed, cell: c,
    lawnM2: Math.round((fixedLawn.length ? zoneM2("prato") : 0) + autoLawn * c * c), shadeM2: Math.round((fixedShade.length ? zoneM2("ombra") : 0) + autoShade * c * c),
    lawnTarget: Math.round(lawnTarget), shadeTarget: Math.round(shadeTarget),
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

export type ZoneMix = { irrigation: number; pestAnimal: number; pestPlant: number };

/**
 * The vineyard inside the area: three zones side by side (west → east). Each zone, with irrigation, gets a main pipe
 * (collettore) along its western end and a drip line on its rows joined to it (every row from +16 %, else one every
 * `step` rows); with defence against animal pests, traps spread evenly over it (one every ~250 m² at full defence, at
 * least one); with defence against plant pests, that share of its rows treated, from the south.
 */
export function vineLayout(ring: Ring, mixes: ZoneMix[], _edits: LayoutEdits = {}, inner: InnerZone[] = []): VineLayout | null {
  if (ring.length < 3) return null;
  const grid = cellsOf(ring), { f, c } = grid;
  // Nothing grows in a zone left free: its cells are not part of the vineyard's zones.
  const isFree = inZone(f, inner, "libera");
  const cells = grid.cells.filter((x) => !isFree(x.x, x.y));
  if (!cells.length) return null;
  const n = Math.max(1, mixes.length);
  const sorted = [...cells].sort((a, b) => a.x - b.x || a.y - b.y);
  const zoneOf = new Map<Cell, number>(sorted.map((cell, k) => [cell, Math.min(n - 1, Math.floor((k * n) / sorted.length))]));
  const patches: Patch[] = [], lines: Line[] = [], zones: LatLng[] = [], traps: LatLng[] = [];
  for (let z = 0; z < n; z++) {
    const mine = cells.filter((x) => zoneOf.get(x) === z), mix = mixes[z] ?? { irrigation: 0, pestAnimal: 0, pestPlant: 0 };
    if (!mine.length) continue;
    patches.push(...strips(f, c, mine, "zone", z));
    const mx = mine.reduce((s, x) => s + x.x, 0) / mine.length, my = mine.reduce((s, x) => s + x.y, 0) / mine.length;
    zones.push(toLL(f, mx, my));
    const rows = new Map<number, Cell[]>();
    for (const cell of mine) rows.set(cell.j, [...(rows.get(cell.j) ?? []), cell]);
    // Plant pests: that share of the zone's rows treated, the southern rows first.
    const treated = [...mine].sort((a, b) => a.y - b.y || a.x - b.x).slice(0, Math.round((Math.max(0, Math.min(100, mix.pestPlant)) / 100) * mine.length));
    patches.push(...strips(f, c, treated, "treat", z));
    // Irrigation: a main pipe along the zone's western end and a drip line on the rows, joined to it.
    if (mix.irrigation > 0) {
      const step = mix.irrigation >= 16 ? 1 : Math.max(1, Math.round(5 - mix.irrigation / 5));
      const fed: number[] = [];
      for (const [j, row] of [...rows].sort((a, b) => a[0] - b[0])) {
        if (j % step) continue;
        const x0 = Math.min(...row.map((r) => r.x)) - c / 2.5, x1 = Math.max(...row.map((r) => r.x)) + c / 2.5;
        lines.push({ kind: "drip", zone: z, line: [toLL(f, x0, row[0]!.y), toLL(f, x1, row[0]!.y)] });
        fed.push(row[0]!.y);
      }
      if (fed.length) {
        const west = Math.min(...mine.map((x) => x.x)) - c / 2.5;
        const y0 = Math.min(...fed), y1 = Math.max(...fed);
        lines.push({ kind: "main", zone: z, line: y1 - y0 > 0.5 ? [toLL(f, west, y0), toLL(f, west, y1)] : [toLL(f, west, y0 - c / 3), toLL(f, west, y0 + c / 3)] });
      }
    }
    // Animal pests: traps on a regular grid over the zone, half a step in from its edges (one every ~250 m² at full
    // defence, at least one, at the zone's middle).
    if (mix.pestAnimal > 0) {
      const want = Math.max(1, Math.round((mine.length * c * c * (mix.pestAnimal / 100)) / 250));
      const zoneM = mine.length * c * c;
      let k = Math.max(1, Math.round(Math.sqrt(zoneM / want) / c));
      let picked: Cell[] = [];
      for (let tries = 0; tries < 6; tries++) {
        const i0 = Math.min(...mine.map((x) => x.i)), j0 = Math.min(...mine.map((x) => x.j)), h = Math.floor(k / 2);
        picked = mine.filter((x) => (x.i - i0 - h) % k === 0 && (x.j - j0 - h) % k === 0 && (x.i - i0 - h) >= 0 && (x.j - j0 - h) >= 0);
        if (picked.length >= want * 0.75 || k === 1) break;
        k -= 1;
      }
      if (!picked.length) picked = [mine.reduce((b, x) => (dist([x.x, x.y], [mx, my]) < dist([b.x, b.y], [mx, my]) ? x : b), mine[0]!)];
      for (const q of picked.slice(0, Math.max(1, Math.round(want * 1.25)))) traps.push(toLL(f, q.x, q.y));
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
  return { patches, lines, zones, traps };
}

/**
 * Where the misters stand: first along the pergolas (people gather in their shade, the mist cools it further), then on
 * the paved cells spread over the area, each at least 5 m from the others and 2 m from a trunk while there is room.
 */
function misterSpots(f: Frame, c: number, trunks: Array<[number, number]>, shade: Cell[], paved: Cell[], n: number): LatLng[] {
  if (n <= 0) return [];
  // Spread evenly: each next pole on the spot farthest from those already placed (a pergola spot counts 4 m nearer,
  // so the shade gets them first), never within 2 m of a trunk while there is another spot.
  const inShade = new Set(shade);
  // Where people stop: under the pergolas when there are enough of them, else also the paving within 8 m of them;
  // with no pergola, the paving — never the area's very corners (each pole a cell away from the empty edge).
  const nearShade = paved.filter((x) => !inShade.has(x) && shade.some((q) => dist([x.x, x.y], [q.x, q.y]) <= 8));
  const inner = paved.filter((x) => paved.filter((q) => Math.abs(q.x - x.x) <= c * 1.01 && Math.abs(q.y - x.y) <= c * 1.01).length >= 9);
  const all = shade.length >= n * 2 ? shade : shade.length ? [...shade, ...nearShade] : inner.length >= n ? inner : paved;
  const clear = all.filter((x) => trunks.every((t) => dist([x.x, x.y], t) >= 2));
  const cand = clear.length >= n ? clear : all;
  if (!cand.length) return [];
  const cx = cand.reduce((s, q) => s + q.x, 0) / cand.length, cy = cand.reduce((s, q) => s + q.y, 0) / cand.length;
  const pick: Array<[number, number]> = [];
  const first = [...cand].sort((a, b) => Number(inShade.has(b)) - Number(inShade.has(a)) || dist([a.x, a.y], [cx, cy]) - dist([b.x, b.y], [cx, cy]))[0]!;
  pick.push([first.x, first.y]);
  while (pick.length < n) {
    let best: Cell | null = null, bestScore = -Infinity;
    for (const q of cand) {
      const d = Math.min(...pick.map((p) => dist([q.x, q.y], p)));
      if (d < 0.5) continue;
      const score = d + (inShade.has(q) ? 4 : 0);
      if (score > bestScore) { bestScore = score; best = q; }
    }
    if (!best) { const q = pick[pick.length % pick.length]!; pick.push([q[0] + c / 4, q[1] + c / 4]); continue; }
    pick.push([best.x, best.y]);
  }
  return pick.slice(0, n).map(([x, y]) => toLL(f, x, y));
}

/** The heights shadows are cast from: a pergola's roof, a tree's crown from its lowest branches to its top. */
export const PERGOLA_ROOF_M = 3.2;
const CROWN_LOW_M = 2.5, CROWN_HIGH_M = 9;
export type SunPos = { az: number; alt: number };
/** How far (m, east and north) the shadow of a point `h` m up falls; capped at 5 × h when the sun is low. */
const castBy = (h: number, sun: SunPos): [number, number] => {
  const d = Math.min(h / Math.tan(sun.alt), h * 5);
  return [-Math.sin(sun.az) * d, -Math.cos(sun.az) * d];
};
const moveRing = (ring: Ring, dx: number, dy: number): Ring => ring.map(([lat, lng]) => [lat + dy / M, lng + dx / (M * Math.cos((lat * Math.PI) / 180))] as LatLng);
/** The convex hull of some points (Andrew's monotone chain). */
function hull(pts: Ring): Ring {
  const p = [...pts].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const cross = (o: LatLng, a: LatLng, b: LatLng) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const half = (list: Ring) => { const h: LatLng[] = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return [...half(p), ...half([...p].reverse())];
}

/**
 * The shadows the piazza casts with the sun at `sun` (the simulation's season and hour, models/sun-shadow): each pergola
 * roof's outline moved away from the sun by its height over the sun's tangent; each tree's crown stretched from its
 * lowest branches' shadow to its top's, plus its trunk's. None with the sun down.
 */
export function piazzaShadows(l: PiazzaLayout, sun: SunPos | null): Ring[] {
  if (!sun || sun.alt <= 0.05) return [];
  const out: Ring[] = [];
  const [px, py] = castBy(PERGOLA_ROOF_M, sun);
  for (const p of l.patches) if (p.kind === "shade") out.push(moveRing(p.ring, px, py));
  const [lx, ly] = castBy(CROWN_LOW_M, sun), [hx, hy] = castBy(CROWN_HIGH_M, sun);
  const len = Math.hypot(lx, ly);
  for (const t of l.trees) {
    const crown = crownRing(t, TREE_RADIUS_M, 16);
    out.push(hull([...moveRing(crown, lx, ly), ...moveRing(crown, hx, hy)]));
    // The trunk: a thin band from its foot to the crown's shadow.
    if (len > 0.3) {
      const nx = (-ly / len) * 0.2, ny = (lx / len) * 0.2;
      out.push(moveRing([t, t, t, t], 0, 0).map((q, i) => moveRing([q], (i < 2 ? 0 : lx) + (i === 0 || i === 3 ? nx : -nx), (i < 2 ? 0 : ly) + (i === 0 || i === 3 ? ny : -ny))[0]!));
    }
  }
  return out;
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
  // The widest tier is the crown the simulation counts (TREE_RADIUS_M), give or take 5 %, so it stays inside the area.
  const r = radius * (0.95 + ((seed >> 3) % 5) * 0.025);
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

/** Colours of the aiuole e ciottoli in 3D: pebble ground, two grass greens and the flower spots. */
export const BEDS_3D = { pebbles: "#c8b99c", stones: ["#efe8da", "#a39684", "#d9c9a8", "#8c8173", "#f5f1e8"], grass: ["#4f9a3e", "#5aa646"], edge: "#3a7a2c", flowers: ["#f472b6", "#facc15", "#f8fafc", "#c084fc", "#fb923c"] } as const;
/** Heights of the beds: thin flat slabs over the area's veil (0,35 m), the shadows (0,25 m) and the zones in Google 3D, so nothing covers them. */
export const BED_H = { pebbleBase: 0.55, pebble: 0.58, grassBase: 0.6, grass: 0.65, flowerBase: 0.65, flower: 0.7 } as const;

/**
 * Aiuole e ciottoli in 3D, drawn like the 2D pattern and following the outline traced: beds of grass 1,2 m wide with
 * 0,4 m pebble paths between them run parallel to the longest side of the largest patch (a zone drawn by hand: its own
 * main side; the automatic strips: their rows), cut exactly to the patches' outline — paths made of stones only (round
 * pebbles in white, sand, grey and brown), no ground sheet — with small flowers scattered on the grass. The work is done
 * in a local metre frame turned onto that side: the patches are cut into bands across it (clipped to them, so beds and
 * paths follow every edge of the shape), the pieces of rows stacked over the same band joined into one; with `area`
 * (the drawn outline) a piece reaching past it is cut into 0,5 m slices and only those wholly inside stay. The band pitch
 * grows while there would be more than `maxBeds` beds. Fixed pseudo-random flowers and stones, the same on every device.
 */
/**
 * `opts.bedM`: the beds' width in metres (paths a third of it, stones and flowers in proportion) — the 2D map asks for
 * a fixed width on screen, so the stripes keep their size at every zoom; `detail` shrinks the pebbles and flowers
 * against the beds (pebbles packed closer, more rows on a path); `maxStones` / `maxFlowers` cap the small parts.
 */
export function bedParts(patches: Ring[], maxBeds = 50, area?: Ring, opts: { bedM?: number; detail?: number; maxStones?: number; maxFlowers?: number } = {}): { beds: Ring[]; parts: TreePart[] } {
  const sc = (opts.bedM ?? 1.2) / 1.2, d = opts.detail ?? 1, maxStones = opts.maxStones ?? 140, maxFlowers = opts.maxFlowers ?? 36;
  const rings = patches.filter((r) => r.length >= 3);
  if (!rings.length) return { beds: [], parts: [] };
  const f = frameOf(rings.flat());
  // The direction of the beds: from the longest side of the largest patch.
  const big = rings.reduce((m, r) => (ringAreaM2(r) > ringAreaM2(m) ? r : m), rings[0]!).map((p) => toXY(f, p));
  let ang = Math.PI / 2, best = -1;
  big.forEach((p, i) => { const q = big[(i + 1) % big.length]!, d = dist(p, q); if (d > best) { best = d; ang = Math.atan2(q[1] - p[1], q[0] - p[0]); } });
  // Vertical on the map: of the zone's two side directions (its longest side and the one square to it), the one
  // nearer north–south, so the grass runs up and down the screen while still lying square to the outline traced.
  if (Math.abs(Math.sin(ang)) < Math.abs(Math.cos(ang))) ang += Math.PI / 2;
  const cs = Math.cos(ang), sn = Math.sin(ang);
  // [u, v]: u along the beds, v across them; and back to lat/lng.
  const toUV = (p: LatLng): LatLng => { const [x, y] = toXY(f, p); return [x * cs + y * sn, -x * sn + y * cs]; };
  const fromUV = ([u, v]: LatLng): LatLng => toLL(f, u * cs - v * sn, u * sn + v * cs);
  const uvRings = rings.map((r) => r.map(toUV));
  const us = uvRings.flat().map((p) => p[0]), vs = uvRings.flat().map((p) => p[1]);
  const u0 = Math.min(...us) - 1, u1 = Math.max(...us) + 1, v0 = Math.min(...vs), v1 = Math.max(...vs);
  const inArea = (p: LatLng) => !area || area.length < 3 || ringContains(area, p[0], p[1]);
  const uvInside = (r: LatLng[]) => r.every((p) => inArea(fromUV(p)));
  type R4 = { lo: number; hi: number; a: number; b: number };
  const rect = (r: R4): LatLng[] => [[r.lo, r.a], [r.lo, r.b], [r.hi, r.b], [r.hi, r.a]];
  const keepInside = (r: R4): R4[] => {
    if (uvInside(rect(r))) return [r];
    const out: R4[] = [];
    const st = Math.max(0.1, 0.5 * sc);
    for (let lo = r.lo; lo < r.hi - 1e-6; lo += st) {
      const hi = Math.min(r.hi, lo + st), sl = { ...r, lo, hi };
      if (!uvInside(rect(sl))) continue;
      const last = out[out.length - 1];
      if (last && Math.abs(last.hi - lo) < 1e-6) last.hi = hi; else out.push(sl);
    }
    return out;
  };
  /** The patches clipped to the band v ∈ [w0, w1] (uv metres), row pieces joined, kept inside the area. */
  const band = (w0: number, w1: number): LatLng[][] => {
    if (w1 - w0 < 0.02 * sc) return [];
    const pieces = uvRings.map((r) => clipBox(r, u0, u1, w0, w1)).filter((q) => q.length >= 3 && Math.abs(q.reduce((t, p, i) => { const n = q[(i + 1) % q.length]!; return t + p[0] * n[1] - n[0] * p[1]; }, 0)) / 2 > 0.05);
    const isRect = (q: LatLng[]) => q.length === 4 && new Set(q.map((p) => p[0].toFixed(4))).size === 2 && new Set(q.map((p) => p[1].toFixed(4))).size === 2;
    const rects: R4[] = pieces.filter(isRect).map((q) => ({ lo: Math.min(...q.map((p) => p[0])), hi: Math.max(...q.map((p) => p[0])), a: Math.min(...q.map((p) => p[1])), b: Math.max(...q.map((p) => p[1])) })).sort((x, y) => x.lo - y.lo);
    const merged: R4[] = [];
    for (const r of rects) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.hi - r.lo) < 1e-3 && Math.abs(last.a - r.a) < 1e-3 && Math.abs(last.b - r.b) < 1e-3) last.hi = r.hi;
      else merged.push({ ...r });
    }
    return [...merged.flatMap(keepInside).map(rect), ...pieces.filter((q) => !isRect(q) && uvInside(q))];
  };
  const layout = (bed: number, path: number) => {
    const pitch = bed + path, beds: LatLng[][] = [], paths: LatLng[][] = [];
    const widthM = v1 - v0, n = Math.max(1, Math.round((widthM + path) / pitch));
    const off = (widthM - (n * pitch - path)) / 2;
    paths.push(...band(v0, v0 + Math.max(0, off)));
    for (let i = 0; i < n; i++) {
      const w0 = v0 + off + i * pitch, w1 = w0 + bed;
      beds.push(...band(Math.max(v0, w0), Math.min(v1, w1)));
      paths.push(...band(w1, i < n - 1 ? w1 + path : v1));
    }
    return { beds, paths, path };
  };
  let bed = 1.2 * sc, path = 0.4 * sc, lay = layout(bed, path);
  for (let k = 0; lay.beds.length > maxBeds && k < 8; k++) { bed *= 1.3; path *= 1.15; lay = layout(bed, path); }
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inUV = (r: LatLng[], p: LatLng) => ringContains(r, p[0], p[1]);
  const discUV = (c: LatLng, rad: number, n: number): LatLng[] => Array.from({ length: n }, (_, i) => [c[0] + Math.cos((2 * Math.PI * i) / n) * rad, c[1] + Math.sin((2 * Math.PI * i) / n) * rad] as LatLng);
  const beds = lay.beds.map((r) => r.map(fromUV));
  const parts: TreePart[] = beds.map((ring, n) => ({ ring, base: BED_H.grassBase, height: BED_H.grass, color: BEDS_3D.grass[n % 2]! }));
  // Pebbles along every path, in rows across it (a new row every 0,25 m), spaced along it so there are at most 140.
  const pathLen = lay.paths.reduce((t, r) => t + Math.max(...r.map((p) => p[0])) - Math.min(...r.map((p) => p[0])), 0);
  const along = Math.max(0.22 * sc * d, pathLen / maxStones);
  let stones = 0;
  for (const r of lay.paths) {
    const lo = Math.min(...r.map((p) => p[0])), hi = Math.max(...r.map((p) => p[0])), a = Math.min(...r.map((p) => p[1])), b = Math.max(...r.map((p) => p[1]));
    const cols = Math.max(1, Math.floor((b - a) / (0.25 * sc * d)));
    for (let ci = 0; ci < cols && stones < maxStones; ci++) {
      const v = a + (b - a) * ((ci + 0.5) / cols);
      for (let u = lo + along * (ci % 2 ? 0.75 : 0.25); u < hi && stones < maxStones; u += along) {
        const disc = discUV([u + (rnd() - 0.5) * along * 0.3, v], (0.09 + rnd() * 0.04) * sc * d, 7);
        if (!disc.every((p) => inUV(r, p))) continue;
        parts.push({ ring: disc.map(fromUV), base: BED_H.flowerBase, height: BED_H.flower, color: BEDS_3D.stones[(stones + Math.floor(rnd() * 3)) % BEDS_3D.stones.length]! });
        stones++;
      }
    }
  }
  // Small flowers on the grass, a few per bed, at most 36 in all.
  let flowers = 0;
  for (const [n, r] of lay.beds.entries()) {
    const lo = Math.min(...r.map((p) => p[0])), hi = Math.max(...r.map((p) => p[0])), a = Math.min(...r.map((p) => p[1])), b = Math.max(...r.map((p) => p[1]));
    const want = Math.min(4, Math.max(1, Math.round(((hi - lo) * (b - a)) / (8 * sc * sc))));
    for (let k = 0; k < want && flowers < maxFlowers; k++) {
      const disc = discUV([lo + rnd() * (hi - lo), a + rnd() * (b - a)], (0.18 + rnd() * 0.07) * sc * d, 8);
      if (!disc.every((p) => inUV(r, p))) continue;
      parts.push({ ring: disc.map(fromUV), base: BED_H.flowerBase, height: BED_H.flower, color: BEDS_3D.flowers[(n + k) % BEDS_3D.flowers.length]! });
      flowers++;
    }
  }
  return { beds, parts };
}

/** Vineyard 3D colours: the traps against animal pests (a yellow sticky box on a post). */
export const VINE_3D = { trap: "#facc15", post: "#5b4a3a" } as const;

/** A trap in 3D: a thin post 1,4 m tall with a small yellow box on top. */
export function trapParts(at: LatLng): TreePart[] {
  return [
    { ring: crownRing(at, 0.05, 6), base: 0, height: 1.4, color: VINE_3D.post },
    { ring: crownRing(at, 0.22, 4), base: 1.4, height: 1.75, color: VINE_3D.trap },
  ];
}

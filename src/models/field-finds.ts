import { useSyncExternalStore } from "react";
import type { ArFocus, ArKind } from "@/models/ar-focus";
import type { ScanRecord } from "@/models/ar-scan-log";

/**
 * What the AI camera's «Rileva» found and the person added to the project («Aggiungi al progetto»): a point on the
 * map (the phone's position moved along the compass heading by the estimated distance) with what the scan said.
 * Kept on this device (localStorage mdt-field-finds-v1), per flow, at most MAX_FINDS each.
 * Trees become «already in the area» for the piazza's layout (interventions keep off them); vineyard finds are
 * shown on the zone they fall in.
 */
export type FindKind = Exclude<ArFocus, "auto">;
export type FieldFind = {
  id: string;
  at: string;
  flow: ArKind;
  kind: FindKind;
  lat: number;
  lng: number;
  /** How the point was placed: GPS + compass (+ distance), GPS only, or the place's point when there was no fix. */
  placed: "gps-heading" | "gps" | "place";
  /** GPS accuracy in metres, when known. */
  accuracy: number | null;
  /** Plain title shown on the map: the species, the soil, the vine's state. */
  title: string;
  /** One line of what the scan said. */
  detail: string;
  /** Species name (trees, leaves), when recognised. */
  species: string | null;
  /** Shade of one specimen in m², when estimated. */
  shadeM2: number | null;
  /** Crown diameter in metres used for the circle on the map (trees). */
  crownM: number | null;
  /** Soil label and permeability (ground and inter-row). */
  soil: string | null;
  /** A small JPEG of the scan (data URL), when there was one. */
  thumb: string | null;
  /** The scan record it came from. */
  scanId: string;
};

export const MAX_FINDS = 120;
const KEY = "mdt-field-finds-v1";
const FIND_KINDS: readonly FindKind[] = ["tree", "ground", "leaf", "canopy", "interrow"];

let state: FieldFind[] | null = null;
const subs = new Set<() => void>();
const EMPTY: FieldFind[] = [];

const isFind = (v: unknown): v is FieldFind => {
  const f = v as Partial<FieldFind> | null;
  return !!f && typeof f.id === "string" && typeof f.at === "string" && (f.flow === "urban" || f.flow === "vineyard")
    && FIND_KINDS.includes(f.kind as FindKind) && Number.isFinite(f.lat) && Number.isFinite(f.lng) && typeof f.title === "string";
};
function read(): FieldFind[] {
  if (state) return state;
  try {
    const raw: unknown = JSON.parse(typeof localStorage === "undefined" ? "[]" : localStorage.getItem(KEY) ?? "[]");
    state = Array.isArray(raw) ? raw.filter(isFind) : [];
  } catch { state = []; }
  return state;
}
function write(next: FieldFind[]) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* memory only */ }
  cache.clear();
  subs.forEach((f) => f());
}
const cache = new Map<ArKind, FieldFind[]>();
export function fieldFinds(flow: ArKind): FieldFind[] {
  const hit = cache.get(flow);
  if (hit) return hit;
  const list = read().filter((f) => f.flow === flow);
  cache.set(flow, list.length ? list : EMPTY);
  return cache.get(flow)!;
}
export function useFieldFinds(flow: ArKind): FieldFind[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => fieldFinds(flow), () => EMPTY);
}
export function addFind(f: FieldFind) {
  const others = read().filter((x) => x.id !== f.id && x.scanId !== f.scanId);
  const sameFlow = others.filter((x) => x.flow === f.flow);
  const keep = sameFlow.length >= MAX_FINDS ? others.filter((x) => x.id !== sameFlow[0]!.id) : others;
  write([...keep, f]);
}
export function removeFind(id: string) { write(read().filter((f) => f.id !== id)); }
export function moveFind(id: string, lat: number, lng: number) {
  write(read().map((f) => (f.id === id ? { ...f, lat, lng } : f)));
}
export function hasFindFor(scanId: string): boolean { return read().some((f) => f.scanId === scanId); }

/** A point `dist` metres from (lat, lng) towards `headingDeg` (0 = north, clockwise). */
export function offsetLatLng(lat: number, lng: number, headingDeg: number, dist: number): [number, number] {
  const r = (headingDeg * Math.PI) / 180;
  const dN = Math.cos(r) * dist, dE = Math.sin(r) * dist;
  return [lat + dN / 111_320, lng + dE / (111_320 * Math.cos((lat * Math.PI) / 180))];
}

/** How far away the thing scanned usually is, in metres: a tree is framed whole, the ground and a leaf are close. */
export const SCAN_DISTANCE_M: Record<FindKind, number> = { tree: 6, ground: 2, leaf: 0.3, canopy: 2.5, interrow: 2 };

export type FixInput = { lat: number; lng: number; accuracy: number | null; heading: number | null } | null;

/** Builds the find of a scan record from the phone's fix (or the place's point without one). */
export function findFromScan(rec: ScanRecord, kind: FindKind, fix: FixInput, place: { lat: number; lng: number }, thumb: string | null, now = new Date()): FieldFind {
  let lat = place.lat, lng = place.lng;
  let placed: FieldFind["placed"] = "place";
  if (fix) {
    lat = fix.lat; lng = fix.lng; placed = "gps";
    if (fix.heading !== null && Number.isFinite(fix.heading)) {
      [lat, lng] = offsetLatLng(fix.lat, fix.lng, fix.heading, SCAN_DISTANCE_M[kind]);
      placed = "gps-heading";
    }
  }
  const sp = rec.species;
  const soil = rec.soil;
  const crownM = sp?.shade ? Math.round(2 * Math.sqrt(sp.shade / Math.PI) * 10) / 10 : kind === "tree" ? 6 : null;
  const title = sp?.commonName ?? (soil ? `Suolo: ${soil.label}` : rec.target);
  const detail = sp
    ? [sp.scientificName, sp.shade ? `ombra ≈ ${sp.shade} m²` : null].filter(Boolean).join(" · ")
    : soil
      ? `permeabilità ${soil.permeability} · ${soil.plantable ? "si può piantare" : "non adatta a piantare"}`
      : rec.result;
  return {
    id: `find-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: now.toISOString(), flow: rec.kind, kind, lat, lng, placed, accuracy: fix?.accuracy ?? null,
    title, detail, species: sp ? sp.commonName : null, shadeM2: sp?.shade ?? null, crownM: kind === "tree" ? crownM : null,
    soil: soil ? `${soil.label} · permeabilità ${soil.permeability}` : null, thumb, scanId: rec.id,
  };
}

/** Plain words for how precise the point is. */
export function placedText(f: FieldFind): string {
  const acc = f.accuracy !== null ? ` (±${Math.round(f.accuracy)} m)` : "";
  return f.placed === "gps-heading" ? `Posizione dal GPS e dalla bussola${acc}` : f.placed === "gps" ? `Posizione dal GPS${acc}` : "Posizione del luogo: spostalo sulla mappa";
}

/** "2 alberi · 1 suolo" for a list of finds. */
export function findsCountText(finds: readonly FieldFind[]): string {
  const names: Record<FindKind, [string, string]> = { tree: ["albero", "alberi"], ground: ["suolo", "suoli"], leaf: ["foglia", "foglie"], canopy: ["parete", "pareti"], interrow: ["interfilare", "interfilari"] };
  const n = new Map<FindKind, number>();
  for (const f of finds) n.set(f.kind, (n.get(f.kind) ?? 0) + 1);
  return [...n].map(([k, c]) => `${c} ${names[k][c === 1 ? 0 : 1]}`).join(" · ");
}

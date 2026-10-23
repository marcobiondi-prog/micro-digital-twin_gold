import { useSyncExternalStore } from "react";
import type { ArKind } from "@/models/ar-focus";
import { coolingLabel } from "@/models/ar-placement";
import type { ReferencePhoto, ReferenceVideo } from "@/models/ar-reference-photo";

/**
 * Every completed AI camera scan, per flow, kept for the report whether or not a photo was taken.
 * Module level (survives closing the camera and switching Lab tabs) and mirrored to sessionStorage,
 * so a reload in the same session keeps it; like other guest data it is session-only.
 */
export type ScanSpecies = {
  commonName: string; scientificName: string; family: string | null; level: string;
  /** Per specimen; null when the species has no cooling estimate. */
  cooling: number | null; shade: number | null;
  /** Reference photo from a botanical database (Kew POWO or GBIF); absent on older records. */
  photo?: ReferencePhoto | null;
  /** Wikimedia Commons video of the species, when one exists. */
  video?: ReferenceVideo | null;
};
export type ScanSoil = { label: string; permeability: string; plantable: boolean; note: string };
export type ScanRecord = {
  id: string; at: string; kind: ArKind;
  /** The camera tab, e.g. "Alberi e ombra". */
  target: string; context: string;
  /** The status line shown at the end of the scan. */
  result: string;
  species: ScanSpecies | null; soil: ScanSoil | null;
  /** Specimens counted in the balance, updated while the scan stays on screen. */
  count: number; totalCooling: number | null; totalShade: number | null;
  satellite: string | null;
};

export const MAX_SCAN_RECORDS = 60;
const KEY = (k: ArKind) => `micro-digital-twin-ar-scans:${k}`;
const state: Record<ArKind, ScanRecord[]> = { urban: [], vineyard: [] };
const hydrated: Record<ArKind, boolean> = { urban: false, vineyard: false };
const subs = new Set<() => void>();
const EMPTY: ScanRecord[] = [];

function storage(): Storage | null {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
}
function hydrate(k: ArKind) {
  if (hydrated[k]) return;
  hydrated[k] = true;
  try {
    const saved = JSON.parse(storage()?.getItem(KEY(k)) ?? "[]");
    if (Array.isArray(saved)) state[k] = saved.filter((r): r is ScanRecord => !!r && typeof r.id === "string").slice(-MAX_SCAN_RECORDS);
  } catch { /* corrupted or unavailable: start empty */ }
}
// Real photo of each scan (a light JPEG of the cropped frame), kept apart from the records under its own
// sessionStorage key so a reload keeps it; memory only when storage is full. Esito shows it again when the
// summary is swiped back to that scan.
const PHOTO_KEY = (id: string) => `micro-digital-twin-ar-scan-photo:${id}`;
const photos = new Map<string, string>();
export function scanPhoto(id: string): string | null {
  const cached = photos.get(id);
  if (cached) return cached;
  try {
    const saved = storage()?.getItem(PHOTO_KEY(id));
    if (saved) photos.set(id, saved);
    return saved ?? null;
  } catch { return null; }
}
function savePhoto(id: string, photo: string) {
  photos.set(id, photo);
  try { storage()?.setItem(PHOTO_KEY(id), photo); } catch { /* quota or private mode: memory only */ }
}
// Mini video of the scanned plant (a few seconds of the camera, object URL): memory only, a blob does not
// survive a reload.
const clips = new Map<string, string>();
export function scanClip(id: string): string | null { return clips.get(id) ?? null; }
export function setScanClip(id: string, url: string) {
  if (!state.urban.some((r) => r.id === id) && !state.vineyard.some((r) => r.id === id)) { URL.revokeObjectURL(url); return; }
  const old = clips.get(id);
  if (old && old !== url) URL.revokeObjectURL(old);
  clips.set(id, url);
  subs.forEach((f) => f());
}
function dropPhoto(id: string) {
  const clip = clips.get(id);
  if (clip) { URL.revokeObjectURL(clip); clips.delete(id); }
  photos.delete(id);
  try { storage()?.removeItem(PHOTO_KEY(id)); } catch { /* unavailable */ }
}

function commit(k: ArKind, next: ScanRecord[]) {
  const dropped = state[k];
  state[k] = next.slice(-MAX_SCAN_RECORDS);
  const kept = new Set(state[k].map((r) => r.id));
  for (const r of dropped) if (!kept.has(r.id)) dropPhoto(r.id);
  try { storage()?.setItem(KEY(k), JSON.stringify(state[k])); } catch { /* quota or private mode: memory only */ }
  subs.forEach((f) => f());
}

export function currentScans(k: ArKind): ScanRecord[] { hydrate(k); return state[k]; }

/** Adds a scan and returns its id, used to keep its specimen count up to date. */
export function recordScan({ photo, ...record }: Omit<ScanRecord, "id" | "at"> & { at?: string; photo?: string | null }): string {
  hydrate(record.kind);
  const id = `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  if (photo) savePhoto(id, photo);
  commit(record.kind, [...state[record.kind], { ...record, id, at: record.at ?? new Date().toISOString() }]);
  return id;
}

export function updateScan(k: ArKind, id: string, patch: Partial<Pick<ScanRecord, "count" | "totalCooling" | "totalShade">>) {
  hydrate(k);
  const i = state[k].findIndex((r) => r.id === id);
  const prev = state[k][i];
  if (!prev || (Object.keys(patch) as (keyof typeof patch)[]).every((key) => prev[key] === patch[key])) return;
  const next = state[k].slice();
  next[i] = { ...prev, ...patch };
  commit(k, next);
}

export function clearScans(k: ArKind) { hydrate(k); commit(k, []); }

export function useArScans(k: ArKind): ScanRecord[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => currentScans(k), () => EMPTY);
}

/** Report rows: "1. 14:32 · Alberi e ombra" → "Leccio (Quercus ilex) · specie probabile · 3 esemplari · ≈ −1,2 °C · ombra ≈ 150 m²". */
export function scanReportRows(records: readonly ScanRecord[]): [string, string][] {
  return records.map((r, i) => {
    const time = new Date(r.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const parts: string[] = [];
    if (r.species) {
      parts.push(`${r.species.commonName} (${r.species.scientificName}${r.species.family ? `, ${r.species.family}` : ""}) · ${r.species.level.toLowerCase()}`);
      if (r.species.cooling !== null) {
        parts.push(`per esemplare ${coolingLabel(r.species.cooling)}`);
        if (r.count > 0 && r.totalCooling !== null) parts.push(`${r.count} ${r.count === 1 ? "esemplare" : "esemplari"} ${coolingLabel(r.totalCooling)}${r.totalShade !== null ? ` · ombra ≈ ${Math.round(r.totalShade)} m²` : ""}`);
      }
    }
    if (r.soil) parts.push(`suolo ${r.soil.label} · permeabilità ${r.soil.permeability} · ${r.soil.plantable ? "piantabile" : "non piantabile"}${r.soil.note ? ` · ${r.soil.note}` : ""}`);
    if (!parts.length) parts.push(r.result);
    if (r.satellite) parts.push(r.satellite);
    return [`${i + 1}. ${time} · ${r.target}`, `${r.context ? `${r.context} · ` : ""}${parts.join(" · ")}`];
  });
}
